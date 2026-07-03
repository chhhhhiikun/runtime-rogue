import type { CombatState, EnemyIntent } from "../game/state";
import { applyAction, type Action } from "../game/actions";
import { CARDS, HAND_SIZE, getCardBaseCost, type CardId } from "../game/cards";
import type { StageGimmick } from "../game/stages";

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
  intentPattern?: EnemyIntent[];
  intentIndex?: number;
  daemonCode?: string;
  deployedCardIds?: CardId[];
  allowedFns?: string[]; // 指定時、この名前の関数のみサンドボックスに公開する（チュートリアル用）
  runDaemonAtStart?: boolean; // trueの場合、メインスクリプト実行前に一度だけDaemonを走らせる（戦闘開始時用）
  gimmick?: StageGimmick; // ステージごとの対抗ギミック設定
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
  disposedCardIds?: CardId[];
  combatResult?: "victory" | "defeat";
  finalIntentIndex?: number;
  finalDeployedCardIds?: CardId[];
  finalEnergy?: number; // deploy() 等、actionsを経由しないMain Clock変動を反映するため
}

class OutOfEnergy extends Error {}
class DaemonCostInsufficientException extends Error {}
class EndTurnSignal extends Error {}
class CyclerSignal extends Error {
  constructor(public readonly n: number) { super(); }
}
class ForceQuitSignal extends Error {}
class CombatEndSignal extends Error {
  constructor(public readonly result: "victory" | "defeat") { super(); }
}

// 静的解析（書かれた回数のカウント）でコメント内の記述を除外するための簡易コメント除去。
// 文字列リテラル内の // や /* は考慮しない簡易実装。
function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function run(req: RunRequest): RunResult {
  const state: CombatState = req.state;
  const actions: Action[]  = [];
  const consoleLogs: string[] = [];
  const disposedCardIds: CardId[] = [];

  // intentPattern for endTurn() processing
  const intentPattern: EnemyIntent[] = req.intentPattern ?? [];
  let intentIdx: number = req.intentIndex ?? 0;

  // Runtime deck state
  let runtimeHand: CardId[]        = [...req.hand];
  let runtimeDrawPile: CardId[]    = req.drawPile ? [...req.drawPile] : [];
  let runtimeDiscardPile: CardId[] = req.discardPile ? [...req.discardPile] : [];

  // Daemon: デプロイ済みカード（このターン以降 Main Thread の手札には戻らない）
  const deployedCardIds: CardId[] = req.deployedCardIds ? [...req.deployedCardIds] : [];

  // 現在どちらのスレッドとして実行中か（コスト消費元・使用可否チェックの分岐に使う）
  let execMode: "main" | "daemon" = "main";

  // Daemon が endTurn() を呼び、それがまた Daemon を呼ぶ…という再帰の深さ
  let daemonChainDepth = 0;
  const DAEMON_RECURSION_LIMIT = 50;

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

  // ── 静的解析: 手札の枚数を超えて関数名が書かれていないかチェック ──
  // 同じ関数を手札の枚数より多く「書く」ことはできない（ループの中で1回書くのはOK）。
  // Unique属性のカードは実質的に手札1枚分の制限として、この仕組みに自然に含まれる。
  const codeForStaticCheck = stripComments(req.prefixCode
    ? `${req.prefixCode}\n\n${req.code}`
    : req.code);

  const handFnCounts = new Map<string, number>();
  for (const id of req.hand) {
    const def = CARDS[id];
    if (!def) continue;
    handFnCounts.set(def.fn, (handFnCounts.get(def.fn) ?? 0) + 1);
  }

  for (const [fnName, count] of handFnCounts) {
    const regex   = new RegExp(`\\b${fnName}\\s*\\(`, "g");
    const written = (codeForStaticCheck.match(regex) ?? []).length;
    if (written > count) {
      return {
        actions: [], finalState: state, consoleLogs,
        error: `「${fnName}」は手札に${count}枚しかないため、${count}回までしかコードに書けません（${written}回書かれています）`,
      };
    }
  }

  // ── ヘルパ ──────────────────────────────────────────────────────
  const effectiveCost = (id: CardId, baseCost: number): number => {
    if (state.costZeroCardIds.includes(id)) return 0;
    const reduction = (state.costReductionMap[id] ?? 0) + (costReductions[id] ?? 0);
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

  const record = (a: Extract<Action, { cost: number }>, label: string) => {
    const cost = a.cost;
    const dmgBefore = state.damageDealtThisTurn;
    if (execMode === "daemon") {
      if (cost > state.daemonCost) {
        throw new DaemonCostInsufficientException(
          `Daemon Cost不足: ${label} には ${cost} 必要ですが残り ${state.daemonCost} です`,
        );
      }
      const daemonAction = { ...a, viaDaemon: true };
      applyAction(state, daemonAction, "daemon");
      actions.push(daemonAction);
    } else {
      if (cost > state.energy) {
        throw new OutOfEnergy(
          `エネルギー不足: ${label} には ${cost} 必要ですが残り ${state.energy} です`,
        );
      }
      applyAction(state, a);
      actions.push(a);
    }

    // 単眼看破（サイクロプス）判定用: 同じ関数(kind)が連続で呼ばれた回数を記録
    if (a.kind === state.sameActionKind) {
      state.sameActionStreak++;
    } else {
      state.sameActionKind = a.kind;
      state.sameActionStreak = 1;
    }
    const gimmick = req.gimmick;
    if (gimmick?.kind === "monotony" && state.sameActionStreak >= gimmick.streakThreshold) {
      const blockAction: Action = {
        kind: "gimmickBlock",
        amount: gimmick.blockGain,
        label: `単眼看破: 敵ブロック+${gimmick.blockGain}`,
      };
      applyAction(state, blockAction);
      actions.push(blockAction);
      state.sameActionStreak = 0;
      consoleLogs.push(`[GIMMICK] ⚠ 単眼看破！ 同じ行動を見破られ、敵がブロック+${gimmick.blockGain}を得た`);
    }

    // 禁忌の一撃（デーモン）判定用: 1回の呼び出しで与えたダメージの最大値を記録
    const dealtThisCall = state.damageDealtThisTurn - dmgBefore;
    if (dealtThisCall > state.maxSingleHitThisTurn) {
      state.maxSingleHitThisTurn = dealtThisCall;
    }
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

  const availableSource = (): CardId[] => (execMode === "daemon" ? deployedCardIds : runtimeHand);

  const checkInHand = (id: CardId): void => {
    if (!availableSource().includes(id)) {
      const def = CARDS[id];
      const place = execMode === "daemon" ? "Daemonにデプロイされて" : "手札にあり";
      throw new Error(`「${def?.fn ?? id}」は${place}ません`);
    }
  };

  const disposeCard = (id: CardId): void => {
    const idx = runtimeHand.indexOf(id);
    if (idx !== -1) runtimeHand.splice(idx, 1);
    const depIdx = deployedCardIds.indexOf(id);
    if (depIdx !== -1) deployedCardIds.splice(depIdx, 1);
    disposedCardIds.push(id);
  };

  // コンボ加算（各カード呼び出し後）
  const addCombo = (): void => {
    const beforeCombo = state.comboCount;
    state.comboCount += state.comboIncrement;

    const gimmick = req.gimmick;
    // 詠唱封印（魔道士）: コンボが閾値に達したら、以降このターンはコンボが増加しなくなる
    if (gimmick?.kind === "overcastSeal" && state.comboIncrement !== 0 && state.comboCount >= gimmick.comboThreshold) {
      state.comboIncrement = 0;
      consoleLogs.push("[GIMMICK] ⚠ 詠唱封印！ このターン、コンボがこれ以上増加しなくなった");
    }

    // 見切りの一撃（竜騎士）: コンボ数が閾値以上の状態からさらに増加させると、都度ダメージを受ける
    if (gimmick?.kind === "imbalance" && beforeCombo >= gimmick.threshold) {
      const dmgAction: Action = {
        kind: "gimmickDamage",
        amount: gimmick.damage,
        label: `見切りの一撃: ${gimmick.damage}ダメージ`,
      };
      applyAction(state, dmgAction);
      actions.push(dmgAction);
    }
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
      // Could be legacy execute or lrExecute - check which is available
      if (availableSource().includes("lrExecute")) {
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
    incrementalAttack: () => {
      checkInHand("incrementalAttack");
      const cost = effectiveCost("incrementalAttack", 2);
      record({ kind: "incrementalAttack", cost, comboCount: state.comboCount }, "incrementalAttack()");
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
      drawCards(2);
    },
    stackOverflow: () => {
      checkInHand("stackOverflow");
      checkUnique("stackOverflow");
      const cost = effectiveCost("stackOverflow", 2);
      record({ kind: "stackOverflow", cost }, "stackOverflow()");
      addCombo();
    },
    compilerOptimization: () => {
      checkInHand("compilerOptimization");
      checkUnique("compilerOptimization");
      const cost = effectiveCost("compilerOptimization", 2);
      record({ kind: "compilerOptimization", cost }, "compilerOptimization()");
      addCombo();
      drawCards(3);
      // 通常カード（属性なし）のコストを -1（min 0）にする
      for (const id of runtimeHand) {
        const def = CARDS[id];
        if (def && def.attributes.length === 0) {
          state.costReductionMap[id] = (state.costReductionMap[id] ?? 0) + 1;
        }
      }
    },
    overclockBurst: () => {
      checkInHand("overclockBurst");
      checkUnique("overclockBurst");
      const cost = effectiveCost("overclockBurst", 0);
      record({ kind: "overclockBurst", cost }, "overclockBurst()");
      addCombo();
    },
  };

  // LR attack/block overrides (no-arg versions)
  const lrAttackFn = (): void => {
    if (availableSource().includes("lrAttack")) {
      checkInHand("lrAttack");
      const cost = effectiveCost("lrAttack", 1);
      const comboAtUse = state.comboCount;
      record({ kind: "lrAttack", cost, comboCount: comboAtUse }, "attack()");
      addCombo();
    } else {
      legacyLib.attack!(0);
    }
  };

  const lrBlockFn = (): void => {
    if (availableSource().includes("lrBlock")) {
      checkInHand("lrBlock");
      const cost = effectiveCost("lrBlock", 1);
      const comboAtUse = state.comboCount;
      record({ kind: "lrBlock", cost, comboCount: comboAtUse }, "block()");
      addCombo();
    } else {
      legacyLib.block!(0);
    }
  };

  const toFnNames = (ids: CardId[]) => ids.map(id => CARDS[id]?.fn ?? id);

  const readApi: Record<string, () => unknown> = {
    enemyHp:     () => state.enemy.hp,
    myHp:        () => state.player.hp,
    myBlock:     () => state.player.block,
    mainClock:   () => state.energy,
    enemyBlock:  () => state.enemy.block,
    enemyIntent: () => ({ ...state.enemy.intent }),
    comboCount:  () => state.comboCount,
    daemonCost:  () => state.daemonCost,
    damageDealtThisTurn: () => state.damageDealtThisTurn,
    sameActionStreak:    () => state.sameActionStreak,
    comboIncrement:      () => state.comboIncrement,
    turn:                () => state.turn,
  };

  if (req.unlocks.deckInfo && req.deckSnapshot) {
    const snap = req.deckSnapshot;
    readApi["myDeck"]      = () => toFnNames([...snap.full]);
    readApi["myHand"]      = () => toFnNames([...runtimeHand]);
    readApi["myDrawPile"]  = () => toFnNames([...runtimeDrawPile]);
    readApi["myDiscard"]   = () => toFnNames([...runtimeDiscardPile]);
    readApi["myDeployed"]  = () => toFnNames([...deployedCardIds]);
  }

  // endTurn() は常にアンロック済み。intentPattern が渡されている場合は
  // 敵ターン処理をワーカー内で完結させ、なければ従来の EndTurnSignal を投げる。
  if (intentPattern.length > 0) {
    readApi["endTurn"] = (): void => {
      // 敵が既に死んでいれば即勝利
      if (state.enemy.hp <= 0) throw new CombatEndSignal("victory");

      // 毒ダメージ
      const poisonDmg = state.enemy.poison > 0 ? state.enemy.poison : 0;

      // 次のインテントを決定
      const nextIdx = (intentIdx + 1) % intentPattern.length;
      let nextIntent: EnemyIntent = { ...intentPattern[nextIdx] };

      // 敵ギミック: ターン終了時点の状態を見て、次の意図を書き換える
      const gimmick = req.gimmick;
      let gimmickLogLabel: string | null = null;
      switch (gimmick?.kind) {
        case "overkill":
          // 過負荷反撃（ウェアウルフ）: このターンの合計被ダメが閾値以上なら次の意図を強化する
          if (state.damageDealtThisTurn >= gimmick.threshold) {
            nextIntent = { ...nextIntent, value: Math.round(nextIntent.value * gimmick.multiplier), boosted: true };
            gimmickLogLabel = "過負荷反撃";
          }
          break;
        case "overguard":
          // 装甲貫通（ゴーレム）: 自分ブロックが閾値以上残っているなら次の敵攻撃はブロック無視
          if (state.player.block >= gimmick.threshold) {
            nextIntent = { ...nextIntent, ignoresBlock: true };
            gimmickLogLabel = "装甲貫通";
          }
          break;
        case "burstSpike":
          // 禁忌の一撃（デーモン）: このターンの単発最大ダメージが閾値以上なら次の意図を強化する
          if (state.maxSingleHitThisTurn >= gimmick.threshold) {
            nextIntent = { ...nextIntent, value: Math.round(nextIntent.value * gimmick.multiplier), boosted: true };
            gimmickLogLabel = "禁忌の一撃";
          }
          break;
        case "enrage": {
          // 覚醒（ドラゴン）: ターン数が閾値を超過した分だけ次の意図を強化する
          // （コンボ増加量の減衰は下の次ターン準備部分で、ターン数から決定的に算出する）
          const over = state.turn - gimmick.turnThreshold + 1;
          if (over > 0) {
            const mult = 1 + over * gimmick.multiplierPerTurn;
            nextIntent = { ...nextIntent, value: Math.round(nextIntent.value * mult), boosted: true };
            gimmickLogLabel = "覚醒";
          }
          break;
        }
        // monotony（サイクロプス）と imbalance（竜騎士）はカード使用の都度、即時に処理されるため
        // ターン終了時のチェックは不要
        default:
          break;
      }
      if (gimmickLogLabel) {
        consoleLogs.push(`[GIMMICK] ⚠ ${gimmickLogLabel}発動！ 次の敵の行動が変化した`);
      }

      // enemyTurn アクションを記録（main.ts側でアニメーション再生用）
      const currentIntent = { ...state.enemy.intent };

      // 実際に与えられるダメージ（ブロック軽減後）を先に計算し、ログに反映する
      let actualDmg = currentIntent.value;
      let blockedAmount = 0;
      if (currentIntent.kind === "attack") {
        if (!currentIntent.ignoresBlock && state.player.block > 0) {
          blockedAmount = Math.min(state.player.block, actualDmg);
          actualDmg -= blockedAmount;
        }
      }

      const attackLabel = currentIntent.kind === "block"
        ? `敵はブロック +${currentIntent.value} を得た`
        : currentIntent.ignoresBlock
          ? `⚔ 装甲貫通攻撃！ ブロックを無視してあなたに ${actualDmg} ダメージ`
          : currentIntent.boosted
            ? `⚠ 敵の意図が強化されている！ あなたに ${actualDmg} ダメージ${blockedAmount > 0 ? `（${blockedAmount}ダメージをブロック）` : ""}`
            : `敵の攻撃！ あなたに ${actualDmg} ダメージ${blockedAmount > 0 ? `（${blockedAmount}ダメージをブロック）` : ""}`;
      actions.push({
        kind: "enemyTurn",
        intent: currentIntent,
        nextIntent,
        label: attackLabel,
        poisonDmg,
      });

      // ワーカー内 state にも同じ変更を適用（以降のカード判定で正確な状態を使うため）
      if (poisonDmg > 0) {
        state.enemy.hp = Math.max(0, state.enemy.hp - poisonDmg);
        state.enemy.poison = Math.max(0, state.enemy.poison - 1);
      }
      state.enemy.vulnerable = 0;
      if (currentIntent.kind === "block") {
        state.enemy.block += currentIntent.value;
      } else {
        state.player.block -= blockedAmount;
        state.player.hp = Math.max(0, state.player.hp - actualDmg);
      }

      // 次ターン準備（Main Clock・コンボ等）
      state.player.block       = 0;
      state.energy             = state.maxEnergy + state.nextTurnExtraEnergy;
      state.nextTurnExtraEnergy = 0;
      state.comboCount         = 0;
      state.comboIncrement     = 1;
      state.asyncAwaitActive   = false;
      state.rebootUsedThisTurn = false;
      state.uniqueUsedThisTurn = [];
      state.costZeroCardIds    = [];
      state.costReductionMap   = {};
      state.damageDealtThisTurn = 0;
      state.sameActionKind      = null;
      state.sameActionStreak    = 0;
      state.maxSingleHitThisTurn = 0;
      state.turn++;
      intentIdx = nextIdx;
      state.enemy.intent = nextIntent;

      // 覚醒（ドラゴン）: 次に迎えるターンが閾値を超過している分だけ、
      // コンボ増加量の初期値を段階的に減衰させる（ターン数から決定的に算出するため、毎ターン安全に再計算できる）
      if (gimmick?.kind === "enrage") {
        const overNext = state.turn - gimmick.turnThreshold;
        if (overNext > 0) {
          state.comboIncrement = Math.max(0, 1 - overNext * gimmick.comboIncrementDecay);
        }
      }

      // 手札を全捨て札 → 5枚(+ボーナス)ドロー
      runtimeDiscardPile.push(...runtimeHand);
      runtimeHand = [];
      const drawCount = HAND_SIZE + state.nextTurnExtraDraws;
      state.nextTurnExtraDraws = 0;
      drawCards(drawCount);

      // Daemon Cost 回復 → Daemon自動実行
      runDaemonOnce();

      // 勝敗判定
      if (state.enemy.hp <= 0) throw new CombatEndSignal("victory");
      if (state.player.hp <= 0) throw new CombatEndSignal("defeat");
    };
  } else {
    // intentPattern 未設定時は従来通り EndTurnSignal
    readApi["endTurn"] = () => { throw new EndTurnSignal(); };
  }

  // isUsable(fnName): カードが今のターン使用可能かどうか
  const isUsableFn = (fn: unknown): boolean => {
    const fnName = String(fn);
    const id = availableSource().find(cid => CARDS[cid]?.fn === fnName);
    if (!id) return false;
    const def = CARDS[id];
    if (!def) return false;
    if (def.attributes.includes("unique") && state.uniqueUsedThisTurn.includes(id)) return false;
    return true;
  };

  // deploy(fnName): 手札のカードをコードからDaemonへ常駐化する（Main/Daemon両方から呼べる）
  const DAEMON_DEPLOY_BLOCKED_FNS = ["forceQuit", "cycler"];
  const deployFn = (fn: unknown): void => {
    const fnName = String(fn);
    if (DAEMON_DEPLOY_BLOCKED_FNS.includes(fnName)) {
      throw new Error(`「${fnName}」はDaemonにデプロイできません`);
    }
    const id = runtimeHand.find(cid => CARDS[cid]?.fn === fnName);
    if (!id) {
      throw new Error(`「${fnName}」は手札に見つかりません`);
    }
    const cost = getCardBaseCost(id) * 2;
    if (state.energy < cost) {
      throw new OutOfEnergy(
        `Main Clock不足: 「${fnName}」のデプロイには ${cost} 必要ですが残り ${state.energy} です`,
      );
    }
    state.energy -= cost;
    const idx = runtimeHand.indexOf(id);
    runtimeHand.splice(idx, 1);
    deployedCardIds.push(id);
    consoleLogs.push(`✅ 「${fnName}」をDaemonへデプロイしました（Main Clock -${cost}）`);
  };

  // Daemon: 毎ターン開始時、手札ドロー後に自動実行される
  const runDaemonOnce = (): void => {
    state.daemonCost = state.maxDaemonCost;
    // デプロイ済みが0枚でも実行する（コード内で deploy() して初めてデプロイするブートストラップに対応するため）
    if (!req.daemonCode || !req.daemonCode.trim()) return;

    if (daemonChainDepth >= DAEMON_RECURSION_LIMIT) {
      consoleLogs.push(
        `[DAEMON] ⚠ StackOverflow: endTurn() の再帰的呼び出しが上限(${DAEMON_RECURSION_LIMIT}回)に達しました`,
      );
      return;
    }

    // 静的解析: デプロイ済み枚数を超えて関数名が書かれていないかチェック
    // （ループで呼び出すのは1回書いたことになる。連呼するには while(true) 等が必要）
    // Daemonもライブラリを共有するため、静的チェックはライブラリ込みのコードに対して行う
    const daemonFullCode = req.prefixCode
      ? `${req.prefixCode}\n\n${req.daemonCode}`
      : req.daemonCode;
    const daemonCodeForCheck = stripComments(daemonFullCode);

    const deployedCounts = new Map<string, number>();
    for (const id of deployedCardIds) {
      const def = CARDS[id];
      if (!def) continue;
      deployedCounts.set(def.fn, (deployedCounts.get(def.fn) ?? 0) + 1);
    }
    // コード内で deploy("fn") を呼んでいる回数ぶん、実行中にそのfnが使えるようになる想定で加算する
    // （その場でdeployしてから使うコードを静的チェックでブロックしないため）
    const deployCallRegex = /\bdeploy\s*\(\s*["'`](\w+)["'`]\s*\)/g;
    let deployMatch: RegExpExecArray | null;
    while ((deployMatch = deployCallRegex.exec(daemonCodeForCheck))) {
      const targetFn = deployMatch[1];
      deployedCounts.set(targetFn, (deployedCounts.get(targetFn) ?? 0) + 1);
    }

    for (const [fnName, count] of deployedCounts) {
      const regex   = new RegExp(`\\b${fnName}\\s*\\(`, "g");
      const written = (daemonCodeForCheck.match(regex) ?? []).length;
      if (written > count) {
        consoleLogs.push(
          `[DAEMON] ⚠ 「${fnName}」はDaemonに${count}枚しかデプロイされていないため、${count}回までしかコードに書けません（${written}回書かれています）`,
        );
        return;
      }
    }

    daemonChainDepth++;
    const prevMode = execMode;
    execMode = "daemon";

    try {
      const daemonApiNames: string[]   = ["console"];
      const daemonApiValues: unknown[] = [mockConsole];
      const daemonExposed = new Set<string>();

      // キャラの全カード関数を公開し、実際に呼べるかは checkInHand（availableSource）で判定する。
      // deployedCardIds のスナップショットだけを公開すると、スクリプト内で deploy() した
      // カードが同じ実行内で呼べない（new Function の引数は実行前に固定されるため）。
      for (const id of req.characterCards ?? []) {
        const def = CARDS[id];
        if (!def) continue;
        const fnName = def.fn;
        if (daemonExposed.has(fnName)) continue;
        daemonExposed.add(fnName);

        if (fnName === "attack") {
          daemonApiNames.push("attack"); daemonApiValues.push(lrAttackFn);
        } else if (fnName === "block") {
          daemonApiNames.push("block"); daemonApiValues.push(lrBlockFn);
        } else if (fnName === "execute") {
          daemonApiNames.push("execute"); daemonApiValues.push(legacyLib["execute"]);
        } else if (lrLib[fnName]) {
          daemonApiNames.push(fnName); daemonApiValues.push(lrLib[fnName]);
        } else if (legacyLib[fnName]) {
          daemonApiNames.push(fnName); daemonApiValues.push(legacyLib[fnName]);
        }
      }

      for (const [name, fn] of Object.entries(readApi)) {
        daemonApiNames.push(name); daemonApiValues.push(fn);
      }
      daemonApiNames.push("isUsable"); daemonApiValues.push(isUsableFn);
      daemonApiNames.push("deploy");   daemonApiValues.push(deployFn);

      try {
        // eslint-disable-next-line no-new-func
        const daemonFn = new Function(...daemonApiNames, `"use strict";\n${daemonFullCode}`);
        daemonFn(...daemonApiValues);
      } catch (e) {
        if (e instanceof CombatEndSignal) throw e;
        const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
        consoleLogs.push(`[DAEMON] ⚠ ${msg}`);
      }
    } finally {
      execMode = prevMode;
      daemonChainDepth--;
    }
  };

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
        // handles both lrExecute and legacy execute
        apiNames.push("execute");
        apiValues.push(legacyLib["execute"]);
      } else if (lrLib[fnName]) {
        apiNames.push(fnName);
        apiValues.push(lrLib[fnName]);
      } else if (legacyLib[fnName]) {
        apiNames.push(fnName);
        apiValues.push(legacyLib[fnName]);
      }
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
  apiNames.push("isUsable"); apiValues.push(isUsableFn);
  apiNames.push("deploy");   apiValues.push(deployFn);

  // allowedFns 指定時（チュートリアル等）は、その名前の関数だけをサンドボックスに公開する
  if (req.allowedFns) {
    const allow = new Set([...req.allowedFns, "console"]);
    const filteredNames: string[]   = [];
    const filteredValues: unknown[] = [];
    apiNames.forEach((name, i) => {
      if (allow.has(name)) {
        filteredNames.push(name);
        filteredValues.push(apiValues[i]);
      }
    });
    apiNames.length = 0;   apiNames.push(...filteredNames);
    apiValues.length = 0;  apiValues.push(...filteredValues);
  }

  // 戦闘開始時: メインスクリプトの実行前に一度だけDaemonを走らせる
  // （通常はendTurn()経由でのみ起動するため、ターン1はこれがないと一度もDaemonが動かない）
  if (req.runDaemonAtStart) {
    try {
      runDaemonOnce();
    } catch (e) {
      if (e instanceof CombatEndSignal) {
        return {
          actions, finalState: state, consoleLogs,
          combatResult: e.result,
          finalIntentIndex: intentIdx,
          finalHand: runtimeHand,
          finalDrawPile: runtimeDrawPile,
          finalDiscardPile: runtimeDiscardPile,
          disposedCardIds: disposedCardIds.length > 0 ? disposedCardIds : undefined,
          finalDeployedCardIds: deployedCardIds,
          finalEnergy: state.energy,
        };
      }
      throw e;
    }
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
      finalIntentIndex: intentIdx,
      finalHand: runtimeHand,
      finalDrawPile: runtimeDrawPile,
      finalDiscardPile: runtimeDiscardPile,
      disposedCardIds: disposedCardIds.length > 0 ? disposedCardIds : undefined,
      finalDeployedCardIds: deployedCardIds,
      finalEnergy: state.energy,
    };
  } catch (e) {
    if (e instanceof OutOfEnergy) {
      return {
        actions, finalState: state, info: e.message, consoleLogs,
        finalHand: runtimeHand,
        finalDrawPile: runtimeDrawPile,
        finalDiscardPile: runtimeDiscardPile,
        disposedCardIds: disposedCardIds.length > 0 ? disposedCardIds : undefined,
        finalDeployedCardIds: deployedCardIds,
        finalEnergy: state.energy,
      };
    }
    if (e instanceof EndTurnSignal) {
      return {
        actions, finalState: state, consoleLogs, endTurnCalled: true,
        finalHand: runtimeHand,
        finalDrawPile: runtimeDrawPile,
        finalDiscardPile: runtimeDiscardPile,
        disposedCardIds: disposedCardIds.length > 0 ? disposedCardIds : undefined,
        finalDeployedCardIds: deployedCardIds,
        finalEnergy: state.energy,
      };
    }
    if (e instanceof CyclerSignal) {
      return {
        actions, finalState: state, consoleLogs, cyclerCalled: e.n,
        finalHand: runtimeHand,
        finalDrawPile: runtimeDrawPile,
        finalDiscardPile: runtimeDiscardPile,
        disposedCardIds: disposedCardIds.length > 0 ? disposedCardIds : undefined,
        finalDeployedCardIds: deployedCardIds,
        finalEnergy: state.energy,
      };
    }
    if (e instanceof ForceQuitSignal) {
      return {
        actions, finalState: state, consoleLogs,
        finalHand: runtimeHand,
        finalDrawPile: runtimeDrawPile,
        finalDiscardPile: runtimeDiscardPile,
        disposedCardIds: disposedCardIds.length > 0 ? disposedCardIds : undefined,
        finalDeployedCardIds: deployedCardIds,
        finalEnergy: state.energy,
      };
    }
    if (e instanceof CombatEndSignal) {
      return {
        actions, finalState: state, consoleLogs,
        combatResult: e.result,
        finalIntentIndex: intentIdx,
        finalHand: runtimeHand,
        finalDrawPile: runtimeDrawPile,
        finalDiscardPile: runtimeDiscardPile,
        disposedCardIds: disposedCardIds.length > 0 ? disposedCardIds : undefined,
        finalDeployedCardIds: deployedCardIds,
        finalEnergy: state.energy,
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
