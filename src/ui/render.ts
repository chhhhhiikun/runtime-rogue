import type { CombatState } from "../game/state";
import { CARDS, CARD_UPGRADE_DESCRIPTIONS, type CardId } from "../game/cards";
import type { Deck } from "../game/deck";
import type { StageGimmick } from "../game/stages";

const $$ = (id: string) => document.getElementById(id);

let gimmick: StageGimmick | undefined;

export function setGimmick(cfg?: StageGimmick): void {
  gimmick = cfg;
}

// ステージ対抗ギミックの進捗表示テキストを算出する（enemy-overkill 行に表示）
function gimmickProgressText(g: StageGimmick, state: CombatState): { text: string; ready: boolean } {
  switch (g.kind) {
    case "overkill": {
      const dealt = Math.min(state.damageDealtThisTurn, g.threshold);
      const ready = state.damageDealtThisTurn >= g.threshold;
      return {
        ready,
        text: ready
          ? `⚠ 過負荷反撃 発動中！（次の攻撃 ×${g.multiplier}）`
          : `過負荷反撃まで: ${dealt} / ${g.threshold} ダメージ`,
      };
    }
    case "monotony": {
      const streak = Math.min(state.sameActionStreak, g.streakThreshold);
      return {
        ready: false,
        text: `単眼看破: 同じ行動 ${streak} / ${g.streakThreshold} 連続（敵ブロック+${g.blockGain}）`,
      };
    }
    case "overguard": {
      const ready = state.player.block >= g.threshold;
      return {
        ready,
        text: ready
          ? `⚠ 装甲貫通 発動準備完了！（次の敵攻撃がブロック無視）`
          : `装甲貫通まで: ブロック ${state.player.block} / ${g.threshold}`,
      };
    }
    case "overcastSeal": {
      const combo = Math.min(state.comboCount, g.comboThreshold);
      const ready = state.comboIncrement === 0;
      return {
        ready,
        text: ready
          ? `🔒 詠唱封印 発動中（コンボ増加停止）`
          : `詠唱封印まで: コンボ ${combo} / ${g.comboThreshold}`,
      };
    }
    case "burstSpike": {
      const hit = Math.min(state.maxSingleHitThisTurn, g.threshold);
      const ready = state.maxSingleHitThisTurn >= g.threshold;
      return {
        ready,
        text: ready
          ? `⚠ 禁忌の一撃 発動中！（次の攻撃 ×${g.multiplier}）`
          : `禁忌の一撃まで: 最大単発 ${hit} / ${g.threshold} ダメージ`,
      };
    }
    case "imbalance": {
      const combo = Math.min(state.comboCount, g.threshold);
      const ready = state.comboCount >= g.threshold;
      return {
        ready,
        text: ready
          ? `⚠ 見切りの一撃 警戒中（コンボを増やすたび${g.damage}ダメージ）`
          : `見切りの一撃まで: コンボ ${combo} / ${g.threshold}`,
      };
    }
    case "enrage": {
      const over = state.turn - g.turnThreshold;
      if (over > 0) {
        const mult = (1 + over * g.multiplierPerTurn).toFixed(2);
        return {
          ready: true,
          text: `🔥 覚醒中（攻撃倍率 ×${mult}、コンボ増加量 ${state.comboIncrement.toFixed(2)}）`,
        };
      }
      return {
        ready: false,
        text: `覚醒まで: ターン ${state.turn} / ${g.turnThreshold}`,
      };
    }
  }
}

export function render(state: CombatState, deck: Deck, disabledCards?: Set<CardId>, flashingCardId?: CardId): void {
  // 敵
  const eFill = $$("enemy-hp-fill") as HTMLElement | null;
  if (eFill) eFill.style.width = `${(state.enemy.hp / state.enemy.maxHp) * 100}%`;
  const eText = $$("enemy-hp-text");
  if (eText) eText.textContent = `${state.enemy.hp} / ${state.enemy.maxHp}`;

  const intentEl = $$("enemy-intent");
  if (intentEl) {
    const i = state.enemy.intent;
    intentEl.classList.toggle("intent-boosted", !!i.boosted && !i.ignoresBlock);
    intentEl.classList.toggle("intent-pierce", !!i.ignoresBlock);
    intentEl.textContent = i.kind === "attack"
      ? (i.ignoresBlock
          ? `⚔ 装甲貫通攻撃！ブロック無視: ${i.value} ダメージ`
          : i.boosted
            ? `⚠ 強化された攻撃！: ${i.value} ダメージ`
            : `🗡 次の攻撃: ${i.value} ダメージ`)
      : `🛡 次はブロック: ${i.value}`;
  }

  const overkillEl = $$("enemy-overkill");
  if (overkillEl) {
    if (gimmick) {
      const { text, ready } = gimmickProgressText(gimmick, state);
      overkillEl.classList.remove("hidden");
      overkillEl.classList.toggle("overkill-ready", ready);
      overkillEl.textContent = text;
    } else {
      overkillEl.classList.add("hidden");
      overkillEl.textContent = "";
    }
  }

  const eStatus = $$("enemy-status");
  if (eStatus) {
    const parts: string[] = [];
    if (state.enemy.block > 0)      parts.push(`<span class="status-block">🛡 ${state.enemy.block}</span>`);
    if (state.enemy.vulnerable > 0)  parts.push(`<span class="status-vulnerable">💢脆弱</span>`);
    if (state.enemy.poison > 0)      parts.push(`<span class="status-poison">☠毒 ${state.enemy.poison}</span>`);
    eStatus.innerHTML = parts.join("  ");
  }

  // プレイヤー
  const pFill = $$("player-hp-fill") as HTMLElement | null;
  if (pFill) pFill.style.width = `${(state.player.hp / state.player.maxHp) * 100}%`;
  const pText = $$("player-hp-text");
  if (pText) pText.textContent = `${state.player.hp} / ${state.player.maxHp}`;
  const pBlock = $$("player-block");
  if (pBlock) pBlock.textContent = state.player.block > 0 ? `🛡 ${state.player.block}` : "";
  const eTextEl = $$("energy-text");
  if (eTextEl) eTextEl.textContent = `${state.energy} / ${state.maxEnergy}`;

  // デッキ
  renderHand(deck.hand, disabledCards, state.costZeroCardIds, flashingCardId, state.upgradedCardIds);
  const handCountEl    = $$("hand-count");
  if (handCountEl)    handCountEl.textContent    = String(deck.hand.length);
  const discardCountEl = $$("discard-count");
  if (discardCountEl) discardCountEl.textContent = String(deck.discardPile.length);
  const drawCountEl    = $$("draw-count");
  if (drawCountEl)    drawCountEl.textContent    = String(deck.drawPile.length);
}

function renderHand(hand: CardId[], disabledCards?: Set<CardId>, costZeroCardIds?: string[], flashingCardId?: CardId, upgradedCardIds?: string[]): void {
  const handEl = $$("hand");
  if (!handEl) return;
  const counts = new Map<CardId, number>();
  for (const id of hand) counts.set(id, (counts.get(id) ?? 0) + 1);

  handEl.innerHTML = "";
  for (const [id, count] of counts) {
    const def      = CARDS[id];
    if (!def) continue;
    const disabled = disabledCards?.has(id) ?? false;
    const isCostZero = costZeroCardIds?.includes(id) ?? false;
    const isUpgraded = upgradedCardIds?.includes(id) ?? false;
    const description = (isUpgraded && CARD_UPGRADE_DESCRIPTIONS[id]) || def.description;
    const card     = document.createElement("div");
    card.className = "card" + (disabled ? " card-disabled" : "") + (id === flashingCardId ? " card-flash" : "") + (isUpgraded ? " card-upgraded" : "");
    card.dataset.rarity = def.rarity;
    card.dataset.cardId = id;
    card.title     = disabled ? "このターンすでに使用済み" : "クリックでエディタに挿入";
    const attrTags = def.attributes.map(a =>
      `<span class="attr-tag attr-${a}">${a === "unique" ? "Unique" : "Disp"}</span>`
    ).join("");
    card.innerHTML = `
      <div class="card-header-row">
        <span class="rarity-badge rarity-${def.rarity}" title="${def.rarity}"></span>
        <span class="sig">${def.signature}${isUpgraded ? ' <span class="upgraded-badge">🔧</span>' : ""}</span>
        <span class="cost">×${count}${isCostZero ? " <span class='cost-zero'>0</span>" : ""}</span>
        ${attrTags}
      </div>
      <div class="desc">${description}</div>
      ${disabled ? '<div class="card-disabled-overlay">🚫</div>' : ""}`;
    if (!disabled) {
      card.addEventListener("click", () =>
        window.dispatchEvent(new CustomEvent("insert-snippet", { detail: def.signature }))
      );
    }
    handEl.appendChild(card);
  }
}

export function renderPileCards(pile: CardId[], upgradedCardIds?: string[]): DocumentFragment {
  const frag = document.createDocumentFragment();
  if (pile.length === 0) {
    const empty = document.createElement("div");
    empty.className = "pile-popup-empty";
    empty.textContent = "カードなし";
    frag.appendChild(empty);
    return frag;
  }
  const counts = new Map<CardId, number>();
  for (const id of pile) counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const [id, count] of counts) {
    const def  = CARDS[id];
    if (!def) continue;
    const isUpgraded = upgradedCardIds?.includes(id) ?? false;
    const description = (isUpgraded && CARD_UPGRADE_DESCRIPTIONS[id]) || def.description;
    const card = document.createElement("div");
    card.className = "card" + (isUpgraded ? " card-upgraded" : "");
    card.dataset.rarity = def.rarity;
    const pAttrTags = def.attributes.map(a =>
      `<span class="attr-tag attr-${a}">${a === "unique" ? "Unique" : "Disp"}</span>`
    ).join("");
    card.innerHTML = `
      <div class="card-header-row">
        <span class="rarity-badge rarity-${def.rarity}" title="${def.rarity}"></span>
        <span class="sig">${def.signature}${isUpgraded ? ' <span class="upgraded-badge">🔧</span>' : ""}</span>
        <span class="cost">×${count}</span>
        ${pAttrTags}
      </div>
      <div class="desc">${description}</div>`;
    card.addEventListener("click", () =>
      window.dispatchEvent(new CustomEvent("insert-snippet", { detail: def.signature }))
    );
    frag.appendChild(card);
  }
  return frag;
}

export function setEnemyName(name: string): void {
  const el = $$("enemy-name-label");
  if (el) el.textContent = name;
}

export function setStageLabel(stageIndex: number, total: number, isBoss: boolean): void {
  const el = $$("stage-label");
  if (el) el.textContent = isBoss
    ? `BOSS  ${stageIndex + 1} / ${total}`
    : `STAGE ${stageIndex + 1} / ${total}`;
}

export function setDeckCount(n: number): void {
  const el = $$("deck-count");
  if (el) el.textContent = String(n);
}

// ラン全体のログ履歴（クリア/ゲームオーバー画面での振り返り用）。
// clearLog()は戦闘ウィジェットの表示だけを消し、こちらはresetRunLog()（ラン開始時）まで蓄積し続ける。
const runLogEntries: Array<{ text: string; cls: string }> = [];

export function appendLog(text: string, cls: "dmg" | "heal" | "sys" | "err" = "sys"): void {
  runLogEntries.push({ text, cls });
  const log = $$("log");
  if (!log) return;
  const line = document.createElement("div");
  line.className = `line ${cls}`;
  line.textContent = text;
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
}

export function clearLog(): void {
  const log = $$("log");
  if (log) log.innerHTML = "";
}

export function resetRunLog(): void {
  runLogEntries.length = 0;
}

export function getRunLog(): ReadonlyArray<{ text: string; cls: string }> {
  return runLogEntries;
}

export function appendConsoleLog(lines: string[]): void {
  const el = $$("console-output");
  if (!el || lines.length === 0) return;
  for (const text of lines) {
    const line = document.createElement("div");
    line.className = "console-line" +
      (text.startsWith("[error]") ? " con-error"
        : text.startsWith("[warn]") ? " con-warn"
        : text.startsWith("[DAEMON]") ? " con-daemon"
        : "");
    line.textContent = text;
    el.appendChild(line);
  }
  el.scrollTop = el.scrollHeight;
}

export function clearConsoleLog(): void {
  const el = $$("console-output");
  if (el) el.innerHTML = "";
}

export function showOverlay(text: string): void {
  const ot = $$("overlay-text");
  const ov = $$("overlay");
  if (ot) ot.textContent = text;
  if (ov) ov.classList.remove("hidden");
}

export function hideOverlay(): void {
  $$("overlay")?.classList.add("hidden");
}
