import type { CombatState } from "../game/state";
import { CARDS, type CardId } from "../game/cards";
import type { Deck } from "../game/deck";

const $$ = (id: string) => document.getElementById(id);

export function render(state: CombatState, deck: Deck, disabledCards?: Set<CardId>): void {
  // 敵
  const eFill = $$("enemy-hp-fill") as HTMLElement | null;
  if (eFill) eFill.style.width = `${(state.enemy.hp / state.enemy.maxHp) * 100}%`;
  const eText = $$("enemy-hp-text");
  if (eText) eText.textContent = `${state.enemy.hp} / ${state.enemy.maxHp}`;

  const intentEl = $$("enemy-intent");
  if (intentEl) {
    const i = state.enemy.intent;
    intentEl.textContent = i.kind === "attack"
      ? `🗡 次の攻撃: ${i.value} ダメージ`
      : `🛡 次はブロック: ${i.value}`;
  }

  const eStatus = $$("enemy-status");
  if (eStatus) {
    const parts: string[] = [];
    if (state.enemy.block > 0)      parts.push(`🛡 ${state.enemy.block}`);
    if (state.enemy.vulnerable > 0)  parts.push("💢脆弱");
    if (state.enemy.poison > 0)      parts.push(`☠毒 ${state.enemy.poison}`);
    eStatus.textContent = parts.join("  ");
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
  renderHand(deck.hand, disabledCards, state.costZeroCardIds);
  const handCountEl    = $$("hand-count");
  if (handCountEl)    handCountEl.textContent    = String(deck.hand.length);
  const discardCountEl = $$("discard-count");
  if (discardCountEl) discardCountEl.textContent = String(deck.discardPile.length);
  const drawCountEl    = $$("draw-count");
  if (drawCountEl)    drawCountEl.textContent    = String(deck.drawPile.length);
}

function renderHand(hand: CardId[], disabledCards?: Set<CardId>, costZeroCardIds?: string[]): void {
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
    const card     = document.createElement("div");
    card.className = "card" + (disabled ? " card-disabled" : "");
    card.dataset.rarity = def.rarity;
    card.title     = disabled ? "このターンすでに使用済み" : "クリックでエディタに挿入";
    card.innerHTML = `
      <span class="rarity-badge rarity-${def.rarity}"></span>
      <span class="sig">${def.signature}</span><span class="cost">×${count}${isCostZero ? " [0]" : ""}</span>
      <div class="desc">${def.description}</div>
      ${disabled ? '<div class="card-disabled-overlay">🚫</div>' : ""}`;
    if (!disabled) {
      card.addEventListener("click", () =>
        window.dispatchEvent(new CustomEvent("insert-snippet", { detail: def.signature }))
      );
    }
    handEl.appendChild(card);
  }
}

export function renderPileCards(pile: CardId[]): DocumentFragment {
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
    const card = document.createElement("div");
    card.className = "card";
    card.dataset.rarity = def.rarity;
    card.innerHTML = `
      <span class="rarity-badge rarity-${def.rarity}"></span>
      <span class="sig">${def.signature}</span><span class="cost">×${count}</span>
      <div class="desc">${def.description}</div>`;
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

export function appendLog(text: string, cls: "dmg" | "heal" | "sys" | "err" = "sys"): void {
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

export function appendConsoleLog(lines: string[]): void {
  const el = $$("console-output");
  if (!el || lines.length === 0) return;
  for (const text of lines) {
    const line = document.createElement("div");
    line.className = "console-line" +
      (text.startsWith("[error]") ? " con-error" : text.startsWith("[warn]") ? " con-warn" : "");
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
