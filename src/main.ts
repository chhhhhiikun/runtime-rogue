import "./styles.css";

import { type MonacoEditor, createEditor, getCode, setCode, insertText } from "./ui/editor";
import { MAX_ENERGY, type CombatState } from "./game/state";
import { HAND_SIZE, CARDS, type CardId } from "./game/cards";
import { CHARACTERS, getCharacter, getAllCharacterCards, type CharacterDef } from "./game/characters";
import { STAGES } from "./game/stages";
import { Deck } from "./game/deck";
import { applyAction } from "./game/actions";
import { chooseIntent, enemyAct } from "./game/enemy";
import { runUserCode, DEFAULT_UNLOCKS, type UnlockFunctions, type DeckSnapshot } from "./sandbox/runCode";
import {
  render, renderPileCards,
  appendLog, clearLog,
  appendConsoleLog, clearConsoleLog,
  showOverlay, hideOverlay,
  setEnemyName, setStageLabel, setDeckCount,
} from "./ui/render";

// ── 型 ─────────────────────────────────────────────────────────────

interface EditorEntry {
  editor: MonacoEditor;
  widget: HTMLElement;
  titleEl: HTMLSpanElement;
  runBtn: HTMLButtonElement | null;
  delBtn: HTMLButtonElement;
  errorEl: HTMLElement;
  wrap: HTMLElement;
  kind: "main" | "library";
}

interface EditorSaveEntry {
  title: string;
  kind: "main" | "library";
  code: string;
  x: number; y: number; w: number; h: number;
}

// ── キャンバス状態 ──────────────────────────────────────────────────

const canvasRoot = document.getElementById("canvas-root")!;
const canvasEl   = document.getElementById("canvas")!;

let cvX = 0, cvY = 0, cvScale = 1;
let zTop = 10;

function updateCanvas(): void {
  canvasEl.style.transform = `translate(${cvX}px,${cvY}px) scale(${cvScale})`;
  document.getElementById("zoom-label")!.textContent = `${Math.round(cvScale * 100)}%`;
}

function bringToFront(w: HTMLElement): void {
  w.style.zIndex = String(++zTop);
}

// ── ウィジェットドラッグ ────────────────────────────────────────────

function setupDrag(widget: HTMLElement, handle: HTMLElement): void {
  let active = false;
  let sx = 0, sy = 0, sl = 0, st = 0;

  handle.addEventListener("mousedown", (e) => {
    if ((e.target as HTMLElement).closest("button,[contenteditable='true'],input")) return;
    e.preventDefault();
    e.stopPropagation();
    active = true;
    sx = e.clientX; sy = e.clientY;
    sl = parseFloat(widget.style.left) || 0;
    st = parseFloat(widget.style.top)  || 0;
    bringToFront(widget);
  });

  window.addEventListener("mousemove", (e) => {
    if (!active) return;
    widget.style.left = `${sl + (e.clientX - sx) / cvScale}px`;
    widget.style.top  = `${st + (e.clientY - sy) / cvScale}px`;
  });

  window.addEventListener("mouseup", () => {
    if (active) { active = false; saveEditorState(); }
  });
}

// ── ウィジェットリサイズ ────────────────────────────────────────────

function setupResize(widget: HTMLElement, onResize?: (w: number, h: number) => void): void {
  const body   = widget.querySelector<HTMLElement>(".widget-body")!;
  const handle = document.createElement("div");
  handle.className = "widget-resize-handle";
  body.appendChild(handle);

  let active = false;
  let sx = 0, sy = 0, sw = 0, sh = 0;

  handle.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    active = true;
    sx = e.clientX; sy = e.clientY;
    sw = widget.offsetWidth;
    sh = widget.offsetHeight;
    bringToFront(widget);
  });

  window.addEventListener("mousemove", (e) => {
    if (!active) return;
    const minW = parseInt(widget.dataset.minW ?? "220");
    const w = Math.max(minW, sw + (e.clientX - sx) / cvScale);
    const h = Math.max(80,  sh + (e.clientY - sy) / cvScale);
    widget.style.width  = `${w}px`;
    widget.style.height = `${h}px`;
    onResize?.(w, h);
  });

  window.addEventListener("mouseup", () => {
    if (active) { active = false; saveEditorState(); }
  });
}

// ── キャンバスパン／ズーム ──────────────────────────────────────────

let panning = false;
let panSX = 0, panSY = 0, panCX = 0, panCY = 0;

canvasRoot.addEventListener("mousedown", (e) => {
  if ((e.target as HTMLElement).closest(".widget")) return;
  panning = true;
  panSX = e.clientX; panSY = e.clientY;
  panCX = cvX; panCY = cvY;
  canvasRoot.classList.add("panning");
});
window.addEventListener("mousemove", (e) => {
  if (!panning) return;
  cvX = panCX + (e.clientX - panSX);
  cvY = panCY + (e.clientY - panSY);
  updateCanvas();
});
window.addEventListener("mouseup", () => {
  panning = false;
  canvasRoot.classList.remove("panning");
});

canvasRoot.addEventListener("wheel", (e) => {
  if ((e.target as HTMLElement).closest(".widget")) return;
  e.preventDefault();
  const factor   = e.deltaY < 0 ? 1.1 : 1 / 1.1;
  const newScale = Math.min(3, Math.max(0.15, cvScale * factor));
  const rect     = canvasRoot.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  cvX = mx - (mx - cvX) * (newScale / cvScale);
  cvY = my - (my - cvY) * (newScale / cvScale);
  cvScale = newScale;
  updateCanvas();
}, { passive: false });

document.getElementById("reset-view-btn")!.addEventListener("click", () => {
  cvX = 0; cvY = 0; cvScale = 1;
  updateCanvas();
});

// ── ウィジェット生成ヘルパ ──────────────────────────────────────────

function createWidget(
  id: string,
  title: string,
  x: number, y: number, w: number,
  bodyHTML: string,
  opts: { editableTitle?: boolean } = {},
): { widget: HTMLElement; titleEl: HTMLSpanElement } {
  const widget = document.createElement("div");
  widget.className = "widget";
  widget.id = `w-${id}`;
  widget.style.cssText = `left:${x}px;top:${y}px;width:${w}px;`;

  const header = document.createElement("div");
  header.className = "widget-header";

  const titleEl = document.createElement("span");
  titleEl.className = "widget-title";
  titleEl.textContent = title;

  if (opts.editableTitle) {
    let savedName = title;
    titleEl.title = "ダブルクリックで名前を変更";
    titleEl.addEventListener("dblclick", () => {
      titleEl.contentEditable = "true";
      titleEl.focus();
      const r = document.createRange();
      r.selectNodeContents(titleEl);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(r);
    });
    titleEl.addEventListener("blur", () => {
      titleEl.contentEditable = "false";
      savedName = titleEl.textContent?.trim() || savedName;
      titleEl.textContent = savedName;
      saveEditorState();
    });
    titleEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); titleEl.blur(); }
      if (e.key === "Escape") { titleEl.textContent = savedName; titleEl.blur(); }
    });
  }

  const actions = document.createElement("div");
  actions.className = "widget-header-actions";
  header.append(titleEl, actions);
  widget.appendChild(header);

  const body = document.createElement("div");
  body.className = "widget-body";
  body.innerHTML = bodyHTML;
  widget.appendChild(body);

  setupDrag(widget, header);
  widget.addEventListener("mousedown", () => bringToFront(widget));
  canvasEl.appendChild(widget);

  return { widget, titleEl };
}

// ── パイルモーダル ──────────────────────────────────────────────────

function buildPileModal(): void {
  const modal = document.createElement("div");
  modal.id = "pile-modal";
  modal.className = "pile-modal hidden";

  const backdrop = document.createElement("div");
  backdrop.className = "pile-backdrop";
  backdrop.addEventListener("click", closePileModal);

  const popup = document.createElement("div");
  popup.className = "pile-popup";
  popup.innerHTML = `
    <div class="pile-popup-header">
      <span id="pile-popup-title" class="pile-popup-title"></span>
      <button class="pile-popup-close" id="pile-close-btn">✕</button>
    </div>
    <div id="pile-popup-cards" class="pile-popup-cards"></div>
  `;

  modal.append(backdrop, popup);
  document.body.appendChild(modal);

  document.getElementById("pile-close-btn")!.addEventListener("click", closePileModal);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closePileModal(); closeRewardModal(); }
  });
}

function openPileModal(cards: CardId[], title: string): void {
  document.getElementById("pile-popup-title")!.textContent = title;
  const cardsEl = document.getElementById("pile-popup-cards")!;
  cardsEl.innerHTML = "";
  cardsEl.appendChild(renderPileCards(cards));
  document.getElementById("pile-modal")!.classList.remove("hidden");
}

function closePileModal(): void {
  document.getElementById("pile-modal")?.classList.add("hidden");
}

// ── サイクラーモーダル ──────────────────────────────────────────────

function buildCyclerModal(): void {
  const modal = document.createElement("div");
  modal.id = "cycler-modal";
  modal.className = "pile-modal hidden";

  const backdrop = document.createElement("div");
  backdrop.className = "pile-backdrop";

  const popup = document.createElement("div");
  popup.className = "pile-popup";
  popup.innerHTML = `
    <div class="pile-popup-header">
      <span id="cycler-modal-title" class="pile-popup-title">🔄 捨てるカードを選択</span>
    </div>
    <div id="cycler-modal-cards" class="pile-popup-cards cycler-cards-grid"></div>
    <div class="cycler-footer">
      <span id="cycler-counter" class="cycler-counter-text">選択: 0 / 0</span>
      <button id="cycler-confirm-btn" class="widget-btn primary" disabled>確定</button>
    </div>
  `;

  modal.append(backdrop, popup);
  document.body.appendChild(modal);
}

function openCyclerModal(n: number, hand: CardId[], onConfirm: (toDiscard: CardId[]) => void): void {
  const titleEl    = document.getElementById("cycler-modal-title")!;
  const cardsEl    = document.getElementById("cycler-modal-cards")!;
  const counterEl  = document.getElementById("cycler-counter")!;
  const confirmBtn = document.getElementById("cycler-confirm-btn") as HTMLButtonElement;

  const selectable = hand.filter(id => id !== "cycler");
  const actualN    = Math.min(n, selectable.length);
  titleEl.textContent = `🔄 ${actualN}枚 捨てるカードを選択`;
  cardsEl.innerHTML = "";

  if (actualN === 0) {
    onConfirm([]);
    return;
  }

  const selected: boolean[] = selectable.map(() => false);

  const updateUI = (): void => {
    const count = selected.filter(Boolean).length;
    counterEl.textContent = `選択: ${count} / ${actualN}`;
    confirmBtn.disabled   = count !== actualN;
  };

  selectable.forEach((id, i) => {
    const def  = CARDS[id];
    if (!def) return;
    const card = document.createElement("div");
    card.className = "card cycler-selectable";
    card.innerHTML = `
      <span class="rarity-badge rarity-${def.rarity}"></span>
      <span class="sig">${def.signature}</span>
      <div class="desc">${def.description}</div>
    `;
    card.addEventListener("click", () => {
      const count = selected.filter(Boolean).length;
      if (selected[i]) {
        selected[i] = false;
        card.classList.remove("cycler-selected");
      } else if (count < actualN) {
        selected[i] = true;
        card.classList.add("cycler-selected");
      }
      updateUI();
    });
    cardsEl.appendChild(card);
  });

  updateUI();

  confirmBtn.onclick = () => {
    const toDiscard = selectable.filter((_, i) => selected[i]);
    closeCyclerModal();
    onConfirm(toDiscard);
  };

  document.getElementById("cycler-modal")!.classList.remove("hidden");
}

function closeCyclerModal(): void {
  document.getElementById("cycler-modal")?.classList.add("hidden");
}

// ── 報酬モーダル ────────────────────────────────────────────────────

function buildRewardModal(): void {
  const modal = document.createElement("div");
  modal.id = "reward-modal";
  modal.className = "pile-modal hidden";

  const backdrop = document.createElement("div");
  backdrop.className = "pile-backdrop";

  const popup = document.createElement("div");
  popup.className = "pile-popup";
  popup.innerHTML = `
    <div class="pile-popup-header">
      <span class="pile-popup-title">✨ 報酬カードを選択</span>
      <button id="reward-deck-btn" class="pile-popup-close">🃏 デッキ確認</button>
      <button class="pile-popup-close" id="reward-skip-btn">スキップ →</button>
    </div>
    <div id="reward-cards" class="pile-popup-cards reward-cards-grid"></div>
    <div class="reward-footer">デッキに追加するカードを 1 枚選んでください（スキップ可）</div>
  `;

  modal.append(backdrop, popup);
  document.body.appendChild(modal);

  document.getElementById("reward-deck-btn")!.addEventListener("click", () => {
    openPileModal([...deckCards], `デッキ (${deckCards.length}枚)`);
  });

  document.getElementById("reward-skip-btn")!.addEventListener("click", () => {
    closeRewardModal();
    startBattle();
  });
}

function showRewardScreen(char: CharacterDef, onPick: (id: CardId | null) => void): void {
  // Build reward pool from character's card pool
  const allPool: CardId[] = [
    ...char.cardPool.common,
    ...char.cardPool.uncommon,
    ...char.cardPool.rare,
  ];
  const pool = [...allPool];
  const choices: CardId[] = [];
  for (let i = 0; i < 3 && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    choices.push(pool.splice(idx, 1)[0]);
  }

  const cardsEl = document.getElementById("reward-cards")!;
  cardsEl.innerHTML = "";

  for (const id of choices) {
    const def  = CARDS[id];
    if (!def) continue;
    const wrap = document.createElement("div");
    wrap.className = "reward-card-wrap";

    const card = document.createElement("div");
    card.className = "card reward-card";
    card.dataset.rarity = def.rarity;
    card.innerHTML = `
      <span class="rarity-badge rarity-${def.rarity}"></span>
      <span class="sig">${def.signature}</span>
      <div class="desc">${def.description}</div>
    `;

    const btn = document.createElement("button");
    btn.className = "widget-btn primary reward-pick-btn";
    btn.textContent = "デッキに追加";
    btn.addEventListener("click", () => {
      closeRewardModal();
      onPick(id);
    });

    wrap.append(card, btn);
    cardsEl.appendChild(wrap);
  }

  document.getElementById("reward-skip-btn")!.onclick = () => {
    closeRewardModal();
    onPick(null);
  };

  document.getElementById("reward-modal")!.classList.remove("hidden");
}

function closeRewardModal(): void {
  document.getElementById("reward-modal")?.classList.add("hidden");
}

// ── 固定ウィジェット ────────────────────────────────────────────────

function buildEnemyWidget(): void {
  const { widget } = createWidget("enemy", "ENEMY", 20, 20, 260, `
    <div id="enemy-name-label" class="enemy-name">敵</div>
    <div id="enemy-intent" class="intent"></div>
    <div class="hp-row">
      <div class="hp-bar"><div id="enemy-hp-fill" class="hp-fill enemy"></div></div>
      <span id="enemy-hp-text" class="hp-text"></span>
    </div>
    <div id="enemy-status" class="status-row"></div>
  `);
  setupResize(widget);
}

function buildPlayerWidget(): void {
  const { widget } = createWidget("player", "PLAYER", 20, 210, 260, `
    <div class="player-name">あなた</div>
    <div class="hp-row">
      <div class="hp-bar"><div id="player-hp-fill" class="hp-fill player"></div></div>
      <span id="player-hp-text" class="hp-text"></span>
      <span id="player-block" class="block-badge"></span>
    </div>
    <div class="energy-row">⚡ <span id="energy-text"></span><span id="run-remaining" class="run-remaining"></span></div>
  `);
  setupResize(widget);
}

function buildLogWidget(): void {
  const { widget } = createWidget("log", "BATTLE LOG", 20, 380, 260, `<div id="log"></div>`);
  setupResize(widget, (_w, h) => {
    const log = document.getElementById("log");
    if (log) log.style.height = `${Math.max(40, h - 52)}px`;
  });
}

function buildDeckWidget(): void {
  const { widget } = createWidget("deck", "DECK", 300, 20, 370, `
    <div class="deck-section-label">手札</div>
    <div id="hand" class="card-list"></div>
    <div class="pile-buttons">
      <button id="show-deck-btn"    class="pile-btn">🃏 デッキ <span class="pile-count" id="deck-count">0</span>枚</button>
      <button id="show-discard-btn" class="pile-btn">🗑 捨て札 <span class="pile-count" id="discard-count">0</span>枚</button>
      <button id="show-draw-btn"    class="pile-btn">📚 山札 <span class="pile-count" id="draw-count">0</span>枚</button>
    </div>
  `);
  setupResize(widget);

  document.getElementById("show-deck-btn")!.addEventListener("click", () => {
    openPileModal([...deckCards], `デッキ全体 (${deckCards.length}枚)`);
  });
  document.getElementById("show-discard-btn")!.addEventListener("click", () => {
    openPileModal(deck.discardPile, `捨て札 (${deck.discardPile.length}枚)`);
  });
  document.getElementById("show-draw-btn")!.addEventListener("click", () => {
    openPileModal(deck.drawPile, `山札 (${deck.drawPile.length}枚)`);
  });
}

function buildConsoleWidget(): void {
  const { widget } = createWidget("console", "CONSOLE", 300, 440, 370, `<div id="console-output"></div>`);
  setupResize(widget, (_w, h) => {
    const el = document.getElementById("console-output");
    if (el) el.style.height = `${Math.max(40, h - 52)}px`;
  });
}

// ── エディタウィジェット ────────────────────────────────────────────

const entries: EditorEntry[] = [];
let lastFocused: MonacoEditor | null = null;

// Debounce timer for auto-save
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveEditorState, 100);
}

function saveEditorState(): void {
  const data: EditorSaveEntry[] = entries.map(e => ({
    title: e.titleEl.textContent ?? "",
    kind: e.kind,
    code: getCode(e.editor),
    x: parseFloat(e.widget.style.left) || 0,
    y: parseFloat(e.widget.style.top)  || 0,
    w: e.widget.offsetWidth || 460,
    h: e.widget.offsetHeight || 300,
  }));
  try {
    localStorage.setItem("runtime_rogue_editors", JSON.stringify(data));
  } catch {
    // ignore storage errors
  }
}

function loadEditorState(): EditorSaveEntry[] | null {
  try {
    const raw = localStorage.getItem("runtime_rogue_editors");
    if (!raw) return null;
    return JSON.parse(raw) as EditorSaveEntry[];
  } catch {
    return null;
  }
}

function addEditor(
  name: string, initial: string, x: number, y: number,
  kind: "main" | "library" = "main",
  savedH?: number,
): EditorEntry {
  const idx = entries.length + 1;
  const displayName = name || (kind === "library" ? `library #${idx}` : `editor #${idx}`);

  const { widget, titleEl } = createWidget(
    `editor-${Date.now()}`,
    displayName,
    x, y, 460,
    `<div class="editor-wrap"></div><div class="editor-error"></div>`,
    { editableTitle: true },
  );

  if (savedH) {
    widget.style.height = `${savedH}px`;
  }

  if (kind === "library") {
    widget.classList.add("library-editor");
    widget.querySelector<HTMLElement>(".widget-header")!.classList.add("library-header");
    const badge = document.createElement("span");
    badge.className = "lib-badge";
    badge.textContent = "LIB";
    titleEl.insertAdjacentElement("afterend", badge);
  }

  const headerActions = widget.querySelector(".widget-header-actions")!;

  let runBtn: HTMLButtonElement | null = null;
  if (kind === "main") {
    runBtn = document.createElement("button");
    runBtn.className = "widget-btn primary";
    runBtn.textContent = "▶ RUN";
    headerActions.appendChild(runBtn);
  }

  const delBtn = document.createElement("button");
  delBtn.className = "widget-btn danger";
  delBtn.textContent = "✕";
  headerActions.appendChild(delBtn);

  const wrap    = widget.querySelector<HTMLElement>(".editor-wrap")!;
  const errorEl = widget.querySelector<HTMLElement>(".editor-error")!;

  const editor = createEditor(wrap, initial,
    () => deck?.hand ?? [],
    () => devUnlocks,
  );
  editor.onDidFocusEditorWidget(() => { lastFocused = editor; });
  editor.onDidChangeModelContent(() => debouncedSave());

  widget.dataset.minW = "320";
  setupResize(widget, (_w, h) => {
    const headerH = widget.querySelector<HTMLElement>(".widget-header")?.offsetHeight ?? 32;
    wrap.style.height = `${Math.max(80, h - headerH - errorEl.offsetHeight - 24)}px`;
  });

  const entry: EditorEntry = { editor, widget, titleEl, runBtn, delBtn, errorEl, wrap, kind };
  entries.push(entry);

  if (runBtn) runBtn.addEventListener("click", () => onRun(entry));
  delBtn.addEventListener("click", () => removeEditor(entry));

  bringToFront(widget);
  if (entries.length === 1) lastFocused = editor;
  return entry;
}

function removeEditor(entry: EditorEntry): void {
  if (entries.length <= 1) return;
  const idx = entries.indexOf(entry);
  if (idx === -1) return;
  entry.editor.dispose();
  entry.widget.remove();
  entries.splice(idx, 1);
  if (lastFocused === entry.editor)
    lastFocused = entries[Math.min(idx, entries.length - 1)].editor;
}

function getDisabledCards(): Set<CardId> | undefined {
  if (!state) return undefined;
  const s = new Set<CardId>();
  if (state.rebootUsedThisTurn) s.add("reboot");
  // Add uniqueUsedThisTurn cards
  for (const id of state.uniqueUsedThisTurn) {
    s.add(id as CardId);
  }
  return s.size > 0 ? s : undefined;
}

function setAllRunButtons(enabled: boolean): void {
  entries.forEach((e) => { if (e.runBtn) e.runBtn.disabled = !enabled; });
  (document.getElementById("end-turn-btn") as HTMLButtonElement).disabled = !enabled;
  (document.getElementById("add-main-btn") as HTMLButtonElement).disabled = !enabled;
  (document.getElementById("add-lib-btn")  as HTMLButtonElement).disabled = !enabled;
}

function restoreButtons(): void {
  const remaining = 2 - runCount;
  entries.forEach(e => {
    if (e.runBtn) {
      e.runBtn.disabled    = remaining <= 0;
      e.runBtn.textContent = "▶ RUN";
    }
  });
  (document.getElementById("end-turn-btn") as HTMLButtonElement).disabled = false;
  (document.getElementById("add-main-btn") as HTMLButtonElement).disabled = false;
  (document.getElementById("add-lib-btn")  as HTMLButtonElement).disabled = false;
  const runRemEl = document.getElementById("run-remaining");
  if (runRemEl) runRemEl.textContent = `　▶ 残り ${Math.max(0, remaining)}`;
}

// ── アンロック状態 ──────────────────────────────────────────────────

let devUnlocks: UnlockFunctions = { ...DEFAULT_UNLOCKS };

function getDeckSnapshot(): DeckSnapshot {
  return {
    full:        [...deckCards],
    hand:        deck ? [...deck.hand]        : [],
    drawPile:    deck ? [...deck.drawPile]    : [],
    discardPile: deck ? [...deck.discardPile] : [],
  };
}

// ── ローグライク状態 ────────────────────────────────────────────────

const HEAL_RATE     = 0.10;
const TOTAL_STAGES  = STAGES.length;

let selectedCharacter: CharacterDef = CHARACTERS[0];
let PLAYER_MAX_HP = selectedCharacter.hp;

let deckCards: CardId[]   = [];
let runPlayerHp           = PLAYER_MAX_HP;
let currentStageIndex     = 0;
let state: CombatState;
let deck: Deck;
let busy     = false;
let over     = false;
let runCount = 0;

const INITIAL_CODE = `// 手札の関数を使って敵を倒そう！
// 例: if (enemyHp() <= 12) execute(); else attack();

attack();
`;

const LIBRARY_INITIAL_CODE = `// ライブラリ: ここで関数を定義してください
// メインエディタから呼び出せます
`;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ── メインメニュー ──────────────────────────────────────────────────

function showMenuScreen(): void {
  canvasRoot.classList.add("hidden");
  document.getElementById("char-select-screen")!.classList.add("hidden");
  document.getElementById("menu-screen")!.classList.remove("hidden");
}

function showCharSelectScreen(): void {
  document.getElementById("menu-screen")!.classList.add("hidden");
  document.getElementById("char-select-screen")!.classList.remove("hidden");
}

function showGameScreen(): void {
  document.getElementById("menu-screen")!.classList.add("hidden");
  document.getElementById("char-select-screen")!.classList.add("hidden");
  canvasRoot.classList.remove("hidden");
}

function buildMenuScreen(): void {
  const el = document.getElementById("menu-screen")!;
  el.innerHTML = `
    <div class="menu-title">RuntimeRogue</div>
    <div class="menu-subtitle">JavaScriptを書いて敵を倒せ</div>
    <button class="menu-btn" id="menu-play-btn">プレイ →</button>
  `;
  document.getElementById("menu-play-btn")!.addEventListener("click", showCharSelectScreen);
}

function buildCharSelectScreen(): void {
  const el = document.getElementById("char-select-screen")!;
  el.innerHTML = `
    <div class="char-select-title">キャラクターを選択</div>
    <div class="char-grid" id="char-grid"></div>
    <button class="char-back-btn" id="char-back-btn">← 戻る</button>
  `;

  const grid = document.getElementById("char-grid")!;
  for (const char of CHARACTERS) {
    const card = document.createElement("div");
    card.className = "char-card" + (char.available ? "" : " char-locked");
    card.innerHTML = `
      <div class="char-emoji">${char.emoji}</div>
      <div class="char-name">${char.name}</div>
      <div class="char-hp">HP: ${char.hp}</div>
      <div class="char-concept">${char.concept}</div>
      ${!char.available ? '<div class="char-locked-label">準備中</div>' : ""}
    `;
    if (char.available) {
      card.addEventListener("click", () => {
        selectedCharacter = char;
        PLAYER_MAX_HP = char.hp;
        showGameScreen();
        startGame(char.id);
      });
    }
    grid.appendChild(card);
  }

  document.getElementById("char-back-btn")!.addEventListener("click", showMenuScreen);
}

// ── ゲーム開始（フルリセット） ──────────────────────────────────────

function startGame(characterId: string): void {
  const char = getCharacter(characterId);
  selectedCharacter = char;
  PLAYER_MAX_HP = char.hp;

  deckCards         = [...char.starterDeck];
  runPlayerHp       = PLAYER_MAX_HP;
  currentStageIndex = 0;
  hideOverlay();
  closeRewardModal();
  clearLog();
  clearConsoleLog();

  // エラー表示のクリアのみ（エディタはリセットしない）
  entries.forEach(e => { e.errorEl.textContent = ""; });

  startBattle();
}

// ── バトル開始（ステージ切り替えでも呼ばれる） ─────────────────────

function startBattle(): void {
  const stage = STAGES[currentStageIndex];
  state = {
    player: { hp: runPlayerHp, maxHp: PLAYER_MAX_HP, block: 0 },
    enemy: {
      hp:         stage.hp,
      maxHp:      stage.hp,
      block:      0,
      vulnerable: 0,
      poison:     0,
      intent:     { kind: "attack", value: 0 },
    },
    energy:    MAX_ENERGY,
    maxEnergy: MAX_ENERGY,
    turn:      1,
    rebootUsedThisTurn: false,
    comboCount: 0,
    comboIncrement: 1,
    asyncAwaitActive: false,
    nextTurnExtraDraws: 0,
    nextTurnExtraEnergy: 0,
    uniqueUsedThisTurn: [],
    costZeroCardIds: [],
    cachedCardId: null,
    characterId: selectedCharacter.id,
  };
  deck = new Deck([...deckCards]);
  over = false;
  busy = false;

  setEnemyName(stage.isBoss ? `👑 ${stage.name}` : stage.name);
  setStageLabel(currentStageIndex, TOTAL_STAGES, !!stage.isBoss);
  setDeckCount(deckCards.length);
  clearLog();
  clearConsoleLog();
  appendLog(`=== ${stage.name} ===`, "sys");
  appendLog(`デッキ: ${deckCards.length} 枚`, "sys");
  entries.forEach(e => { e.errorEl.textContent = ""; });

  startPlayerTurn();
}

function startPlayerTurn(): void {
  runCount = 0;
  const stage = STAGES[currentStageIndex];
  state.player.block       = 0;
  state.energy             = MAX_ENERGY + state.nextTurnExtraEnergy;
  state.rebootUsedThisTurn = false;
  state.comboCount         = 0;
  state.comboIncrement     = 1;
  state.asyncAwaitActive   = false;
  state.costZeroCardIds    = [];
  state.uniqueUsedThisTurn = [];
  state.enemy.intent       = chooseIntent(state.turn, stage.intentPattern);

  // Restore cached card
  if (state.cachedCardId) {
    deck.hand.push(state.cachedCardId as CardId);
    if (!state.costZeroCardIds.includes(state.cachedCardId)) {
      state.costZeroCardIds.push(state.cachedCardId);
    }
    state.cachedCardId = null;
  }

  const extraDraws = state.nextTurnExtraDraws;
  state.nextTurnExtraDraws  = 0;
  state.nextTurnExtraEnergy = 0;

  deck.draw(HAND_SIZE + extraDraws);

  clearConsoleLog();
  appendLog(`─── ターン ${state.turn} ───`, "sys");
  render(state, deck);
  restoreButtons();
}

// ── RUN ────────────────────────────────────────────────────────────

async function onRun(entry: EditorEntry): Promise<void> {
  if (busy || over || runCount >= 2) return;
  runCount++;
  busy = true;
  setAllRunButtons(false);
  entry.errorEl.textContent = "";

  const libraryCode = entries
    .filter(e => e.kind === "library")
    .map(e => getCode(e.editor))
    .filter(c => c.trim())
    .join("\n\n") || undefined;

  const snap   = devUnlocks.deckInfo ? getDeckSnapshot() : undefined;
  const characterCards = getAllCharacterCards(selectedCharacter);

  const result = await runUserCode(
    getCode(entry.editor), state, deck.hand, devUnlocks, snap, 1000, libraryCode,
    deck.drawPile, deck.discardPile, characterCards,
  );
  appendConsoleLog(result.consoleLogs);

  // Sync hand/drawPile/discardPile from worker result
  if (result.finalHand !== undefined) deck.hand = result.finalHand;
  if (result.finalDrawPile !== undefined) deck.drawPile = result.finalDrawPile;
  if (result.finalDiscardPile !== undefined) deck.discardPile = result.finalDiscardPile;

  // Handle disposed cards
  if (result.disposedCardIds) {
    for (const id of result.disposedCardIds) {
      deck.disposeCard(id as CardId);
    }
  }

  for (const action of result.actions) {
    const text = applyAction(state, action);
    const isHeal = action.kind === "heal" || action.kind === "block" ||
                   action.kind === "lrBlock" || action.kind === "reboot" ||
                   action.kind === "patch" || action.kind === "initialize" ||
                   action.kind === "sleep" || action.kind === "incrementalBlock" ||
                   action.kind === "conditionalBlock" || action.kind === "bufferOverflowProtection";
    appendLog(text, isHeal ? "heal" : "dmg");
    render(state, deck, getDisabledCards());
    await sleep(180);
    if (state.enemy.hp <= 0) break;
  }

  if (result.error)     entry.errorEl.textContent = `⚠ ${result.error}`;
  else if (result.info) appendLog(result.info, "err");

  render(state, deck, getDisabledCards());
  if (state.enemy.hp <= 0) return finish(true);

  if (result.endTurnCalled) {
    appendLog("endTurn() が呼ばれました", "sys");
    busy = false;
    return onEndTurn();
  }

  if (result.cyclerCalled !== undefined) {
    const cyclerN = result.cyclerCalled;
    busy = false;
    openCyclerModal(cyclerN, [...deck.hand], (toDiscard) => {
      deck.cycleCards(toDiscard, cyclerN);
      const names = toDiscard.length > 0
        ? toDiscard.map(id => CARDS[id]?.signature ?? id).join(", ")
        : "なし";
      appendLog(`cycler: [${names}] を捨てて ${cyclerN}枚 ドロー`, "sys");
      render(state, deck, getDisabledCards());
      restoreButtons();
    });
    return;
  }

  // Recursion: reset uniqueUsedThisTurn and re-run
  if (result.recursionTriggered) {
    appendLog("recursion: プログラムを再実行", "sys");
    state.uniqueUsedThisTurn = [];
    runCount--; // Don't count this as a run
    busy = false;
    await onRun(entry);
    return;
  }

  busy = false;
  restoreButtons();
}

// ── ターン終了 ──────────────────────────────────────────────────────

async function onEndTurn(): Promise<void> {
  if (busy || over) return;
  busy = true;
  setAllRunButtons(false);

  if (state.enemy.poison > 0) {
    state.enemy.hp     = Math.max(0, state.enemy.hp - state.enemy.poison);
    appendLog(`☠ 毒 ${state.enemy.poison} ダメージ`, "dmg");
    state.enemy.poison -= 1;
    render(state, deck, getDisabledCards());
    await sleep(300);
    if (state.enemy.hp <= 0) return finish(true);
  }

  state.enemy.vulnerable = 0;
  deck.discardHand();
  appendLog(enemyAct(state), "dmg");
  render(state, deck);
  await sleep(300);

  if (state.player.hp <= 0) return finish(false);

  state.turn += 1;
  busy = false;
  startPlayerTurn();
}

// ── バトル終了 ──────────────────────────────────────────────────────

async function finish(win: boolean): Promise<void> {
  over = true;
  busy = false;
  setAllRunButtons(false);
  render(state, deck);

  if (!win) {
    appendLog("💀 敗北...", "sys");
    showOverlay("💀 GAME OVER");
    return;
  }

  appendLog(`✅ ${STAGES[currentStageIndex].name} を倒した！`, "sys");

  const healed = Math.floor(PLAYER_MAX_HP * HEAL_RATE);
  runPlayerHp  = Math.min(PLAYER_MAX_HP, state.player.hp + healed);
  appendLog(`💊 HP +${healed} 回復 → ${runPlayerHp}`, "heal");

  // Restore disposed cards on stage clear
  deck.restoreDisposedCards();

  if (currentStageIndex >= TOTAL_STAGES - 1) {
    appendLog("🏆 全ステージクリア！", "sys");
    showOverlay("🏆 CLEAR!");
    return;
  }

  currentStageIndex++;
  await sleep(600);
  showRewardScreen(selectedCharacter, (picked) => {
    if (picked) {
      deckCards.push(picked);
      appendLog(`✨ 「${CARDS[picked]?.signature ?? picked}」をデッキに追加`, "sys");
    } else {
      appendLog("スキップ", "sys");
    }
    startBattle();
  });
}

// ── 関数リファレンスモーダル ────────────────────────────────────────

function buildReferenceModal(): void {
  const modal = document.createElement("div");
  modal.id = "ref-modal";
  modal.className = "pile-modal hidden";

  const backdrop = document.createElement("div");
  backdrop.className = "pile-backdrop";
  backdrop.addEventListener("click", () => modal.classList.add("hidden"));

  const sections: Array<{
    title: string;
    color: string;
    items: Array<{ sig: string; cost: string; desc: string; example?: string }>;
  }> = [
    {
      title: "🗡 スターターカード",
      color: "var(--enemy)",
      items: [
        { sig: "attack()", cost: "1", desc: "敵に 6 ダメージ", example: "attack();" },
        { sig: "block()",  cost: "1", desc: "ブロック +5",       example: "block();" },
        { sig: "quickScan()", cost: "1", desc: "3ダメージ＋1枚ドロー", example: "quickScan();" },
      ],
    },
    {
      title: "📊 状態読み取り（コスト0）",
      color: "var(--accent)",
      items: [
        { sig: "enemyHp()",     cost: "0", desc: "敵の現在 HP を返す",     example: "if (enemyHp() <= 12) execute();" },
        { sig: "myHp()",        cost: "0", desc: "自分の現在 HP を返す",   example: "if (myHp() < 15) patch();" },
        { sig: "energy()",      cost: "0", desc: "残りエネルギーを返す",   example: "attack();" },
        { sig: "enemyBlock()",  cost: "0", desc: "敵の現在ブロック量を返す", example: "if (enemyBlock() > 0) ping();" },
        { sig: "enemyIntent()", cost: "0", desc: "敵の次の行動 {kind, value}", example: 'if (enemyIntent().kind === "attack") block();' },
      ],
    },
    {
      title: "✨ カード一覧",
      color: "var(--energy)",
      items: [
        { sig: "noop()",        cost: "0", desc: "何もしない（コンボ +1）" },
        { sig: "shift()",       cost: "0", desc: "手札1枚捨て、1枚ドロー" },
        { sig: "overClock()",   cost: "0", desc: "HP -2、エネルギー+1" },
        { sig: "patch()",       cost: "0", desc: "HP +2 回復（使い捨て）" },
        { sig: "initialize()",  cost: "1", desc: "ブロック+3、次ターンエネルギー+1・ドロー+1" },
        { sig: "sleep()",       cost: "1", desc: "ブロック+3、次ターンエネルギー+1" },
        { sig: "forceQuit()",   cost: "1", desc: "4ダメージ、次ターンドロー+2" },
        { sig: "ping()",        cost: "1", desc: "コンボ数ダメージ" },
        { sig: "refactoring()", cost: "1", desc: "手札の最高コスト2枚を-1" },
        { sig: "incrementalAttack()", cost: "2", desc: "8ダメージ（奇数コンボなら+4）" },
        { sig: "conditionalBlock()",  cost: "1", desc: "ブロック+2（偶数コンボなら+5）" },
        { sig: "bufferOverflowProtection()", cost: "1", desc: "手札1枚捨て、ブロック+3" },
        { sig: "asyncDraw()",   cost: "1", desc: "1枚ドロー（コンボ5以上で3枚）" },
        { sig: "caching()",     cost: "0", desc: "最高コストカードを次ターンコスト0で持ち越し" },
        { sig: "multiThreading()", cost: "2", desc: "コンボ+3、1枚ドロー" },
        { sig: "incrementalBlock()", cost: "2", desc: "ブロック+コンボ数" },
        { sig: "garbageCollection()", cost: "1", desc: "捨て札の通常カードを回収、エネルギー+1（使い捨て）" },
        { sig: "recursion()",   cost: "3", desc: "プログラムを再実行（使い捨て）" },
        { sig: "asyncAwait()",  cost: "2", desc: "以降の攻撃にコンボ数分の追加ダメージ（使い捨て）" },
        { sig: "stackOverflow()", cost: "1", desc: "HP -5、コンボ増加が×3に（使い捨て）" },
        { sig: "execute()",     cost: "3", desc: "敵HP ≤ コンボ×3 なら即死" },
        { sig: "compilerOptimization()", cost: "2", desc: "3枚ドロー、通常カードのコスト0" },
      ],
    },
  ];

  const popup = document.createElement("div");
  popup.className = "pile-popup ref-popup";
  popup.innerHTML = `
    <div class="pile-popup-header">
      <span class="pile-popup-title">📖 関数リファレンス</span>
      <button class="pile-popup-close" id="ref-close-btn">✕</button>
    </div>
  `;

  const body = document.createElement("div");
  body.className = "ref-body";

  for (const sec of sections) {
    const secEl = document.createElement("div");
    secEl.className = "ref-section";
    secEl.innerHTML = `<div class="ref-section-title" style="color:${sec.color}">${sec.title}</div>`;

    for (const item of sec.items) {
      const row = document.createElement("div");
      row.className = "ref-row";
      row.innerHTML = `
        <div class="ref-row-top">
          <code class="ref-sig">${item.sig}</code>
          <span class="ref-cost">コスト: ${item.cost}</span>
        </div>
        <div class="ref-desc">${item.desc}</div>
        ${item.example ? `<code class="ref-example">${item.example}</code>` : ""}
      `;
      row.addEventListener("click", () => {
        const target = lastFocused ?? entries[0]?.editor;
        if (target) insertText(target, item.example ? `${item.example}\n` : `${item.sig};\n`);
        modal.classList.add("hidden");
      });
      secEl.appendChild(row);
    }
    body.appendChild(secEl);
  }

  popup.appendChild(body);
  modal.append(backdrop, popup);
  document.body.appendChild(modal);

  document.getElementById("ref-close-btn")!.addEventListener("click", () => {
    modal.classList.add("hidden");
  });

  const hudEl = document.getElementById("hud")!;
  const refBtn = document.createElement("button");
  refBtn.id = "ref-btn";
  refBtn.textContent = "📖 関数一覧";
  hudEl.insertBefore(refBtn, hudEl.firstChild);
  refBtn.addEventListener("click", () => modal.classList.toggle("hidden"));
}

// ── ホームボタン ────────────────────────────────────────────────────

document.getElementById("home-btn")!.addEventListener("click", () => {
  if (confirm("ゲームを終了してメインメニューに戻りますか？")) {
    showMenuScreen();
  }
});

// ── イベント ────────────────────────────────────────────────────────

window.addEventListener("insert-snippet", (e) => {
  const sig    = (e as CustomEvent<string>).detail;
  const target = lastFocused ?? entries[0]?.editor;
  if (!target) return;
  insertText(target, `${sig};\n`);
});

document.getElementById("add-main-btn")!.addEventListener("click", () => {
  const last = entries[entries.length - 1];
  const x    = last ? parseFloat(last.widget.style.left) + 30 : 700;
  const y    = last ? parseFloat(last.widget.style.top)  + 30 : 20;
  addEditor("", "", x, y, "main").editor.focus();
});

document.getElementById("add-lib-btn")!.addEventListener("click", () => {
  const last = entries[entries.length - 1];
  const x    = last ? parseFloat(last.widget.style.left) + 30 : 700;
  const y    = last ? parseFloat(last.widget.style.top)  + 30 : 20;
  addEditor("", LIBRARY_INITIAL_CODE, x, y, "library").editor.focus();
});

document.getElementById("end-turn-btn")!.addEventListener("click", onEndTurn);
document.getElementById("restart-btn")!.addEventListener("click",  () => showMenuScreen());

// ── 起動 ────────────────────────────────────────────────────────────

buildPileModal();
buildCyclerModal();
buildRewardModal();
buildReferenceModal();
buildEnemyWidget();
buildPlayerWidget();
buildLogWidget();
buildDeckWidget();
buildConsoleWidget();

// エディタ復元 or デフォルト
const savedEditors = loadEditorState();
if (savedEditors && savedEditors.length > 0) {
  for (const s of savedEditors) {
    addEditor(s.title, s.code, s.x, s.y, s.kind, s.h);
  }
} else {
  addEditor("editor #1", INITIAL_CODE, 690, 20, "main");
}

updateCanvas();
buildMenuScreen();
buildCharSelectScreen();
showMenuScreen();

// 開発用フック & アンロックパネル
if (import.meta.env.DEV) {
  const w = window as unknown as Record<string, unknown>;
  w.__setCode         = (c: string) => { const v = lastFocused ?? entries[0]?.editor; if (v) setCode(v, c); };
  w.__setLibCode      = (c: string) => { const lib = entries.find(e => e.kind === "library"); if (lib) setCode(lib.editor, c); };
  w.__startCompletion = () => entries[0]?.editor.trigger("keyboard", "editor.action.triggerSuggest", {});
  w.__state           = () => state;
  w.__hand            = () => deck?.hand;
  w.__skipToStage     = (i: number) => { currentStageIndex = i; startBattle(); };
  w.__entries         = () => entries;

  const hudEl = document.getElementById("hud")!;
  const unlockBtn = document.createElement("button");
  unlockBtn.id = "unlock-panel-btn";
  unlockBtn.textContent = "🔓 アンロック";
  unlockBtn.style.cssText = "color:#ffd24a;border-color:#ffd24a;";
  hudEl.insertBefore(unlockBtn, hudEl.firstChild);

  const panel = document.createElement("div");
  panel.id = "unlock-panel";
  panel.className = "unlock-panel hidden";
  panel.innerHTML = `
    <div class="unlock-panel-header">
      <span>🔓 アンロック関数 <span class="dev-badge">DEV</span></span>
      <button class="pile-popup-close" id="unlock-panel-close">✕</button>
    </div>
    <div class="unlock-panel-body">
      <div class="unlock-section-label">デッキ情報</div>
      <label class="unlock-row">
        <span class="unlock-name">myDeck() / myHand() / myDrawPile() / myDiscard()</span>
        <span class="unlock-desc">手札・デッキ・山札・捨て札の配列を取得</span>
        <label class="toggle-switch">
          <input type="checkbox" data-key="deckInfo">
          <span class="toggle-slider"></span>
        </label>
      </label>

      <div class="unlock-section-label">ターン制御</div>
      <label class="unlock-row">
        <span class="unlock-name">endTurn()</span>
        <span class="unlock-desc">コードからターンを終了する</span>
        <label class="toggle-switch">
          <input type="checkbox" data-key="endTurn">
          <span class="toggle-slider"></span>
        </label>
      </label>

      <div class="unlock-section-label">コード機能</div>
      <label class="unlock-row">
        <span class="unlock-name">function キーワード</span>
        <span class="unlock-desc">関数を定義して再利用できるようにする</span>
        <label class="toggle-switch">
          <input type="checkbox" data-key="functionKw">
          <span class="toggle-slider"></span>
        </label>
      </label>
      <label class="unlock-row">
        <span class="unlock-name">アロー関数 <code>() =&gt; {}</code></span>
        <span class="unlock-desc">短い関数を簡潔に書けるようにする</span>
        <label class="toggle-switch">
          <input type="checkbox" data-key="arrowFn">
          <span class="toggle-slider"></span>
        </label>
      </label>
    </div>
  `;
  document.body.appendChild(panel);

  panel.querySelectorAll<HTMLInputElement>("input[data-key]").forEach(cb => {
    const key = cb.dataset.key as keyof UnlockFunctions;
    cb.checked = devUnlocks[key];
    cb.addEventListener("change", () => {
      devUnlocks = { ...devUnlocks, [key]: cb.checked };
    });
  });

  unlockBtn.addEventListener("click", () => panel.classList.toggle("hidden"));
  document.getElementById("unlock-panel-close")!.addEventListener("click", () => {
    panel.classList.add("hidden");
  });
}

void CARDS;
