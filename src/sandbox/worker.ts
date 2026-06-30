import type { CombatState } from "../game/state";
import { applyAction, type Action } from "../game/actions";
import { CARDS, type CardId } from "../game/cards";

export interface UnlockFunctions {
  deckInfo: boolean;   // myDeck() myHand() myDrawPile() myDiscard()
  endTurn: boolean;    // endTurn()
  functionKw: boolean; // function キーワード
  arrowFn: boolean;    // () => {} アロー関数
}

export interface DeckSnapshot {
  full: CardId[];
  drawPile: CardId[];
  discardPile: CardId[];
  hand: CardId[];
}

export interface RunRequest {
  code: string;
  prefixCode?: string;
  state: CombatState;
  hand: CardId[];
  unlocks: UnlockFunctions;
  deckSnapshot?: DeckSnapshot;
  drawPile?: CardId[];
  discardPile?: CardId[];
  characterCards?: CardId[];
}

export interface RunResult {
  actions: Action[];
  finalState: CombatState;
  error?: string;
  info?: string;
  consoleLogs: string[];
  endTurnCalled?: boolean;
  cyclerCalled?: number;
  finalHand?: CardId[];
  finalDrawPile?: CardId[];
  finalDiscardPile?: CardId[];
  recursionTriggered?: boolean;
  disposedCardIds?: CardId[];
}

class OutOfEnergy extends Error {}
class EndTurnSignal extends Error {}
class CyclerSignal extends Error {
  constructor(public readonly n: number) { super(); }
}
class ForceQuitSignal extends Error {}
class RecursionSignal extends Error {}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getCardCost(id: CardId): number {
  switch (id) {
    // Legacy
    case "attack": return 0; // dynamic
    case "block": return 0;  // dynamic
    case "heal": return 0;   // dynamic
    case "execute": return 3;
    case "vulnerable": return 2;
    case "poison": return 0; // dynamic
    case "pierce": return 0; // dynamic
    case "shatter": return 2;
    case "drain": return 0;  // dynamic
    case "nullify": return 3;
    case "overload": return 0; // dynamic
    case "reboot": return 0;
    case "combo": return 0;  // dynamic
    case "debug": return 0;
    case "cycler": return 0;
    // LR Starter
    case "lrAttack": return 1;
    case "lrBlock": return 1;
    case "quickScan": return 1;
    // LR Common
    case "initialize": return 1;
    case "noop": return 0;
    case "shift": return 0;
    case "sleep": return 1;
    case "forceQuit": return 1;
    case "overClock": return 0;
    case "ping": return 1;
    case "incrementalAttack": return 2;
    case "refactoring": return 1;
    case "patch": return 0;
    // LR Uncommon
    case "incrementalBlock": return 2;
    case "conditionalBlock": return 1;
    case "bufferOverflowProtection": return 1;
    case "asyncDraw": return 1;
    case "caching": return 0;
    case "multiThreading": return 2;
    case "garbageCollection": return 1;
    // LR Rare
    case "recursion": return 3;
    case "asyncAwait": return 2;
    case "stackOverflow": return 1;
    case "lrExecute": return 3;
    case "compilerOptimization": return 2;
  }
}

function run(req: RunRequest): RunResult {
  const state: CombatState = req.state;
  const actions: Action[]  = [];
  const consoleLogs: string[] = [];
  const disposedCardIds: CardId[] = [];

  // Runtime deck state
  let runtimeHand: CardId[]        = [...req.hand];
  let runtimeDrawPile: CardId[]    = req.drawPile ? [...req.drawPile] : [];
  let runtimeDiscardPile: CardId[] = req.discardPile ? [...req.discardPile] : [];

  // Cost reductions (for refactoring)
  const costReductions: Record<string, number> = {};

  // ── コード機能の制限チェック ──────────────────────────────────────
  if (!req.unlocks.functionKw && /\bfunction\b/.test(req.code)) {
    return { actions: [], finalState: state, consoleLogs,
      error: "「function」キーワードはまだアンロックされていません" };
  }
  if (!req.unlocks.arrowFn && /=>/.test(req.code)) {
    return { actions: [], finalState: state, consoleLogs,
      error: "「アロー関数（=>）」はまだアンロックされていません" };
  }

  // ── 静的解析: Unique カードのみチェック ─────────────────────────
  const codeForStaticCheck = req.prefixCode
    ? `${req.prefixCode}\n\n${req.code}`
    : req.code;

  // Unique カードのfn名 → max 1 write
  const uniqueFns = new Set<string>();
  for (const id of req.hand) {
    const def = CARDS[id];
    if (def && def.attributes.includes("unique")) {
      uniqueFns.add(def.fn);
    }
  }
  // Legacy single-use
  if (req.hand.includes("reboot")) uniqueFns.add("reboot");
  if (req.hand.includes("cycler")) uniqueFns.add("cycler");

  for (const fnName of uniqueFns) {
    const regex  = new RegExp(`\\b${fnName}\\s*\\(`, "g");
    const written = (codeForStaticCheck.match(regex) ?? []).length;
    if (written > 1) {
      return {
        actions: [], finalState: state, consoleLogs,
        error: `「${fnName}」は1ターンに1回しかコードに書けません（${written}回書かれています）`,
      };
    }
  }

  // ── ヘルパ ──────────────────────────────────────────────────────
  const effectiveCost = (id: CardId, baseCost: number): number => {
    if (state.costZeroCardIds.includes(id)) return 0;
    const reduction = costReductions[id] ?? 0;
    return Math.max(0, baseCost - reduction);
  };

  const drawCards = (n: number): void => {
    for (let i = 0; i < n; i++) {
      if (runtimeDrawPile.length === 0) {
        if (runtimeDiscardPile.length === 0) break;
        runtimeDrawPile = shuffle(runtimeDiscardPile);
        runtimeDiscardPile = [];
      }
      const card = runtimeDrawPile.pop();
      if (card) runtimeHand.push(card);
    }
  };

  const record = (a: Action, label: string) => {
    const cost = a.cost;
    if (cost > state.energy) {
      throw new OutOfEnergy(
        `エネルギー不足: ${label} には ${cost} 必要ですが残り ${state.energy} です`,
      );
    }
    applyAction(state, a);
    actions.push(a);
  };

  const checkUnique = (id: CardId): void => {
    const def = CARDS[id];
    if (!def) return;
    if (!def.attributes.includes("unique")) return;
    if (state.uniqueUsedThisTurn.includes(id)) {
      throw new Error(`「${def.fn}」は1ターンに1回しか使えません（Unique）`);
    }
    state.uniqueUsedThisTurn.push(id);
  };

  const checkInHand = (id: CardId): void => {
    if (!runtimeHand.includes(id)) {
      const def = CARDS[id];
      throw new Error(`「${def?.fn ?? id}」は手札にありません`);
    }
  };

  const disposeCard = (id: CardId): void => {
    const idx = runtimeHand.indexOf(id);
    if (idx !== -1) runtimeHand.splice(idx, 1);
    disposedCardIds.push(id);
  };

  // コンボ加算（各カード呼び出し後）
  const addCombo = (): void => {
    state.comboCount += state.comboIncrement;
  };

  const num = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));

  let rebootUsed = req.state.rebootUsedThisTurn;

  // ── カード関数の定義 ──────────────────────────────────────────────

  // Legacy cards
  const legacyLib: Record<string, (...args: unknown[]) => void> = {
    attack: (n) => {
      const a = num(n);
      checkInHand("attack");
      record({ kind: "attack", amount: a, cost: a }, `attack(${a})`);
      addCombo();
    },
    block: (n) => {
      const a = num(n);
      checkInHand("block");
      record({ kind: "block", amount: a, cost: a }, `block(${a})`);
      addCombo();
    },
    heal: (n) => {
      const a = num(n);
      checkInHand("heal");
      record({ kind: "heal", amount: a, cost: a }, `heal(${a})`);
      addCombo();
    },
    poison: (n) => {
      const a = num(n);
      checkInHand("poison");
      record({ kind: "poison", amount: a, cost: a }, `poison(${a})`);
      addCombo();
    },
    pierce: (n) => {
      const a = num(n);
      checkInHand("pierce");
      record({ kind: "pierce", amount: a, cost: a }, `pierce(${a})`);
      addCombo();
    },
    drain: (n) => {
      const a = num(n);
      checkInHand("drain");
      record({ kind: "drain", amount: a, cost: a + 1 }, `drain(${a})`);
      addCombo();
    },
    overload: (n) => {
      const a = num(n);
      checkInHand("overload");
      record({ kind: "overload", amount: a, cost: a }, `overload(${a})`);
      addCombo();
    },
    execute: () => {
      // Could be legacy execute or lrExecute - check which is in hand
      if (runtimeHand.includes("lrExecute")) {
        checkInHand("lrExecute");
        checkUnique("lrExecute");
        const cost = effectiveCost("lrExecute", 3);
        record({ kind: "lrExecute", cost, comboCount: state.comboCount }, "execute()");
        addCombo();
      } else {
        checkInHand("execute");
        record({ kind: "execute", cost: 3 }, "execute()");
        addCombo();
      }
    },
    vulnerable: () => {
      checkInHand("vulnerable");
      record({ kind: "vulnerable", cost: 2 }, "vulnerable()");
      addCombo();
    },
    shatter: () => {
      checkInHand("shatter");
      record({ kind: "shatter", cost: 2 }, "shatter()");
      addCombo();
    },
    nullify: () => {
      checkInHand("nullify");
      record({ kind: "nullify", cost: 3 }, "nullify()");
      addCombo();
    },
    reboot: () => {
      if (rebootUsed) {
        consoleLogs.push("[warn] reboot: このターンすでに使用済みです");
        return;
      }
      checkInHand("reboot");
      rebootUsed = true;
      record({ kind: "reboot", cost: 0 }, "reboot()");
      addCombo();
    },
    combo: (n) => {
      const amount = num(n);
      if (amount <= 0) return;
      checkInHand("combo");
      const k = state.comboCount + 1;
      record({ kind: "combo", n: amount, k, cost: amount }, `combo(${amount})`);
      addCombo();
    },
    debug: () => {
      const e = state.enemy;
      consoleLogs.push(
        `[debug] HP:${e.hp}/${e.maxHp} ブロック:${e.block} 毒:${e.poison} 意図:${e.intent.kind}(${e.intent.value})`,
      );
      addCombo();
    },
    cycler: (n) => {
      const a = num(n);
      if (a <= 0) return;
      checkInHand("cycler");
      checkUnique("cycler");
      throw new CyclerSignal(a);
    },
  };

  // Loop Runner cards
  const lrLib: Record<string, (...args: unknown[]) => void> = {
    quickScan: () => {
      checkInHand("quickScan");
      const cost = effectiveCost("quickScan", 1);
      record({ kind: "quickScan", cost }, "quickScan()");
      addCombo();
      drawCards(1);
    },
    initialize: () => {
      checkInHand("initialize");
      const cost = effectiveCost("initialize", 1);
      record({ kind: "initialize", cost }, "initialize()");
      addCombo();
    },
    noop: () => {
      checkInHand("noop");
      checkUnique("noop");
      const cost = effectiveCost("noop", 0);
      record({ kind: "noop", cost }, "noop()");
      addCombo();
    },
    shift: () => {
      checkInHand("shift");
      checkUnique("shift");
      const cost = effectiveCost("shift", 0);
      // Find first non-shift card in hand to discard
      const discardIdx = runtimeHand.findIndex(id => id !== "shift");
      if (discardIdx !== -1) {
        runtimeDiscardPile.push(runtimeHand[discardIdx]);
        runtimeHand.splice(discardIdx, 1);
      }
      record({ kind: "shift", cost }, "shift()");
      addCombo();
      drawCards(1);
    },
    sleep: () => {
      checkInHand("sleep");
      const cost = effectiveCost("sleep", 1);
      record({ kind: "sleep", cost }, "sleep()");
      addCombo();
    },
    forceQuit: () => {
      checkInHand("forceQuit");
      const cost = effectiveCost("forceQuit", 1);
      record({ kind: "forceQuit", cost }, "forceQuit()");
      addCombo();
      throw new ForceQuitSignal();
    },
    overClock: () => {
      checkInHand("overClock");
      const cost = effectiveCost("overClock", 0);
      // Apply effects directly then record with cost 0
      state.player.hp = Math.max(0, state.player.hp - 2);
      state.energy = Math.min(state.maxEnergy, state.energy + 1 - cost); // cost already 0
      // Use a reboot-like approach: record the action manually
      actions.push({ kind: "overClock", cost });
      addCombo();
    },
    ping: () => {
      checkInHand("ping");
      const cost = effectiveCost("ping", 1);
      const comboCount = state.comboCount;
      const extra = state.asyncAwaitActive ? comboCount : 0;
      record({ kind: "ping", cost, comboCount: comboCount + extra }, "ping()");
      addCombo();
    },
    incrementalAttack: () => {
      checkInHand("incrementalAttack");
      const cost = effectiveCost("incrementalAttack", 2);
      const comboCount = state.comboCount;
      const extra = state.asyncAwaitActive ? comboCount : 0;
      record({ kind: "incrementalAttack", cost, comboCount: comboCount + extra }, "incrementalAttack()");
      addCombo();
    },
    refactoring: () => {
      checkInHand("refactoring");
      const cost = effectiveCost("refactoring", 1);
      // Find top 2 highest cost cards in hand
      const handCosts = runtimeHand
        .filter(id => id !== "refactoring")
        .map(id => ({ id, cost: getCardCost(id) }))
        .sort((a, b) => b.cost - a.cost);
      const toReduce = handCosts.slice(0, 2);
      for (const { id } of toReduce) {
        costReductions[id] = (costReductions[id] ?? 0) + 1;
      }
      record({ kind: "refactoring", cost }, "refactoring()");
      addCombo();
    },
    patch: () => {
      checkInHand("patch");
      const cost = effectiveCost("patch", 0);
      record({ kind: "patch", cost }, "patch()");
      addCombo();
      disposeCard("patch");
    },
    incrementalBlock: () => {
      checkInHand("incrementalBlock");
      checkUnique("incrementalBlock");
      const cost = effectiveCost("incrementalBlock", 2);
      record({ kind: "incrementalBlock", cost, comboCount: state.comboCount }, "incrementalBlock()");
      addCombo();
    },
    conditionalBlock: () => {
      checkInHand("conditionalBlock");
      const cost = effectiveCost("conditionalBlock", 1);
      record({ kind: "conditionalBlock", cost, comboCount: state.comboCount }, "conditionalBlock()");
      addCombo();
    },
    bufferOverflowProtection: () => {
      checkInHand("bufferOverflowProtection");
      const cost = effectiveCost("bufferOverflowProtection", 1);
      // Discard first non-bufferOverflowProtection card
      const discardIdx = runtimeHand.findIndex(id => id !== "bufferOverflowProtection");
      if (discardIdx !== -1) {
        runtimeDiscardPile.push(runtimeHand[discardIdx]);
        runtimeHand.splice(discardIdx, 1);
      }
      record({ kind: "bufferOverflowProtection", cost }, "bufferOverflowProtection()");
      addCombo();
    },
    asyncDraw: () => {
      checkInHand("asyncDraw");
      const cost = effectiveCost("asyncDraw", 1);
      record({ kind: "asyncDraw", cost }, "asyncDraw()");
      addCombo();
      const drawN = state.comboCount >= 5 ? 3 : 1;
      drawCards(drawN);
    },
    caching: () => {
      checkInHand("caching");
      checkUnique("caching");
      const cost = effectiveCost("caching", 0);
      // Find highest cost card in hand (excluding caching itself)
      const candidates = runtimeHand
        .filter(id => id !== "caching")
        .map(id => ({ id, cost: getCardCost(id) }))
        .sort((a, b) => b.cost - a.cost);
      if (candidates.length > 0) {
        state.cachedCardId = candidates[0].id;
      }
      record({ kind: "caching", cost }, "caching()");
      addCombo();
    },
    multiThreading: () => {
      checkInHand("multiThreading");
      checkUnique("multiThreading");
      const cost = effectiveCost("multiThreading", 2);
      // Extra combo +2 (total +3 including addCombo below)
      state.comboCount += 2;
      record({ kind: "multiThreading", cost }, "multiThreading()");
      addCombo();
      drawCards(1);
    },
    garbageCollection: () => {
      checkInHand("garbageCollection");
      const cost = effectiveCost("garbageCollection", 1);
      // Find non-attribute card from discard
      const noAttrIdx = runtimeDiscardPile.findIndex(id => {
        const def = CARDS[id];
        return def && def.attributes.length === 0;
      });
      if (noAttrIdx !== -1) {
        const recovered = runtimeDiscardPile[noAttrIdx];
        runtimeDiscardPile.splice(noAttrIdx, 1);
        runtimeHand.push(recovered);
        state.costZeroCardIds.push(recovered);
      }
      record({ kind: "garbageCollection", cost }, "garbageCollection()");
      addCombo();
      disposeCard("garbageCollection");
    },
    recursion: () => {
      checkInHand("recursion");
      checkUnique("recursion");
      const cost = effectiveCost("recursion", 3);
      record({ kind: "recursion", cost }, "recursion()");
      addCombo();
      disposeCard("recursion");
      throw new RecursionSignal();
    },
    asyncAwait: () => {
      checkInHand("asyncAwait");
      const cost = effectiveCost("asyncAwait", 2);
      record({ kind: "asyncAwait", cost }, "asyncAwait()");
      addCombo();
      disposeCard("asyncAwait");
    },
    stackOverflow: () => {
      checkInHand("stackOverflow");
      const cost = effectiveCost("stackOverflow", 1);
      record({ kind: "stackOverflow", cost }, "stackOverflow()");
      addCombo();
      disposeCard("stackOverflow");
    },
    compilerOptimization: () => {
      checkInHand("compilerOptimization");
      checkUnique("compilerOptimization");
      const cost = effectiveCost("compilerOptimization", 2);
      record({ kind: "compilerOptimization", cost }, "compilerOptimization()");
      addCombo();
      drawCards(3);
      // Add all non-unique cards currently in hand to costZeroCardIds
      for (const id of runtimeHand) {
        const def = CARDS[id];
        if (def && def.attributes.length === 0 && !state.costZeroCardIds.includes(id)) {
          state.costZeroCardIds.push(id);
        }
      }
    },
  };

  // LR attack/block overrides (no-arg versions)
  const lrAttackFn = (): void => {
    if (runtimeHand.includes("lrAttack")) {
      checkInHand("lrAttack");
      const cost = effectiveCost("lrAttack", 1);
      const baseDmg = 6;
      const dmg = state.asyncAwaitActive ? baseDmg + state.comboCount : baseDmg;
      // We store the asyncAwait bonus in the action via lrAttack kind
      record({ kind: "lrAttack", cost }, "attack()");
      // Apply asyncAwait bonus manually since action already applied base damage
      if (state.asyncAwaitActive && dmg > baseDmg) {
        const bonus = dmg - baseDmg;
        const raw = state.enemy.vulnerable > 0 ? Math.floor(bonus * 1.5) : bonus;
        let rem = raw;
        if (state.enemy.block > 0) {
          const absorbed = Math.min(state.enemy.block, rem);
          state.enemy.block -= absorbed;
          rem -= absorbed;
        }
        state.enemy.hp = Math.max(0, state.enemy.hp - rem);
      }
      addCombo();
    } else {
      legacyLib.attack!(0);
    }
  };

  const lrBlockFn = (): void => {
    if (runtimeHand.includes("lrBlock")) {
      checkInHand("lrBlock");
      const cost = effectiveCost("lrBlock", 1);
      record({ kind: "lrBlock", cost }, "block()");
      addCombo();
    } else {
      legacyLib.block!(0);
    }
  };

  const readApi: Record<string, () => unknown> = {
    enemyHp:     () => state.enemy.hp,
    myHp:        () => state.player.hp,
    energy:      () => state.energy,
    enemyBlock:  () => state.enemy.block,
    enemyIntent: () => ({ ...state.enemy.intent }),
  };

  if (req.unlocks.deckInfo && req.deckSnapshot) {
    const snap = req.deckSnapshot;
    readApi["myDeck"]      = () => [...snap.full];
    readApi["myHand"]      = () => [...runtimeHand];
    readApi["myDrawPile"]  = () => [...runtimeDrawPile];
    readApi["myDiscard"]   = () => [...runtimeDiscardPile];
  }

  if (req.unlocks.endTurn) {
    readApi["endTurn"] = () => { throw new EndTurnSignal(); };
  }

  const fmt = (...args: unknown[]) =>
    args.map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v))).join(" ");
  const mockConsole = {
    log:   (...a: unknown[]) => consoleLogs.push(fmt(...a)),
    warn:  (...a: unknown[]) => consoleLogs.push("[warn] "  + fmt(...a)),
    error: (...a: unknown[]) => consoleLogs.push("[error] " + fmt(...a)),
  };

  // ── API 注入 ─────────────────────────────────────────────────────
  const apiNames: string[]   = ["console"];
  const apiValues: unknown[] = [mockConsole];

  // Determine which cards to expose
  // If characterCards provided, expose all of them (runtime hand check controls access)
  if (req.characterCards && req.characterCards.length > 0) {
    const exposed = new Set<string>();

    for (const id of req.characterCards) {
      const def = CARDS[id];
      if (!def) continue;
      const fnName = def.fn;
      if (exposed.has(fnName)) continue;
      exposed.add(fnName);

      // Special cases for attack/block which can be legacy OR lr
      if (fnName === "attack") {
        apiNames.push("attack");
        apiValues.push(lrAttackFn);
      } else if (fnName === "block") {
        apiNames.push("block");
        apiValues.push(lrBlockFn);
      } else if (fnName === "execute") {
        // execute is handled in legacyLib; skip here, added below
      } else if (lrLib[fnName]) {
        apiNames.push(fnName);
        apiValues.push(lrLib[fnName]);
      } else if (legacyLib[fnName]) {
        apiNames.push(fnName);
        apiValues.push(legacyLib[fnName]);
      }
    }

    // Always expose execute (handles both lrExecute and legacy execute)
    if (!exposed.has("execute")) {
      apiNames.push("execute");
      apiValues.push(legacyLib["execute"]);
    }
  } else {
    // Legacy mode: expose based on hand
    const available = new Set(req.hand);

    // Check if we have lrAttack/lrBlock
    const hasLrAttack = available.has("lrAttack");
    const hasLrBlock  = available.has("lrBlock");

    if (hasLrAttack) {
      apiNames.push("attack");
      apiValues.push(lrAttackFn);
    } else if (available.has("attack")) {
      apiNames.push("attack");
      apiValues.push(legacyLib["attack"]);
    }

    if (hasLrBlock) {
      apiNames.push("block");
      apiValues.push(lrBlockFn);
    } else if (available.has("block")) {
      apiNames.push("block");
      apiValues.push(legacyLib["block"]);
    }

    const exposed = new Set(["attack", "block"]);
    for (const id of available) {
      const def = CARDS[id];
      if (!def) continue;
      const fnName = def.fn;
      if (exposed.has(fnName)) continue;
      exposed.add(fnName);

      if (lrLib[fnName]) {
        apiNames.push(fnName);
        apiValues.push(lrLib[fnName]);
      } else if (legacyLib[fnName]) {
        apiNames.push(fnName);
        apiValues.push(legacyLib[fnName]);
      }
    }
  }

  for (const [name, fn] of Object.entries(readApi)) {
    apiNames.push(name); apiValues.push(fn);
  }

  // ── 実行 ─────────────────────────────────────────────────────────
  const execCode = req.prefixCode
    ? `${req.prefixCode}\n\n${req.code}`
    : req.code;

  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(...apiNames, `"use strict";\n${execCode}`);
    fn(...apiValues);
    return {
      actions, finalState: state, consoleLogs,
      finalHand: runtimeHand,
      finalDrawPile: runtimeDrawPile,
      finalDiscardPile: runtimeDiscardPile,
      disposedCardIds: disposedCardIds.length > 0 ? disposedCardIds : undefined,
    };
  } catch (e) {
    if (e instanceof OutOfEnergy) {
      return {
        actions, finalState: state, info: e.message, consoleLogs,
        finalHand: runtimeHand,
        finalDrawPile: runtimeDrawPile,
        finalDiscardPile: runtimeDiscardPile,
        disposedCardIds: disposedCardIds.length > 0 ? disposedCardIds : undefined,
      };
    }
    if (e instanceof EndTurnSignal) {
      return {
        actions, finalState: state, consoleLogs, endTurnCalled: true,
        finalHand: runtimeHand,
        finalDrawPile: runtimeDrawPile,
        finalDiscardPile: runtimeDiscardPile,
        disposedCardIds: disposedCardIds.length > 0 ? disposedCardIds : undefined,
      };
    }
    if (e instanceof CyclerSignal) {
      return {
        actions, finalState: state, consoleLogs, cyclerCalled: e.n,
        finalHand: runtimeHand,
        finalDrawPile: runtimeDrawPile,
        finalDiscardPile: runtimeDiscardPile,
        disposedCardIds: disposedCardIds.length > 0 ? disposedCardIds : undefined,
      };
    }
    if (e instanceof ForceQuitSignal) {
      return {
        actions, finalState: state, consoleLogs,
        finalHand: runtimeHand,
        finalDrawPile: runtimeDrawPile,
        finalDiscardPile: runtimeDiscardPile,
        disposedCardIds: disposedCardIds.length > 0 ? disposedCardIds : undefined,
      };
    }
    if (e instanceof RecursionSignal) {
      return {
        actions, finalState: state, consoleLogs,
        recursionTriggered: true,
        finalHand: runtimeHand,
        finalDrawPile: runtimeDrawPile,
        finalDiscardPile: runtimeDiscardPile,
        disposedCardIds: disposedCardIds.length > 0 ? disposedCardIds : undefined,
      };
    }
    return {
      actions,
      finalState: state,
      error: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
      consoleLogs,
      finalHand: runtimeHand,
      finalDrawPile: runtimeDrawPile,
      finalDiscardPile: runtimeDiscardPile,
      disposedCardIds: disposedCardIds.length > 0 ? disposedCardIds : undefined,
    };
  }
}

self.onmessage = (e: MessageEvent<RunRequest>) => {
  (self as unknown as Worker).postMessage(run(e.data));
};
