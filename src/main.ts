import "./styles.css";

import * as monaco from "monaco-editor";
import { type MonacoEditor, createEditor, getCode, setCode, insertText, colorizeCode, READ_ITEMS, UNLOCKABLE_ITEMS } from "./ui/editor";
import { MAX_ENERGY, MAX_DAEMON_COST, type CombatState } from "./game/state";
import { HAND_SIZE, CARDS, getCardBaseCost, type CardId } from "./game/cards";
import { CHARACTERS, getCharacter, getAllCharacterCards, type CharacterDef } from "./game/characters";
import { STAGES, type StageDef, type StageGimmick, type StoredValueGimmick } from "./game/stages";
import { TUTORIAL_STEPS, TUTORIAL_COMPLETE_OVERLAY, TUTORIAL_COMPLETE_LOG } from "./game/tutorial";
import { LESSONS, type LessonDef } from "./game/lessons";
import { Deck } from "./game/deck";
import { applyAction } from "./game/actions";
import { runUserCode, DEFAULT_UNLOCKS, type UnlockFunctions, type DeckSnapshot } from "./sandbox/runCode";
import type { RunResult } from "./sandbox/worker";
import {
  render, renderPileCards,
  appendLog, clearLog,
  appendConsoleLog, clearConsoleLog,
  showOverlay, hideOverlay,
  setEnemyName, setStageLabel, setDeckCount, setGimmick,
} from "./ui/render";

// ── 型 ─────────────────────────────────────────────────────────────

interface EditorEntry {
  editor: MonacoEditor;
  widget: HTMLElement;
  titleEl: HTMLSpanElement;
  runBtn: HTMLButtonElement | null;
  autoBtn: HTMLButtonElement | null;
  autorun: boolean;
  delBtn: HTMLButtonElement;
  errorEl: HTMLElement;
  wrap: HTMLElement;
  kind: "main" | "library";
  resyncLayout: () => void;
}

interface EditorSaveEntry {
  title: string;
  kind: "main" | "library";
  code: string;
  x: number; y: number; w: number; h: number;
}

interface EditorPreset {
  name: string;
  savedAt: number;
  mainLibrary: EditorSaveEntry[];
  daemonCode: string;
}

interface CharacterStats {
  clears: number;
  bestClearMs: number | null;
  gameOvers: number;
}
type PlayStats = Record<string, CharacterStats>;

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

function zoomCanvasAt(clientX: number, clientY: number, deltaY: number): void {
  const factor   = deltaY < 0 ? 1.1 : 1 / 1.1;
  const newScale = Math.min(3, Math.max(0.15, cvScale * factor));
  const rect     = canvasRoot.getBoundingClientRect();
  const mx = clientX - rect.left;
  const my = clientY - rect.top;
  cvX = mx - (mx - cvX) * (newScale / cvScale);
  cvY = my - (my - cvY) * (newScale / cvScale);
  cvScale = newScale;
  updateCanvas();
}

canvasRoot.addEventListener("wheel", (e) => {
  // ウィジェット（エディタ等）上では、その場でのスクロールを優先する
  // （Ctrl/Cmd+ホイールは下記のwindowのキャプチャ段リスナーが優先的に処理する）
  if ((e.target as HTMLElement).closest(".widget")) return;
  e.preventDefault();
  zoomCanvasAt(e.clientX, e.clientY, e.deltaY);
}, { passive: false });

// Ctrl/Cmd+ホイールは、Monaco等ウィジェット側の処理より先に（キャプチャ段で）
// 割り込んでキャンバスのズームとして扱う。カーソルがエディタ上にあっても効くようにするため。
window.addEventListener("wheel", (e) => {
  if (!e.ctrlKey && !e.metaKey) return;
  e.preventDefault();
  e.stopPropagation();
  zoomCanvasAt(e.clientX, e.clientY, e.deltaY);
}, { passive: false, capture: true });

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
  // 重み付きランダム: Common 69% / Uncommon 20% / Rare 10% / Fatal 1%
  const pickWeighted = (): CardId | null => {
    const r = Math.random();
    let pool: CardId[];
    if (r < 0.69)      pool = char.cardPool.common;
    else if (r < 0.89) pool = char.cardPool.uncommon;
    else if (r < 0.99) pool = char.cardPool.rare;
    else               pool = char.cardPool.fatal;
    if (pool.length === 0) pool = char.cardPool.common;
    return pool[Math.floor(Math.random() * pool.length)] ?? null;
  };

  const choices: CardId[] = [];
  const seen = new Set<CardId>();
  for (let tries = 0; tries < 30 && choices.length < 3; tries++) {
    const picked = pickWeighted();
    if (picked && !seen.has(picked)) { seen.add(picked); choices.push(picked); }
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

// ── 勝利（次へ進む）モーダル ──────────────────────────────────────────

function buildVictoryModal(): void {
  const modal = document.createElement("div");
  modal.id = "victory-modal";
  modal.className = "pile-modal hidden";

  const backdrop = document.createElement("div");
  backdrop.className = "pile-backdrop";

  const popup = document.createElement("div");
  popup.className = "pile-popup victory-popup";
  popup.innerHTML = `
    <div class="pile-popup-header">
      <span class="pile-popup-title">✅ ステージクリア</span>
    </div>
    <div id="victory-body" class="victory-body"></div>
    <div class="victory-footer">
      <button id="victory-continue-btn" class="widget-btn primary">次へ進む →</button>
    </div>
  `;

  modal.append(backdrop, popup);
  document.body.appendChild(modal);
}

function showVictoryModal(lines: string[], onContinue: () => void): void {
  const bodyEl = document.getElementById("victory-body")!;
  bodyEl.innerHTML = lines.map(l => `<div>${l}</div>`).join("");
  const btn = document.getElementById("victory-continue-btn") as HTMLButtonElement;
  btn.onclick = () => {
    closeVictoryModal();
    onContinue();
  };
  document.getElementById("victory-modal")!.classList.remove("hidden");
}

function closeVictoryModal(): void {
  document.getElementById("victory-modal")?.classList.add("hidden");
}

// ── エディタプリセットモーダル ────────────────────────────────────────

function buildPresetModal(): void {
  const modal = document.createElement("div");
  modal.id = "preset-modal";
  modal.className = "pile-modal hidden";

  const backdrop = document.createElement("div");
  backdrop.className = "pile-backdrop";
  backdrop.addEventListener("click", closePresetModal);

  const popup = document.createElement("div");
  popup.className = "pile-popup preset-popup";
  popup.innerHTML = `
    <div class="pile-popup-header">
      <span class="pile-popup-title">🧩 エディタプリセット</span>
      <button class="pile-popup-close" id="preset-modal-close">✕</button>
    </div>
    <div class="preset-warning">⚠ 保存していないエディタ情報は破棄されます</div>
    <div class="preset-save-row">
      <input type="text" id="preset-name-input" class="preset-name-input" placeholder="プリセット名" maxlength="40" />
      <button id="preset-save-btn" class="widget-btn primary">現在の内容を保存</button>
    </div>
    <div id="preset-list" class="preset-list"></div>
    <div class="preset-footer">Main/Library/Daemonエディタの内容とレイアウトをまとめて保存・復元します</div>
  `;

  modal.append(backdrop, popup);
  document.body.appendChild(modal);

  document.getElementById("preset-modal-close")!.addEventListener("click", closePresetModal);

  const nameInput = document.getElementById("preset-name-input") as HTMLInputElement;
  const saveBtn   = document.getElementById("preset-save-btn") as HTMLButtonElement;
  saveBtn.addEventListener("click", () => {
    const name = nameInput.value.trim();
    if (!name) return;
    saveCurrentAsPreset(name);
    nameInput.value = "";
    renderPresetList();
  });
}

function renderPresetList(): void {
  const listEl = document.getElementById("preset-list")!;
  const presets = loadPresets().sort((a, b) => b.savedAt - a.savedAt);

  listEl.innerHTML = "";

  // 適用専用の組み込みプリセット（削除・上書き不可、常に先頭に表示）
  const blankRow = document.createElement("div");
  blankRow.className = "preset-row preset-row-builtin";
  blankRow.innerHTML = `
    <div class="preset-row-info">
      <span class="preset-row-name">デフォルト（空の状態）</span>
      <span class="preset-row-date">組み込み・適用専用</span>
    </div>
    <div class="preset-row-actions">
      <button class="widget-btn primary preset-apply-btn">適用</button>
    </div>
  `;
  blankRow.querySelector(".preset-apply-btn")!.addEventListener("click", () => {
    applyBlankPreset();
    closePresetModal();
  });
  listEl.appendChild(blankRow);

  if (presets.length === 0) {
    const empty = document.createElement("div");
    empty.className = "pile-popup-empty";
    empty.textContent = "保存されたプリセットはありません";
    listEl.appendChild(empty);
    return;
  }

  for (const preset of presets) {
    const row = document.createElement("div");
    row.className = "preset-row";
    const savedDate = new Date(preset.savedAt).toLocaleString();
    row.innerHTML = `
      <div class="preset-row-info">
        <span class="preset-row-name">${preset.name}</span>
        <span class="preset-row-date">${savedDate}</span>
      </div>
      <div class="preset-row-actions">
        <button class="widget-btn primary preset-apply-btn">適用</button>
        <button class="widget-btn danger preset-delete-btn">削除</button>
      </div>
    `;
    row.querySelector(".preset-apply-btn")!.addEventListener("click", () => {
      applyPreset(preset);
      closePresetModal();
    });
    row.querySelector(".preset-delete-btn")!.addEventListener("click", () => {
      if (confirm(`「${preset.name}」を削除しますか？`)) {
        deletePreset(preset.name);
        renderPresetList();
      }
    });
    listEl.appendChild(row);
  }
}

function showPresetModal(): void {
  renderPresetList();
  document.getElementById("preset-modal")!.classList.remove("hidden");
}

function closePresetModal(): void {
  document.getElementById("preset-modal")?.classList.add("hidden");
}

// ── プレイ履歴モーダル ────────────────────────────────────────────

function buildStatsModal(): void {
  const modal = document.createElement("div");
  modal.id = "stats-modal";
  modal.className = "pile-modal hidden";

  const backdrop = document.createElement("div");
  backdrop.className = "pile-backdrop";
  backdrop.addEventListener("click", closeStatsModal);

  const popup = document.createElement("div");
  popup.className = "pile-popup stats-popup";
  popup.innerHTML = `
    <div class="pile-popup-header">
      <span class="pile-popup-title">📊 プレイ履歴</span>
      <button class="pile-popup-close" id="stats-modal-close">✕</button>
    </div>
    <div id="stats-list" class="stats-list"></div>
  `;

  modal.append(backdrop, popup);
  document.body.appendChild(modal);

  document.getElementById("stats-modal-close")!.addEventListener("click", closeStatsModal);
}

function renderStatsList(): void {
  const listEl = document.getElementById("stats-list")!;
  const stats = loadStats();
  listEl.innerHTML = "";

  for (const char of CHARACTERS.filter(c => c.available)) {
    const s = getCharStats(stats, char.id);
    const row = document.createElement("div");
    row.className = "stats-row";
    row.innerHTML = `
      <div class="stats-row-name">${char.emoji} ${char.name}</div>
      <div class="stats-row-values">
        <span>クリア回数: <b>${s.clears}</b></span>
        <span>最短クリア: <b>${s.bestClearMs !== null ? formatClearTime(s.bestClearMs) : "-"}</b></span>
        <span>ゲームオーバー: <b>${s.gameOvers}</b></span>
      </div>
    `;
    listEl.appendChild(row);
  }
}

function showStatsModal(): void {
  renderStatsList();
  document.getElementById("stats-modal")!.classList.remove("hidden");
}

function closeStatsModal(): void {
  document.getElementById("stats-modal")?.classList.add("hidden");
}

// ── チュートリアルモーダル ────────────────────────────────────────────

function buildTutorialModal(): void {
  const modal = document.createElement("div");
  modal.id = "tutorial-modal";
  modal.className = "pile-modal hidden";

  const backdrop = document.createElement("div");
  backdrop.className = "pile-backdrop";

  const popup = document.createElement("div");
  popup.className = "pile-popup tutorial-popup";
  popup.innerHTML = `
    <div class="pile-popup-header">
      <span id="tutorial-modal-title" class="pile-popup-title">📘 チュートリアル</span>
    </div>
    <div id="tutorial-modal-body" class="tutorial-modal-body"></div>
    <div class="tutorial-modal-footer">
      <button id="tutorial-start-btn" class="widget-btn primary">はじめる →</button>
    </div>
  `;

  modal.append(backdrop, popup);
  document.body.appendChild(modal);
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
    <div id="enemy-overkill" class="overkill-row hidden"></div>
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
    <div class="energy-row">⚡ Main Clock: <span id="energy-text"></span><span id="run-remaining" class="run-remaining"></span></div>
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
  const { widget } = createWidget("console", "CONSOLE", 300, 440, 370, `
    <div id="console-output"></div>
    <div class="console-input-row">
      <span class="console-prompt">&gt;</span>
      <input id="console-input" class="console-input" placeholder="mainClock(), comboCount()..." spellcheck="false" />
    </div>
  `);
  setupResize(widget, (_w, h) => {
    const el = document.getElementById("console-output");
    if (el) el.style.height = `${Math.max(40, h - 76)}px`;
  });

  document.getElementById("console-input")!.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const input = e.currentTarget as HTMLInputElement;
    const expr = input.value.trim();
    if (!expr) return;
    input.value = "";

    // deploy <fn名>: 手札のカードをDaemonへ永久デプロイする
    const deployMatch = /^deploy\s+(\S+)$/.exec(expr);
    if (deployMatch) {
      if (busy || over) {
        appendConsoleLog([`> ${expr}`, "[error] 実行中はデプロイできません"]);
        return;
      }
      const fnName = deployMatch[1];
      const BLOCKED_FNS = ["forceQuit", "cycler"];
      if (BLOCKED_FNS.includes(fnName)) {
        appendConsoleLog([`> ${expr}`, `[error] 「${fnName}」はDaemonにデプロイできません`]);
        return;
      }
      const id = deck.hand.find(cid => CARDS[cid]?.fn === fnName);
      if (!id) {
        appendConsoleLog([`> ${expr}`, `[error] 手札に "${fnName}" が見つかりません`]);
        return;
      }
      const deployCost = getCardBaseCost(id) * 2;
      if (state.energy < deployCost) {
        appendConsoleLog([`> ${expr}`, `[error] Main Clock不足: デプロイには ${deployCost} 必要ですが残り ${state.energy} です`]);
        return;
      }
      state.energy -= deployCost;
      deck.deploy(id);
      appendConsoleLog([`> ${expr}`, `✅ 「${fnName}」をDaemonへデプロイしました（Main Clock -${deployCost}）`]);
      render(state, deck, getDisabledCards());
      updateDaemonDisplay();
      return;
    }

    // エディタと同じアンロック制限を適用
    const readFns: Record<string, () => unknown> = {
      mainClock:         () => state.energy,
      daemonCost:        () => state.daemonCost,
      comboCount:        () => state.comboCount,
      sameActionStreak:  () => state.sameActionStreak,
      storedValue:       () => state.storedValue,
      turnsSinceRelease: () => state.turnsSinceRelease,
    };
    if (devUnlocks.enemyHp)             readFns["enemyHp"]             = () => state.enemy.hp;
    if (devUnlocks.myHp)                readFns["myHp"]                = () => state.player.hp;
    if (devUnlocks.myBlock)             readFns["myBlock"]             = () => state.player.block;
    if (devUnlocks.enemyBlock)          readFns["enemyBlock"]          = () => state.enemy.block;
    if (devUnlocks.enemyIntent)         readFns["enemyIntent"]         = () => ({ ...state.enemy.intent });
    if (devUnlocks.damageDealtThisTurn) readFns["damageDealtThisTurn"] = () => state.damageDealtThisTurn;
    if (devUnlocks.comboIncrement)      readFns["comboIncrement"]      = () => state.comboIncrement;
    if (devUnlocks.turn)                readFns["turn"]                = () => state.turn;
    const toFn = (ids: CardId[]) => ids.map(id => CARDS[id]?.fn ?? id);
    if (devUnlocks.myHand)     readFns["myHand"]     = () => toFn([...deck.hand]);
    if (devUnlocks.myDeck)     readFns["myDeck"]     = () => toFn([...deckCards]);
    if (devUnlocks.myDrawPile) readFns["myDrawPile"] = () => toFn([...deck.drawPile]);
    if (devUnlocks.myDiscard)  readFns["myDiscard"]  = () => toFn([...deck.discardPile]);
    if (devUnlocks.myDeployed) readFns["myDeployed"] = () => toFn([...deck.deployedCards]);
    const names  = Object.keys(readFns);
    const values = Object.values(readFns);
    try {
      // eslint-disable-next-line no-new-func
      const result = new Function(...names, `"use strict"; return (${expr})`)(...values);
      appendConsoleLog([`> ${expr}`, `← ${JSON.stringify(result)}`]);
    } catch (err) {
      appendConsoleLog([`> ${expr}`, `[error] ${err instanceof Error ? err.message : String(err)}`]);
    }
  });
}

// ── Daemon ウィジェット（常駐・削除不可・1つだけ） ───────────────────

let daemonEditor: MonacoEditor;

function buildDaemonWidget(): void {
  const { widget } = createWidget("daemon", "DAEMON", 700, 440, 370, `
    <div class="daemon-status-row">🔧 Daemon Cost: <span id="daemon-cost-text">0 / 0</span></div>
    <div class="daemon-deployed-row">デプロイ済み: <span id="daemon-deployed-list">(なし)</span></div>
    <div class="editor-wrap" id="daemon-editor-wrap"></div>
  `);
  widget.classList.add("editor-widget", "daemon-widget");
  setupResize(widget, (_w, h) => {
    const wrap = document.getElementById("daemon-editor-wrap");
    if (wrap) wrap.style.height = `${Math.max(60, h - 84)}px`;
  });

  const wrap = document.getElementById("daemon-editor-wrap")!;
  const savedCode = loadDaemonCode() ?? "";
  daemonEditor = createEditor(wrap, savedCode, () => deck?.deployedCards ?? [], () => devUnlocks);
  daemonEditor.onDidFocusEditorWidget(() => { lastFocused = daemonEditor; });
  daemonEditor.onDidChangeModelContent(() => debouncedSaveDaemonCode());
}

function loadDaemonCode(): string | null {
  try {
    return localStorage.getItem("runtime_rogue_daemon_code");
  } catch {
    return null;
  }
}

let daemonSaveTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedSaveDaemonCode(): void {
  if (daemonSaveTimer) clearTimeout(daemonSaveTimer);
  daemonSaveTimer = setTimeout(() => {
    if (tutorialMode) return; // チュートリアル中は上書きしない
    try {
      localStorage.setItem("runtime_rogue_daemon_code", getCode(daemonEditor));
    } catch {
      // ignore storage errors
    }
  }, 200);
}

function updateDaemonDisplay(): void {
  const costEl = document.getElementById("daemon-cost-text");
  if (costEl && state) costEl.textContent = `${state.daemonCost} / ${state.maxDaemonCost}`;
  const listEl = document.getElementById("daemon-deployed-list");
  if (listEl && deck) {
    const names = deck.deployedCards.map(id => CARDS[id]?.fn ?? id);
    listEl.textContent = names.length > 0 ? names.join(", ") : "(なし)";
  }
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

function snapshotEditors(): EditorSaveEntry[] {
  return entries.map(e => ({
    title: e.titleEl.textContent ?? "",
    kind: e.kind,
    code: getCode(e.editor),
    x: parseFloat(e.widget.style.left) || 0,
    y: parseFloat(e.widget.style.top)  || 0,
    w: e.widget.offsetWidth || 460,
    h: e.widget.offsetHeight || 300,
  }));
}

function saveEditorState(): void {
  if (tutorialMode) return; // チュートリアル中のエディタは通常保存を上書きしない
  try {
    localStorage.setItem("runtime_rogue_editors", JSON.stringify(snapshotEditors()));
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

// ── エディタプリセット ──────────────────────────────────────────────

function loadPresets(): EditorPreset[] {
  try {
    const raw = localStorage.getItem("runtime_rogue_presets");
    if (!raw) return [];
    return JSON.parse(raw) as EditorPreset[];
  } catch {
    return [];
  }
}

function savePresets(presets: EditorPreset[]): void {
  try {
    localStorage.setItem("runtime_rogue_presets", JSON.stringify(presets));
  } catch {
    // ignore storage errors
  }
}

// ── プレイ履歴（クリア回数・最短クリア時間・ゲームオーバー回数） ──────
// キャラクターごとにローカル保存する。タブを閉じる/中断した場合は
// finish()の実際の勝敗判定を通らないため、ゲームオーバー回数には加算されない。

function loadStats(): PlayStats {
  try {
    const raw = localStorage.getItem("runtime_rogue_stats");
    if (!raw) return {};
    return JSON.parse(raw) as PlayStats;
  } catch {
    return {};
  }
}

function saveStats(stats: PlayStats): void {
  try {
    localStorage.setItem("runtime_rogue_stats", JSON.stringify(stats));
  } catch {
    // ignore storage errors
  }
}

function getCharStats(stats: PlayStats, characterId: string): CharacterStats {
  return stats[characterId] ?? { clears: 0, bestClearMs: null, gameOvers: 0 };
}

function recordClear(characterId: string, elapsedMs: number): void {
  const stats = loadStats();
  const cur = getCharStats(stats, characterId);
  stats[characterId] = {
    clears: cur.clears + 1,
    bestClearMs: cur.bestClearMs === null ? elapsedMs : Math.min(cur.bestClearMs, elapsedMs),
    gameOvers: cur.gameOvers,
  };
  saveStats(stats);
}

function recordGameOver(characterId: string): void {
  const stats = loadStats();
  const cur = getCharStats(stats, characterId);
  stats[characterId] = { ...cur, gameOvers: cur.gameOvers + 1 };
  saveStats(stats);
}

// ── バイト（永続メタ進行通貨）・キャッシュ（ラン単位通貨） ────────────
// バイトはステージクリアのたび即座にlocalStorageへ加算される（ランがゲームオーバーで終わっても失われない）。
// キャッシュはラン中のみメモリ上で保持し、ラン終了（勝利・敗北）でリセットされる。

function loadTotalBytes(): number {
  try {
    const raw = localStorage.getItem("runtime_rogue_bytes");
    return raw ? Number(raw) || 0 : 0;
  } catch {
    return 0;
  }
}

function addBytes(amount: number): number {
  const total = loadTotalBytes() + amount;
  try {
    localStorage.setItem("runtime_rogue_bytes", String(total));
  } catch {
    // ignore storage errors
  }
  return total;
}

// baseに±rangeの一様乱数ジッターを乗せた整数を返す
function jitterReward(base: number, range: number): number {
  return base + Math.floor(Math.random() * (range * 2 + 1)) - range;
}

const BYTE_JITTER = 20;
const CASH_JITTER = 150;
const BOSS_CLEAR_BONUS = 1500;

// bytesが足りていれば消費して永続化し true を返す。足りなければ何もせず false
function trySpendBytes(amount: number): boolean {
  const total = loadTotalBytes();
  if (total < amount) return false;
  try {
    localStorage.setItem("runtime_rogue_bytes", String(total - amount));
  } catch {
    // ignore storage errors
  }
  return true;
}

// ── レッスン（購入済みIDの永続化） ────────────────────────────────────

function loadPurchasedLessons(): string[] {
  try {
    const raw = localStorage.getItem("runtime_rogue_lessons");
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function isLessonPurchased(id: string): boolean {
  return loadPurchasedLessons().includes(id);
}

function purchaseLesson(id: string): void {
  const owned = loadPurchasedLessons();
  if (owned.includes(id)) return;
  owned.push(id);
  try {
    localStorage.setItem("runtime_rogue_lessons", JSON.stringify(owned));
  } catch {
    // ignore storage errors
  }
}

// ── アンロック関数（購入済みIDの永続化） ──────────────────────────────
// 現時点では購入してもゲーム内の挙動（devUnlocks）は変えない。
// DEFAULT_UNLOCKSが全てtrueのまま実際のゲート化は別途行うため、ここは購入記録のみ

function loadPurchasedUnlocks(): Array<keyof UnlockFunctions> {
  try {
    const raw = localStorage.getItem("runtime_rogue_purchased_unlocks");
    return raw ? (JSON.parse(raw) as Array<keyof UnlockFunctions>) : [];
  } catch {
    return [];
  }
}

function isUnlockPurchased(key: keyof UnlockFunctions): boolean {
  return loadPurchasedUnlocks().includes(key);
}

function purchaseUnlock(key: keyof UnlockFunctions): void {
  const owned = loadPurchasedUnlocks();
  if (owned.includes(key)) return;
  owned.push(key);
  try {
    localStorage.setItem("runtime_rogue_purchased_unlocks", JSON.stringify(owned));
  } catch {
    // ignore storage errors
  }
}

function updateCashLabel(): void {
  const el = document.getElementById("cash-label");
  if (el) el.textContent = `💰 ${runCash}`;
}

function formatClearTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, "0")}`;
}

function saveCurrentAsPreset(name: string): void {
  const preset: EditorPreset = {
    name,
    savedAt: Date.now(),
    mainLibrary: snapshotEditors(),
    daemonCode: getCode(daemonEditor),
  };
  const presets = loadPresets();
  const idx = presets.findIndex(p => p.name === name);
  if (idx !== -1) presets[idx] = preset;
  else presets.push(preset);
  savePresets(presets);
}

function applyPreset(preset: EditorPreset): void {
  clearAllEditors();
  for (const s of preset.mainLibrary) {
    addEditor(s.title, s.code, s.x, s.y, s.kind, s.h, s.w);
  }
  setCode(daemonEditor, preset.daemonCode);
}

// 適用専用の組み込みプリセット：何も書かれていないまっさらな状態を呼び出す
function applyBlankPreset(): void {
  clearAllEditors();
  addEditor("editor #1", "", 690, 20, "main");
  setCode(daemonEditor, "");
}

function deletePreset(name: string): void {
  savePresets(loadPresets().filter(p => p.name !== name));
}

function addEditor(
  name: string, initial: string, x: number, y: number,
  kind: "main" | "library" = "main",
  savedH?: number,
  savedW?: number,
): EditorEntry {
  const idx = entries.length + 1;
  const displayName = name || (kind === "library" ? `library #${idx}` : `editor #${idx}`);

  const { widget, titleEl } = createWidget(
    `editor-${Date.now()}`,
    displayName,
    x, y, savedW || 460,
    `<div class="editor-wrap"></div><div class="editor-error"></div>`,
    { editableTitle: true },
  );

  widget.classList.add("editor-widget");

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
  let autoBtn: HTMLButtonElement | null = null;
  if (kind === "main") {
    runBtn = document.createElement("button");
    runBtn.className = "widget-btn primary";
    runBtn.textContent = "▶ RUN";
    headerActions.appendChild(runBtn);

    autoBtn = document.createElement("button");
    autoBtn.className = "widget-btn autorun-btn";
    autoBtn.textContent = "⟳ AUTO";
    autoBtn.title = "endTurn() 到達時に自動でこのエディタを再実行し続けます";
    headerActions.appendChild(autoBtn);
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
  const syncWrapHeight = (h: number): void => {
    const headerH = widget.querySelector<HTMLElement>(".widget-header")?.offsetHeight ?? 32;
    wrap.style.height = `${Math.max(80, h - headerH - errorEl.offsetHeight - 24)}px`;
    editor.layout();
  };
  setupResize(widget, (_w, h) => syncWrapHeight(h));
  // ロード直後は canvasRoot が非表示（offsetHeight=0）のため、この時点の同期は無意味。
  // ゲーム画面表示時に resyncLayout() 経由で改めて呼び直す。
  syncWrapHeight(widget.offsetHeight || savedH || 300);
  const resyncLayout = () => syncWrapHeight(widget.offsetHeight);

  const entry: EditorEntry = { editor, widget, titleEl, runBtn, autoBtn, autorun: false, delBtn, errorEl, wrap, kind, resyncLayout };
  entries.push(entry);

  if (runBtn) runBtn.addEventListener("click", () => onRun(entry));
  if (autoBtn) autoBtn.addEventListener("click", () => toggleAutorun(entry));
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
  entries.forEach(e => {
    if (e.runBtn) {
      e.runBtn.disabled    = false;
      e.runBtn.textContent = "▶ RUN";
    }
  });
  (document.getElementById("end-turn-btn") as HTMLButtonElement).disabled = false;
  (document.getElementById("add-main-btn") as HTMLButtonElement).disabled = false;
  (document.getElementById("add-lib-btn")  as HTMLButtonElement).disabled = false;
  const runRemEl = document.getElementById("run-remaining");
  if (runRemEl) runRemEl.textContent = "";
}

// ── アンロック状態 ──────────────────────────────────────────────────

// チュートリアルはレール式に段階的アンロックしていく設計のため、DEFAULT_UNLOCKS（通常プレイ用）
// とは別に、原則ロック状態から開始させる。ただしendTurn()はStep5で使うため最初から使える扱いにする
// （functionキーワードと同じく、技術的なロックではなくStep5での物語上の紹介として扱う）
const TUTORIAL_INITIAL_UNLOCKS: UnlockFunctions = {
  enemyHp: false, myHp: false, myBlock: false, enemyBlock: false,
  damageDealtThisTurn: false, comboIncrement: false, turn: false,
  endTurn: true, enemyIntent: false, isUsable: false,
  myDeck: false, myHand: false, myDrawPile: false, myDiscard: false, myDeployed: false,
};

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

let activeStages: StageDef[] = STAGES;
const totalStages = () => activeStages.length;

let tutorialMode      = false;
let tutorialStepIndex = 0;

// チュートリアル中、Daemonをまだ教えていないステップではコード・実行の両方を無効化する
function tutorialDaemonLocked(): boolean {
  return tutorialMode && !TUTORIAL_STEPS[tutorialStepIndex]?.daemonEnabled;
}

// runUserCode()に渡すcharacterCards: チュートリアル中はキャラの全カードプールではなく、
// そのステップ専用のdeck（tutorialAttack等）だけを公開する
function getRunCharacterCards(): CardId[] {
  return tutorialMode
    ? TUTORIAL_STEPS[tutorialStepIndex].deck
    : getAllCharacterCards(selectedCharacter);
}

let selectedCharacter: CharacterDef = CHARACTERS[0];
let PLAYER_MAX_HP = selectedCharacter.hp;
let runStartTime = 0; // プレイ履歴用: 現在の周回(startGame)を開始したUnix時刻（tutorial中は未使用）
let runCash       = 0; // ラン単位（揮発性）通貨。ラン終了でリセット
let runByteEarned = 0; // このランで獲得したバイトの合計（run終了画面での表示用。tutorial中は未使用）

let deckCards: CardId[]   = [];
let runPlayerHp           = PLAYER_MAX_HP;
let currentStageIndex     = 0;
let state: CombatState;
let deck: Deck;
let busy            = false;
let over            = false;
let startingBattle  = false; // startBattle()の多重起動防止（ボタン連打・二重クリック対策）
let currentIntentIndex = 0; // intentPattern 内の現在位置

const INITIAL_CODE = `// 手札の関数を使って敵を倒そう！
// 例: if (enemyHp() <= 12) execute(); else attack();

attack();
`;

const LIBRARY_INITIAL_CODE = `// ライブラリ: ここで関数を定義してください
// メインエディタから呼び出せます
`;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ── ログ再生速度 ────────────────────────────────────────────────────
// バトルログ・演出（enemyTurn/action再生時のsleep）の速度倍率。1x/2x/4xを循環。
const LOG_SPEEDS = [1, 2, 4] as const;
function loadLogSpeed(): number {
  const raw = localStorage.getItem("runtime_rogue_log_speed");
  const n = raw ? Number(raw) : 1;
  return LOG_SPEEDS.includes(n as (typeof LOG_SPEEDS)[number]) ? n : 1;
}
let logSpeed = loadLogSpeed();
function scaledSleep(ms: number): Promise<void> {
  return sleep(ms / logSpeed);
}
function cycleLogSpeed(): void {
  const idx = LOG_SPEEDS.indexOf(logSpeed as (typeof LOG_SPEEDS)[number]);
  logSpeed = LOG_SPEEDS[(idx + 1) % LOG_SPEEDS.length];
  localStorage.setItem("runtime_rogue_log_speed", String(logSpeed));
  updateLogSpeedBtn();
}
function updateLogSpeedBtn(): void {
  const btn = document.getElementById("log-speed-btn");
  if (btn) btn.textContent = `⏩ ${logSpeed}x`;
}

// ── 実行中の行ハイライト・カードハイライト ──────────────────────────
// バトルログのアクション再生に合わせて、そのアクションを起こしたコード行とカードを光らせる演出。
// 常時ONにはせず、好みでOFFにできるようトグルボタンを用意する
function loadHighlightEnabled(): boolean {
  return localStorage.getItem("runtime_rogue_highlight_enabled") !== "0"; // 未設定時はON
}
let highlightEnabled = loadHighlightEnabled();
function toggleHighlight(): void {
  highlightEnabled = !highlightEnabled;
  localStorage.setItem("runtime_rogue_highlight_enabled", highlightEnabled ? "1" : "0");
  updateHighlightBtn();
}
function updateHighlightBtn(): void {
  const btn = document.getElementById("highlight-toggle-btn");
  if (btn) {
    btn.textContent = highlightEnabled ? "✨ 演出ON" : "✨ 演出OFF";
    btn.classList.toggle("active", highlightEnabled);
  }
}

// 指定行をハイライトし、新しいdecoration idを返す（呼び出し側は次回このidを渡してクリア/更新する）
function highlightEditorLine(editor: MonacoEditor, prevIds: string[], line: number): string[] {
  return editor.deltaDecorations(prevIds, [{
    range: new monaco.Range(line, 1, line, 1),
    options: { isWholeLine: true, className: "exec-line-highlight" },
  }]);
}
function clearEditorHighlight(editor: MonacoEditor, prevIds: string[]): string[] {
  return editor.deltaDecorations(prevIds, []);
}

// ── メインメニュー ──────────────────────────────────────────────────

// メインメニュー由来の画面（menu/char-select/shop/lesson/canvas-root）はどれか1つだけを表示する
function hideAllTopScreens(): void {
  canvasRoot.classList.add("hidden");
  document.getElementById("menu-screen")!.classList.add("hidden");
  document.getElementById("char-select-screen")!.classList.add("hidden");
  document.getElementById("shop-screen")!.classList.add("hidden");
  document.getElementById("lesson-screen")!.classList.add("hidden");
}

function showMenuScreen(): void {
  hideAllTopScreens();
  document.getElementById("menu-screen")!.classList.remove("hidden");
}

function showCharSelectScreen(): void {
  hideAllTopScreens();
  document.getElementById("char-select-screen")!.classList.remove("hidden");
}

function updateShopByteLabel(): void {
  const el = document.getElementById("shop-byte-label");
  if (el) el.textContent = `💾 ${loadTotalBytes()}`;
}

function showShopScreen(): void {
  hideAllTopScreens();
  renderShopLessonList();
  renderShopUnlockList();
  updateShopByteLabel();
  document.getElementById("shop-screen")!.classList.remove("hidden");
}

function showLessonScreen(): void {
  hideAllTopScreens();
  renderLessonListInto("lesson-screen-body");
  document.getElementById("lesson-screen")!.classList.remove("hidden");
}

function showGameScreen(): void {
  hideAllTopScreens();
  canvasRoot.classList.remove("hidden");
  // 表示直後は canvasRoot がまだ非表示だった間の offsetHeight(=0) を引きずっているため、
  // 見えるようになった直後に実サイズへ再同期する
  requestAnimationFrame(() => {
    entries.forEach(e => e.resyncLayout());
    daemonEditor?.layout();
  });
}

function buildMenuScreen(): void {
  const el = document.getElementById("menu-screen")!;
  el.innerHTML = `
    <div class="menu-title">RuntimeRogue</div>
    <div class="menu-subtitle">JavaScriptを書いて敵を倒せ</div>
    <button class="menu-btn" id="menu-play-btn">プレイ →</button>
    <button class="char-stats-btn" id="menu-stats-btn">📊 プレイ履歴</button>
    <button class="char-stats-btn" id="menu-shop-btn">🛒 ショップ</button>
    <button class="char-stats-btn" id="menu-lesson-list-btn">📚 レッスン一覧</button>
  `;
  document.getElementById("menu-play-btn")!.addEventListener("click", showCharSelectScreen);
  document.getElementById("menu-stats-btn")!.addEventListener("click", showStatsModal);
  document.getElementById("menu-shop-btn")!.addEventListener("click", showShopScreen);
  document.getElementById("menu-lesson-list-btn")!.addEventListener("click", showLessonScreen);
}

function buildCharSelectScreen(): void {
  const el = document.getElementById("char-select-screen")!;
  el.innerHTML = `
    <div class="char-select-title">キャラクターを選択</div>
    <button class="char-tutorial-btn" id="char-tutorial-btn">📘 チュートリアル</button>
    <button class="char-tutorial-btn" id="char-preset-btn">🧩 エディタプリセット</button>
    <div class="char-grid" id="char-grid"></div>
    <button class="char-back-btn" id="char-back-btn">← 戻る</button>
  `;

  document.getElementById("char-tutorial-btn")!.addEventListener("click", () => {
    showGameScreen();
    startTutorial();
  });

  document.getElementById("char-preset-btn")!.addEventListener("click", showPresetModal);

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
  runStartTime      = Date.now();
  runCash           = 0;
  runByteEarned     = 0;
  updateCashLabel();
  hideOverlay();
  closeRewardModal();
  clearLog();
  clearConsoleLog();

  // エラー表示のクリアのみ（エディタはリセットしない）
  entries.forEach(e => { e.errorEl.textContent = ""; });

  startBattle();
}

// ── チュートリアル ──────────────────────────────────────────────────

function setTutorialUIVisible(visible: boolean): void {
  const unlockBtn = document.getElementById("unlock-panel-btn");
  if (unlockBtn) unlockBtn.style.display = visible ? "" : "none";
  if (!visible) document.getElementById("unlock-panel")?.classList.add("hidden");
  const refBtn = document.getElementById("ref-btn");
  if (refBtn) refBtn.style.display = visible ? "" : "none";
  const addMainBtn = document.getElementById("add-main-btn");
  if (addMainBtn) addMainBtn.style.display = visible ? "" : "none";
  const presetBtn = document.getElementById("editor-preset-btn");
  if (presetBtn) presetBtn.style.display = visible ? "" : "none";
  // 「ターン終了」ボタンはチュートリアル中も常に表示する（複数ターンかかるステージで
  // 手詰まりにならないよう、endTurn()未アンロックでも手動で次ターンへ進められるようにする）

  // Daemonはチュートリアルで教えるまでUI自体を隠す
  const daemonWidget = document.getElementById("w-daemon");
  if (daemonWidget) daemonWidget.style.display = visible ? "" : "none";
}

// ごく簡易なMarkdown→HTML変換。```lang フェンスはMonacoのcolorizeでシンタックスハイライトする。
async function renderMarkdown(md: string): Promise<string> {
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  const parts: Array<{ type: "text" | "code"; content: string; lang?: string }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = codeBlockRegex.exec(md))) {
    if (match.index > lastIndex) parts.push({ type: "text", content: md.slice(lastIndex, match.index) });
    parts.push({ type: "code", content: match[2].replace(/\n$/, ""), lang: match[1] || "javascript" });
    lastIndex = codeBlockRegex.lastIndex;
  }
  if (lastIndex < md.length) parts.push({ type: "text", content: md.slice(lastIndex) });

  const htmlParts: string[] = [];
  for (const part of parts) {
    if (part.type === "code") {
      const highlighted = await colorizeCode(part.content, part.lang);
      htmlParts.push(`<pre class="tutorial-code">${highlighted}</pre>`);
    } else {
      const escaped = part.content
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const withInlineCode = escaped.replace(/`([^`]+)`/g, "<code>$1</code>");
      const withBold       = withInlineCode.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      const paragraphs = withBold
        .split(/\n\n+/)
        .filter(p => p.trim())
        .map(p => `<p>${p.replace(/\n/g, "<br>")}</p>`)
        .join("");
      htmlParts.push(paragraphs);
    }
  }
  return htmlParts.join("");
}

let tutorialWidgetEl: HTMLElement | null = null;

function removeTutorialWidget(): void {
  tutorialWidgetEl?.remove();
  tutorialWidgetEl = null;
}

function buildTutorialWidget(): void {
  removeTutorialWidget();
  const { widget } = createWidget("tutorial-widget", "📘 TUTORIAL", 20, 560, 380, `
    <div id="tutorial-widget-body" class="tutorial-widget-body"></div>
  `);
  widget.classList.add("tutorial-widget");
  setupResize(widget, (_w, h) => {
    const body = document.getElementById("tutorial-widget-body");
    if (body) body.style.height = `${Math.max(60, h - 56)}px`;
  });
  tutorialWidgetEl = widget;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function updateTutorialWidget(): Promise<void> {
  const bodyEl = document.getElementById("tutorial-widget-body");
  if (!bodyEl) return;
  const step = TUTORIAL_STEPS[tutorialStepIndex];
  const header =
    `<div class="tutorial-widget-title">${tutorialStepIndex + 1} / ${TUTORIAL_STEPS.length}: ${step.stage.name}</div>` +
    `<h3 class="tutorial-heading">${escapeHtml(step.title)}</h3>`;
  bodyEl.innerHTML = header + await renderMarkdown(step.tip);
}

// followUp（ヒント）専用の常駐ウィジェット。元のtipを表示する📘 TUTORIALとは別に、
// エラー発生時にもう1枚出現し、両方を見比べられるようにする。次のステップに進むと消える。
let tutorialHintWidgetEl: HTMLElement | null = null;

function removeTutorialHintWidget(): void {
  tutorialHintWidgetEl?.remove();
  tutorialHintWidgetEl = null;
}

async function showTutorialHintWidget(tip: string): Promise<void> {
  removeTutorialHintWidget();
  const { widget } = createWidget("tutorial-hint-widget", "💡 HINT", 610, 560, 380, `
    <div id="tutorial-hint-widget-body" class="tutorial-widget-body"></div>
  `);
  widget.classList.add("tutorial-widget");
  setupResize(widget, (_w, h) => {
    const body = document.getElementById("tutorial-hint-widget-body");
    if (body) body.style.height = `${Math.max(60, h - 56)}px`;
  });
  tutorialHintWidgetEl = widget;
  document.getElementById("tutorial-hint-widget-body")!.innerHTML = await renderMarkdown(tip);
}

async function showTutorialTipModal(): Promise<void> {
  const step = TUTORIAL_STEPS[tutorialStepIndex];
  removeTutorialHintWidget(); // 新しいステップに入るので、前のステップのヒントは消す

  document.getElementById("tutorial-modal-title")!.textContent =
    `📘 チュートリアル ${tutorialStepIndex + 1} / ${TUTORIAL_STEPS.length}: ${step.stage.name}`;
  const modalBody = document.getElementById("tutorial-modal-body")!;
  modalBody.innerHTML =
    `<h3 class="tutorial-heading">${escapeHtml(step.title)}</h3>` + await renderMarkdown(step.tip);
  document.getElementById("tutorial-modal")!.classList.remove("hidden");
  updateTutorialWidget();

  const startBtn = document.getElementById("tutorial-start-btn")!;
  startBtn.textContent = "はじめる →";
  startBtn.onclick = () => {
    document.getElementById("tutorial-modal")!.classList.add("hidden");
    if (step.daemonEnabled) {
      const daemonWidget = document.getElementById("w-daemon");
      if (daemonWidget) daemonWidget.style.display = "";
      setCode(daemonEditor, ""); // 過去のセッションの書きかけコードが残っていないよう空にする
    }
    deckCards = [...step.deck];
    startBattle();
  };
}

// バトル中にエラーが起きた際、少し待ってからヒントをポップアップ＋専用の常駐ウィジェットに表示する。
// 元のtipを表示する📘 TUTORIALウィジェットはそのまま残り、両方を見比べられる。
// バトルは中断しない（プレイヤーはそのままコードを直して再RUNできる）。
async function showTutorialFollowUp(tip: string): Promise<void> {
  await sleep(1200);
  document.getElementById("tutorial-modal-title")!.textContent = "📘 ヒント";
  document.getElementById("tutorial-modal-body")!.innerHTML = await renderMarkdown(tip);
  document.getElementById("tutorial-modal")!.classList.remove("hidden");
  showTutorialHintWidget(tip);

  const startBtn = document.getElementById("tutorial-start-btn")!;
  startBtn.textContent = "わかった";
  startBtn.onclick = () => {
    document.getElementById("tutorial-modal")!.classList.add("hidden");
    startBtn.textContent = "はじめる →";
  };
}

function startTutorial(): void {
  tutorialMode      = true;
  tutorialStepIndex = 0;
  activeStages      = TUTORIAL_STEPS.map(s => s.stage);
  devUnlocks        = { ...TUTORIAL_INITIAL_UNLOCKS };

  const char = getCharacter("loopRunner");
  selectedCharacter = char;
  PLAYER_MAX_HP     = char.hp;
  runPlayerHp       = PLAYER_MAX_HP;
  currentStageIndex = 0;

  hideOverlay();
  closeRewardModal();
  clearLog();
  clearConsoleLog();

  clearAllEditors();
  addEditor("editor #1", "", 690, 20, "main");

  setTutorialUIVisible(false);
  buildTutorialWidget();
  showTutorialTipModal();
}

function endTutorialAndReturn(): void {
  tutorialMode = false;
  activeStages = STAGES;
  setTutorialUIVisible(true);
  removeTutorialWidget();
  removeTutorialHintWidget();
  clearAllEditors();
  restoreEditorsFromStorage();
  showCharSelectScreen();
}

// ── バトル開始（ステージ切り替えでも呼ばれる） ─────────────────────

function describeGimmick(g: StageGimmick): string {
  switch (g.kind) {
    case "overkill":
      return `過負荷反撃: 1ターンの合計与ダメージが${g.threshold}以上になると、次の敵の行動が${g.multiplier}倍に強化される`;
    case "monotony":
      return `単眼看破: 同じ関数を${g.streakThreshold}回連続で呼ぶと、敵が即座にブロック+${g.blockGain}を得る`;
    case "overguard":
      return `装甲貫通: ターン終了時に自分のブロックが${g.threshold}以上残っていると、次の敵攻撃はブロックを無視する`;
    case "overcastSeal":
      return `詠唱封印: コンボ数が${g.comboThreshold}に達すると、そのターン中はコンボが増加しなくなる`;
    case "burstSpike":
      return `禁忌の一撃: 1回のカード呼び出しで${g.threshold}以上のダメージを与えると、次の敵の行動が${g.multiplier}倍に強化される`;
    case "imbalance":
      return `見切りの一撃: コンボ数が${g.threshold}に達した状態からさらに増やすたび、${g.damage}ダメージを受ける`;
    case "enrage":
      return `覚醒: ${g.turnThreshold}ターンを超えると、以降は敵の行動が徐々に強化され、コンボ増加量も減っていく`;
  }
}

function describeStoredValueGimmick(g: StoredValueGimmick): string {
  switch (g.kind) {
    case "cap":
      return `上限キャップ: 変数が${g.threshold}を超えると、超過分は即座に切り捨てられる`;
    case "absorb":
      return `被弾時吸収: 敵の攻撃行動のたび、変数の${Math.round(g.percent * 100)}%を奪われる`;
    case "decay":
      return `ガベージコレクション: release系(release/compact/bigRelease)を${g.staleThreshold}ターン使わないと、以降毎ターン変数が${Math.round(g.decayRate * 100)}%ずつ減衰し続ける`;
  }
}

async function startBattle(): Promise<void> {
  // 二重クリック等で短時間に複数回呼ばれても、実際の戦闘開始処理は1回しか走らせない
  if (startingBattle) return;
  startingBattle = true;
  try {
    await startBattleInner();
  } finally {
    startingBattle = false;
  }
}

async function startBattleInner(): Promise<void> {
  const stage = activeStages[currentStageIndex];
  currentIntentIndex = 0;
  const firstIntent = stage.intentPattern[0] ?? { kind: "attack", value: 6 };

  state = {
    player: { hp: runPlayerHp, maxHp: PLAYER_MAX_HP, block: 0 },
    enemy: {
      hp:         stage.hp,
      maxHp:      stage.hp,
      block:      0,
      vulnerable: 0,
      poison:     0,
      intent:     { ...firstIntent },
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
    costReductionMap: {},
    cachedCardId: null,
    characterId: selectedCharacter.id,
    daemonCost: MAX_DAEMON_COST,
    maxDaemonCost: MAX_DAEMON_COST,
    damageDealtThisTurn: 0,
    sameActionKind: null,
    sameActionStreak: 0,
    maxSingleHitThisTurn: 0,
    storedValue: 0,
    turnsSinceRelease: 0,
    releasedThisTurn: false,
  };
  deck = new Deck([...deckCards]);
  over = false;
  busy = true; // 戦闘開始時Daemon実行が終わるまで操作させない
  setAllRunButtons(false);
  entries.forEach(e => { e.autorun = false; updateAutoBtn(e); });
  updateDaemonDisplay();

  setEnemyName(stage.isBoss ? `👑 ${stage.name}` : stage.name);
  setStageLabel(currentStageIndex, totalStages(), !!stage.isBoss);
  setDeckCount(deckCards.length);
  setGimmick(stage.gimmick);
  clearLog();
  clearConsoleLog();
  appendLog(`=== ${stage.name} ===`, "sys");
  appendLog(`デッキ: ${deckCards.length} 枚`, "sys");
  if (stage.gimmick) {
    appendLog(`⚙ ギミック: ${describeGimmick(stage.gimmick)}`, "sys");
  }
  if (stage.storedValueGimmick) {
    appendLog(`⚙ ギミック: ${describeStoredValueGimmick(stage.storedValueGimmick)}`, "sys");
  }
  entries.forEach(e => { e.errorEl.textContent = ""; });

  // 毎ターン開始時に5枚ドロー（1ターン目分をここで実行）
  deck.draw(HAND_SIZE);
  appendLog(`─── ターン 1 ───`, "sys");
  render(state, deck);

  // 戦闘開始時にもDaemonを1回実行する（デプロイ済みが0枚なら実質何もしない）
  const characterCards = getRunCharacterCards();
  const libraryCode = entries
    .filter(e => e.kind === "library")
    .map(e => getCode(e.editor))
    .filter(c => c.trim())
    .join("\n\n") || undefined;
  const snap = getDeckSnapshot();
  // チュートリアル中はDaemonをまだ教えていないステップでは、コードも実行も無効化する
  const daemonCodeForRun = tutorialDaemonLocked() ? undefined : getCode(daemonEditor);
  const result = await runUserCode(
    "", state, deck.hand, devUnlocks, snap, 10000, libraryCode,
    deck.drawPile, deck.discardPile, characterCards,
    stage.intentPattern, currentIntentIndex,
    daemonCodeForRun, [...deck.deployedCards],
    undefined, !tutorialDaemonLocked(), stage.gimmick, stage.storedValueGimmick,
  );
  await processRunResult(result);
}


// ── AUTORUN ──────────────────────────────────────────────────────────

function updateAutoBtn(entry: EditorEntry): void {
  if (!entry.autoBtn) return;
  entry.autoBtn.classList.toggle("active", entry.autorun);
  entry.autoBtn.textContent = entry.autorun ? "⏸ AUTO" : "⟳ AUTO";
}

function toggleAutorun(entry: EditorEntry): void {
  entry.autorun = !entry.autorun;
  updateAutoBtn(entry);
  if (entry.autorun && !busy && !over) {
    onRun(entry);
  }
}

// endTurn() 到達（＝enemyTurn アクションが発生）後、コードが最後まで完走したら
// AUTO が有効な限り同じエディタを自動で再実行し続ける。
function maybeContinueAutorun(entry: EditorEntry): void {
  if (entry.autorun && !over) {
    scaledSleep(250).then(() => onRun(entry));
  }
}

// ── RUN 結果の共通処理（RUNボタン・手動ターン終了ボタン共通） ─────────

async function processRunResult(result: RunResult, entry?: EditorEntry): Promise<void> {
  appendConsoleLog(result.consoleLogs);

  // インテント位置を同期
  if (result.finalIntentIndex !== undefined) currentIntentIndex = result.finalIntentIndex;

  // Sync hand/drawPile/discardPile from worker result
  if (result.finalHand !== undefined) deck.hand = result.finalHand;
  if (result.finalDrawPile !== undefined) deck.drawPile = result.finalDrawPile;
  if (result.finalDiscardPile !== undefined) deck.discardPile = result.finalDiscardPile;
  if (result.finalDeployedCardIds !== undefined) deck.deployedCards = result.finalDeployedCardIds;

  // Handle disposed cards
  if (result.disposedCardIds) {
    for (const id of result.disposedCardIds) {
      deck.disposeCard(id as CardId);
    }
  }

  let mainLineDecorations: string[] = [];
  let daemonLineDecorations: string[] = [];

  for (const action of result.actions) {
    if (action.kind === "enemyTurn") {
      // 敵ターンのアニメーション
      const text = applyAction(state, action);
      if (action.poisonDmg > 0) {
        appendLog(`☠ 毒 ${action.poisonDmg} ダメージ`, "dmg");
      }
      const isEnemyHeal = action.intent.kind === "block";
      appendLog(`─── ターン ${state.turn} ───`, "sys");
      appendLog(text, isEnemyHeal ? "heal" : "dmg");
      render(state, deck, getDisabledCards());
      updateDaemonDisplay();
      await scaledSleep(300);
      if (state.player.hp <= 0) break;
      continue;
    }

    if (highlightEnabled) {
      const targetEditor = action.viaDaemon ? daemonEditor : entry?.editor;
      if (targetEditor && action.sourceLine !== undefined) {
        if (action.viaDaemon) {
          daemonLineDecorations = highlightEditorLine(targetEditor, daemonLineDecorations, action.sourceLine);
        } else {
          mainLineDecorations = highlightEditorLine(targetEditor, mainLineDecorations, action.sourceLine);
        }
      }
    }

    const text = applyAction(state, action, action.viaDaemon ? "daemon" : "energy");
    const isHeal = action.kind === "heal" || action.kind === "block" ||
                   action.kind === "lrBlock" || action.kind === "reboot" ||
                   action.kind === "patch" || action.kind === "initialize" ||
                   action.kind === "incrementalBlock" ||
                   action.kind === "bufferOverflowProtection" ||
                   action.kind === "overclockBurst";
    appendLog(action.viaDaemon ? `🤖 ${text}` : text, isHeal ? "heal" : "dmg");
    render(state, deck, getDisabledCards(), highlightEnabled ? action.cardId : undefined);
    if (action.viaDaemon) updateDaemonDisplay();
    await scaledSleep(action.viaDaemon ? 60 : 180);
    if (state.enemy.hp <= 0) break;
  }

  // ループ終了後、ハイライトを解除する（次の実行や別カードに引き継がない）
  if (entry?.editor) mainLineDecorations = clearEditorHighlight(entry.editor, mainLineDecorations);
  if (daemonEditor)  daemonLineDecorations = clearEditorHighlight(daemonEditor, daemonLineDecorations);
  render(state, deck, getDisabledCards());

  // deploy() 等、actions配列を経由しないMain Clock変動を最終的に同期する
  if (result.finalEnergy !== undefined) state.energy = result.finalEnergy;

  // comboCount等の「ターン中持続するメタ状態」はactions配列を経由せずワーカー内でのみ
  // 更新されるため、複数回RUNしても引き継がれるようここで明示的に同期する
  // （Daemon/Main Thread間で共有されるのもこの同期によって成立する）
  if (result.finalState) {
    state.comboCount         = result.finalState.comboCount;
    state.comboIncrement     = result.finalState.comboIncrement;
    state.asyncAwaitActive   = result.finalState.asyncAwaitActive;
    state.uniqueUsedThisTurn = result.finalState.uniqueUsedThisTurn;
    state.costZeroCardIds    = result.finalState.costZeroCardIds;
    state.costReductionMap   = result.finalState.costReductionMap;
    state.cachedCardId       = result.finalState.cachedCardId;
    state.rebootUsedThisTurn = result.finalState.rebootUsedThisTurn;
    state.sameActionKind       = result.finalState.sameActionKind;
    state.sameActionStreak     = result.finalState.sameActionStreak;
    state.maxSingleHitThisTurn = result.finalState.maxSingleHitThisTurn;
    state.storedValue          = result.finalState.storedValue;
    state.turnsSinceRelease    = result.finalState.turnsSinceRelease;
    state.releasedThisTurn     = result.finalState.releasedThisTurn;
  }

  updateDaemonDisplay();

  if (result.error) {
    if (entry) {
      entry.errorEl.textContent = `⚠ ${result.error}`;
      if (entry.autorun) {
        entry.autorun = false;
        updateAutoBtn(entry);
        appendLog("⚠ エラーのため AUTO を停止しました", "err");
      }
    } else {
      appendLog(`⚠ ${result.error}`, "err");
    }
    if (tutorialMode) {
      const followUp = TUTORIAL_STEPS[tutorialStepIndex].followUp;
      // エラーと同時に敵を倒した/やられた場合、1200ms遅延で出るヒントが
      // 後からクリア/敗北モーダルの上に重なって表示されてしまうため、そのケースは出さない
      const stageAlreadyOver =
        result.combatResult === "victory" || result.combatResult === "defeat" ||
        state.enemy.hp <= 0 || state.player.hp <= 0;
      if (followUp && !stageAlreadyOver) showTutorialFollowUp(followUp.tip);
    }
  } else if (result.info) {
    appendLog(result.info, "err");
  }

  render(state, deck, getDisabledCards());

  // 戦闘終了判定
  if (result.combatResult === "victory" || state.enemy.hp <= 0) return finish(true);
  if (result.combatResult === "defeat"  || state.player.hp <= 0) return finish(false);

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
      if (entry) maybeContinueAutorun(entry);
    });
    return;
  }


  busy = false;
  restoreButtons();
  if (entry && !result.error) maybeContinueAutorun(entry);
}

// ── RUN ────────────────────────────────────────────────────────────

async function onRun(entry: EditorEntry): Promise<void> {
  if (busy || over) return;
  busy = true;
  setAllRunButtons(false);
  entry.errorEl.textContent = "";

  const libraryCode = entries
    .filter(e => e.kind === "library")
    .map(e => getCode(e.editor))
    .filter(c => c.trim())
    .join("\n\n") || undefined;

  const snap         = getDeckSnapshot();
  const characterCards = getRunCharacterCards();
  const stage        = activeStages[currentStageIndex];

  const allowedFns = tutorialMode ? TUTORIAL_STEPS[tutorialStepIndex].allowedFns : undefined;
  // チュートリアル中はDaemonをまだ教えていないステップでは、コードも実行も無効化する
  const daemonCodeForRun = tutorialDaemonLocked() ? undefined : getCode(daemonEditor);

  const result = await runUserCode(
    getCode(entry.editor), state, deck.hand, devUnlocks, snap, 10000, libraryCode,
    deck.drawPile, deck.discardPile, characterCards,
    stage.intentPattern, currentIntentIndex,
    daemonCodeForRun, [...deck.deployedCards],
    allowedFns, false, stage.gimmick, stage.storedValueGimmick,
  );
  await processRunResult(result, entry);
}

// ── ターン終了（手動ボタン。endTurn() 関数呼び出しと完全に同じ処理を行う） ──

async function onEndTurn(): Promise<void> {
  if (busy || over) return;
  busy = true;
  setAllRunButtons(false);

  const characterCards = getRunCharacterCards();
  const stage          = activeStages[currentStageIndex];
  const libraryCode = entries
    .filter(e => e.kind === "library")
    .map(e => getCode(e.editor))
    .filter(c => c.trim())
    .join("\n\n") || undefined;
  const snap = getDeckSnapshot();
  // チュートリアル中はDaemonをまだ教えていないステップでは、コードも実行も無効化する
  const daemonCodeForRun = tutorialDaemonLocked() ? undefined : getCode(daemonEditor);

  const result = await runUserCode(
    "endTurn();", state, deck.hand, devUnlocks, snap, 10000, libraryCode,
    deck.drawPile, deck.discardPile, characterCards,
    stage.intentPattern, currentIntentIndex,
    daemonCodeForRun, [...deck.deployedCards],
    undefined, false, stage.gimmick, stage.storedValueGimmick,
  );
  await processRunResult(result);
}

// ── バトル終了 ──────────────────────────────────────────────────────

async function finish(win: boolean): Promise<void> {
  over = true;
  busy = false;
  setAllRunButtons(false);
  render(state, deck);

  if (!win) {
    if (tutorialMode) {
      appendLog("💀 やられてしまった…もう一度挑戦しよう", "sys");
      showOverlay("💀 もう一度！");
      removeTutorialHintWidget(); // 前回の挑戦で出たヒントは、リトライ時にはリセットする
      await sleep(1200);
      hideOverlay();
      startBattle();
      return;
    }
    appendLog("💀 敗北...", "sys");
    if (!tutorialMode) {
      const totalBytes = loadTotalBytes();
      appendLog(`💾 バイト +${runByteEarned}（累計 ${totalBytes}）`, "sys");
    }
    showOverlay("💀 GAME OVER");
    recordGameOver(selectedCharacter.id);
    return;
  }

  const clearedStageName = activeStages[currentStageIndex].name;
  appendLog(`✅ ${clearedStageName} を倒した！`, "sys");

  const healed = Math.floor(PLAYER_MAX_HP * HEAL_RATE);
  runPlayerHp  = Math.min(PLAYER_MAX_HP, state.player.hp + healed);
  appendLog(`💊 HP +${healed} 回復 → ${runPlayerHp}`, "heal");

  // Restore disposed cards on stage clear
  deck.restoreDisposedCards();

  let cashEarned = 0;
  if (!tutorialMode) {
    const clearedStage = activeStages[currentStageIndex];
    cashEarned = jitterReward(clearedStage.cashReward!, CASH_JITTER);
    const byteEarned = jitterReward(clearedStage.byteReward!, BYTE_JITTER);
    runCash += cashEarned;
    runByteEarned += byteEarned;
    addBytes(byteEarned);
    updateCashLabel();
    appendLog(`💰 キャッシュ +${cashEarned}`, "sys");
  }

  if (currentStageIndex >= totalStages() - 1) {
    if (tutorialMode) {
      appendLog(TUTORIAL_COMPLETE_LOG, "sys");
      showOverlay(TUTORIAL_COMPLETE_OVERLAY);
      await sleep(1800);
      hideOverlay();
      endTutorialAndReturn();
      return;
    }
    // 全クリアの達成感を出すため、ステージごとの直線報酬とは別枠でボスボーナスを一律加算する（ジッターなし）
    runByteEarned += BOSS_CLEAR_BONUS;
    addBytes(BOSS_CLEAR_BONUS);
    const totalBytes = loadTotalBytes();
    appendLog(`💾 バイト +${runByteEarned}（うちボス撃破ボーナス +${BOSS_CLEAR_BONUS}）（累計 ${totalBytes}）`, "sys");
    appendLog("🏆 全ステージクリア！", "sys");
    showOverlay("🏆 CLEAR!");
    recordClear(selectedCharacter.id, Date.now() - runStartTime);
    return;
  }

  currentStageIndex++;

  const victoryLines = [`✅ ${clearedStageName} を倒した！`, `💊 HP +${healed} 回復 → ${runPlayerHp}`];
  if (!tutorialMode) victoryLines.push(`💰 キャッシュ +${cashEarned}`);

  showVictoryModal(
    victoryLines,
    () => {
      if (tutorialMode) {
        // チュートリアルはランダム報酬なし。各ステージで必要なカードだけを次のtipで指定する。
        tutorialStepIndex++;
        showTutorialTipModal();
        return;
      }

      showRewardScreen(selectedCharacter, (picked) => {
        if (picked) {
          deckCards.push(picked);
          appendLog(`✨ 「${CARDS[picked]?.signature ?? picked}」をデッキに追加`, "sys");
        } else {
          appendLog("スキップ", "sys");
        }
        startBattle();
      });
    },
  );
}

// ── 関数リファレンスモーダル ────────────────────────────────────────

// キャラカード・スターターカードは表示しない（後々別途実装予定）。
// 常時ON関数・アンロック関数のみを対象に、アンロック済みを上、未アンロックを下（グレーアウト・クリック不可）に表示する。
// devUnlocksの変化を反映するため、モーダルを開くたびに再描画する。
function renderRefList(): void {
  const body = document.getElementById("ref-body")!;
  body.innerHTML = "";

  const stripSnippet = (s: string) => s.replace(/\$\{1:([^}]*)\}/, "$1");

  type RefRow = { sig: string; desc: string; locked: boolean; lesson?: LessonDef };
  const rows: RefRow[] = [
    ...READ_ITEMS.map(item => ({ sig: stripSnippet(item.insert), desc: item.doc, locked: false })),
    ...UNLOCKABLE_ITEMS.map(item => ({
      sig: stripSnippet(item.insert),
      desc: item.doc,
      locked: !devUnlocks[item.key],
      lesson: LESSONS.find(l => l.requiresFn === item.key && isLessonPurchased(l.id)),
    })),
  ];
  rows.sort((a, b) => Number(a.locked) - Number(b.locked)); // アンロック済み(false)が先、未アンロック(true)が後（安定ソート）

  for (const row of rows) {
    const rowEl = document.createElement("div");
    rowEl.className = "ref-row" + (row.locked ? " ref-row-locked" : "");
    rowEl.innerHTML = `
      <div class="ref-row-top">
        <code class="ref-sig">${row.sig}</code>
        ${row.locked ? '<span class="ref-locked-badge">🔒 未アンロック</span>' : ""}
        ${row.lesson ? '<button class="ref-lesson-btn">📖 レッスンを見る</button>' : ""}
      </div>
      <div class="ref-desc">${row.desc}</div>
    `;
    if (row.lesson) {
      const lesson = row.lesson;
      rowEl.querySelector(".ref-lesson-btn")!.addEventListener("click", (e) => {
        e.stopPropagation();
        showLessonContent(lesson);
      });
    }
    if (!row.locked) {
      rowEl.addEventListener("click", () => {
        const target = lastFocused ?? entries[0]?.editor;
        if (target) insertText(target, `${row.sig};\n`);
        document.getElementById("ref-modal")!.classList.add("hidden");
      });
    }
    body.appendChild(rowEl);
  }
}

// ── レッスン内容モーダル ──────────────────────────────────────────

function buildLessonContentModal(): void {
  const modal = document.createElement("div");
  modal.id = "lesson-content-modal";
  modal.className = "pile-modal hidden";

  const backdrop = document.createElement("div");
  backdrop.className = "pile-backdrop";
  backdrop.addEventListener("click", closeLessonContentModal);

  const popup = document.createElement("div");
  popup.className = "pile-popup lesson-popup";
  popup.innerHTML = `
    <div class="pile-popup-header">
      <span class="pile-popup-title" id="lesson-content-title">📚 レッスン</span>
      <button class="pile-popup-close" id="lesson-content-close">✕</button>
    </div>
    <div id="lesson-content-body" class="lesson-content-body tutorial-modal-body"></div>
  `;

  modal.append(backdrop, popup);
  document.body.appendChild(modal);

  document.getElementById("lesson-content-close")!.addEventListener("click", closeLessonContentModal);
}

async function showLessonContent(lesson: LessonDef): Promise<void> {
  // 戦闘中（キャンバス表示中）は、モーダルではなくキャンバス上のレッスンウィンドウとして開く。
  // メインメニュー側（ショップ・レッスン一覧画面）では従来通り内容モーダルを表示する
  if (!canvasRoot.classList.contains("hidden")) {
    closeLessonListModal();
    document.getElementById("ref-modal")?.classList.add("hidden");
    await openLessonWindow(lesson);
    return;
  }
  document.getElementById("lesson-content-title")!.textContent = `📚 ${lesson.title}`;
  document.getElementById("lesson-content-body")!.innerHTML = await renderMarkdown(lesson.body);
  document.getElementById("lesson-content-modal")!.classList.remove("hidden");
}

function closeLessonContentModal(): void {
  document.getElementById("lesson-content-modal")?.classList.add("hidden");
}

// ── レッスンウィンドウ（戦闘中のキャンバス上に表示） ──────────────────
// エディタ等と同じキャンバス上のウィジェットとして開く。閉じるまで戦闘をまたいでも残るが、
// エディタと違いlocalStorageには保存しない（リロードで消える。数クリックで開き直せるため）

const lessonWindows = new Map<string, HTMLElement>(); // lesson.id → widget要素

// ズームを100%に戻し、指定ウィジェットが画面中央に来るようにパンする
// （キャンバスのtransformは translate(cvX,cvY) scale(cvScale) なので、screen = cv + pos * scale）
function centerCanvasOnWidget(widget: HTMLElement): void {
  cvScale = 1;
  const wx = parseFloat(widget.style.left) || 0;
  const wy = parseFloat(widget.style.top)  || 0;
  cvX = (window.innerWidth  - widget.offsetWidth)  / 2 - wx;
  cvY = (window.innerHeight - widget.offsetHeight) / 2 - wy;
  updateCanvas();
}

async function openLessonWindow(lesson: LessonDef): Promise<void> {
  const existing = lessonWindows.get(lesson.id);
  if (existing) {
    bringToFront(existing);
    centerCanvasOnWidget(existing);
    return;
  }

  // 現在のビュー中央付近（キャンバス座標）に配置。連続で開いたとき完全に重ならないよう少しずらす
  const width   = 420;
  const cascade = lessonWindows.size * 28;
  const wx = (window.innerWidth  / 2 - cvX) / cvScale - width / 2 + cascade;
  const wy = (window.innerHeight / 2 - cvY) / cvScale - 200 + cascade;

  const { widget } = createWidget(`lesson-${lesson.id}`, `📚 ${lesson.title}`, wx, wy, width, `
    <div class="lesson-window-body tutorial-widget-body"></div>
  `);
  lessonWindows.set(lesson.id, widget);

  const closeBtn = document.createElement("button");
  closeBtn.className = "widget-btn danger";
  closeBtn.textContent = "✕";
  widget.querySelector(".widget-header-actions")!.appendChild(closeBtn);
  closeBtn.addEventListener("click", () => {
    widget.remove();
    lessonWindows.delete(lesson.id);
  });

  setupResize(widget, (_w, h) => {
    const body = widget.querySelector<HTMLElement>(".lesson-window-body");
    if (body) body.style.height = `${Math.max(60, h - 56)}px`;
  });

  widget.querySelector<HTMLElement>(".lesson-window-body")!.innerHTML = await renderMarkdown(lesson.body);

  bringToFront(widget);
  centerCanvasOnWidget(widget);
}

// ── レッスン一覧（購入済みのみを表示する閲覧専用） ────────────────────
// メインメニュー起点は専用画面（#lesson-screen）、戦闘中HUD起点は引き続きモーダル（#lesson-list-modal）。
// どちらも同じ一覧描画ロジック（renderLessonListInto）を共有する

function buildLessonListModal(): void {
  const modal = document.createElement("div");
  modal.id = "lesson-list-modal";
  modal.className = "pile-modal hidden";

  const backdrop = document.createElement("div");
  backdrop.className = "pile-backdrop";
  backdrop.addEventListener("click", closeLessonListModal);

  const popup = document.createElement("div");
  popup.className = "pile-popup lesson-list-popup";
  popup.innerHTML = `
    <div class="pile-popup-header">
      <span class="pile-popup-title">📚 レッスン一覧</span>
      <button class="pile-popup-close" id="lesson-list-close">✕</button>
    </div>
    <div id="lesson-list-body" class="shop-lesson-list"></div>
  `;

  modal.append(backdrop, popup);
  document.body.appendChild(modal);

  document.getElementById("lesson-list-close")!.addEventListener("click", closeLessonListModal);
}

function buildLessonScreen(): void {
  const el = document.getElementById("lesson-screen")!;
  el.innerHTML = `
    <div class="char-select-title">📚 レッスン一覧</div>
    <div id="lesson-screen-body" class="shop-lesson-list"></div>
    <button class="char-back-btn" id="lesson-screen-back-btn">← 戻る</button>
  `;
  document.getElementById("lesson-screen-back-btn")!.addEventListener("click", showMenuScreen);
}

function renderLessonListInto(containerId: string): void {
  const listEl = document.getElementById(containerId)!;
  listEl.innerHTML = "";

  const owned = LESSONS.filter(l => isLessonPurchased(l.id));
  if (owned.length === 0) {
    const empty = document.createElement("div");
    empty.className = "pile-popup-empty";
    empty.textContent = "まだ購入したレッスンはありません（🛒 ショップから購入できます）";
    listEl.appendChild(empty);
    return;
  }

  for (const lesson of owned) {
    const row = document.createElement("div");
    row.className = "shop-lesson-row";
    row.innerHTML = `
      <div class="shop-lesson-info">
        <span class="shop-lesson-title">${lesson.title}</span>
      </div>
      <div class="shop-lesson-actions"><button class="widget-btn shop-view-btn">📖 見る</button></div>
    `;
    row.querySelector(".shop-view-btn")!.addEventListener("click", () => showLessonContent(lesson));
    listEl.appendChild(row);
  }
}

function renderLessonList(): void {
  renderLessonListInto("lesson-list-body");
}

function showLessonListModal(): void {
  renderLessonList();
  document.getElementById("lesson-list-modal")!.classList.remove("hidden");
}

function closeLessonListModal(): void {
  document.getElementById("lesson-list-modal")?.classList.add("hidden");
}

// ── ショップ画面 ────────────────────────────────────────────────────

function buildShopScreen(): void {
  const el = document.getElementById("shop-screen")!;
  el.innerHTML = `
    <span id="shop-byte-label" class="cash-label shop-byte-label">💾 0</span>
    <div class="char-select-title">🛒 ショップ</div>
    <div class="shop-section-label">📚 レッスン</div>
    <div id="shop-lesson-list" class="shop-lesson-list"></div>
    <div class="shop-section-label">🔓 アンロック関数</div>
    <div id="shop-unlock-list" class="shop-lesson-list"></div>
    <div class="shop-footer">💡 購入は記録されますが、現時点ではゲーム内の挙動（使える関数）はまだ変わりません</div>
    <button class="char-back-btn" id="shop-screen-back-btn">← 戻る</button>
  `;
  document.getElementById("shop-screen-back-btn")!.addEventListener("click", showMenuScreen);
}

function renderShopUnlockList(): void {
  const listEl = document.getElementById("shop-unlock-list")!;
  listEl.innerHTML = "";

  const items = [...UNLOCKABLE_ITEMS].sort((a, b) => a.byteCost - b.byteCost);

  for (const item of items) {
    const owned      = isUnlockPurchased(item.key);
    const totalBytes = loadTotalBytes();
    const affordable = totalBytes >= item.byteCost;

    const row = document.createElement("div");
    row.className = "shop-lesson-row";
    row.innerHTML = `
      <div class="shop-lesson-info">
        <span class="shop-lesson-title">${item.label}()</span>
        <span class="shop-lesson-req">${item.doc}</span>
      </div>
      <div class="shop-lesson-actions">
        ${owned
          ? `<span class="shop-owned-badge">✅ 購入済み</span>`
          : `<button class="widget-btn primary shop-buy-btn" ${affordable ? "" : "disabled"}>💾 ${item.byteCost} で購入</button>`}
      </div>
    `;

    if (!owned) {
      row.querySelector(".shop-buy-btn")!.addEventListener("click", () => {
        if (!trySpendBytes(item.byteCost)) return;
        purchaseUnlock(item.key);
        renderShopUnlockList();
        updateShopByteLabel();
      });
    }

    listEl.appendChild(row);
  }
}

function renderShopLessonList(): void {
  const listEl = document.getElementById("shop-lesson-list")!;
  listEl.innerHTML = "";

  for (const lesson of LESSONS) {
    const owned         = isLessonPurchased(lesson.id);
    const prereqMet     = !lesson.requiresFn || devUnlocks[lesson.requiresFn];
    const totalBytes    = loadTotalBytes();
    const affordable    = totalBytes >= lesson.byteCost;

    const row = document.createElement("div");
    row.className = "shop-lesson-row";

    let statusHtml: string;
    if (owned) {
      statusHtml = `<button class="widget-btn shop-view-btn">📖 見る</button>`;
    } else if (!prereqMet) {
      statusHtml = `<span class="shop-locked-note">🔒 ${lesson.requiresFn}() をアンロックしてください</span>`;
    } else {
      statusHtml = `<button class="widget-btn primary shop-buy-btn" ${affordable ? "" : "disabled"}>💾 ${lesson.byteCost} で購入</button>`;
    }

    row.innerHTML = `
      <div class="shop-lesson-info">
        <span class="shop-lesson-title">${lesson.title}</span>
        <span class="shop-lesson-req">${lesson.requiresFn ? `前提: ${lesson.requiresFn}()` : "前提条件なし"}</span>
      </div>
      <div class="shop-lesson-actions">${statusHtml}</div>
    `;

    if (owned) {
      row.querySelector(".shop-view-btn")!.addEventListener("click", () => showLessonContent(lesson));
    } else if (prereqMet) {
      const buyBtn = row.querySelector(".shop-buy-btn") as HTMLButtonElement | null;
      buyBtn?.addEventListener("click", () => {
        if (!trySpendBytes(lesson.byteCost)) return;
        purchaseLesson(lesson.id);
        renderShopLessonList();
        updateShopByteLabel();
      });
    }

    listEl.appendChild(row);
  }
}

function buildReferenceModal(): void {
  const modal = document.createElement("div");
  modal.id = "ref-modal";
  modal.className = "pile-modal hidden";

  const backdrop = document.createElement("div");
  backdrop.className = "pile-backdrop";
  backdrop.addEventListener("click", () => modal.classList.add("hidden"));

  const popup = document.createElement("div");
  popup.className = "pile-popup ref-popup";
  popup.innerHTML = `
    <div class="pile-popup-header">
      <span class="pile-popup-title">📖 関数リファレンス</span>
      <button class="pile-popup-close" id="ref-close-btn">✕</button>
    </div>
    <div id="ref-body" class="ref-body"></div>
  `;

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
  refBtn.addEventListener("click", () => {
    renderRefList();
    modal.classList.toggle("hidden");
  });

  const lessonListBtn = document.createElement("button");
  lessonListBtn.id = "lesson-list-btn";
  lessonListBtn.textContent = "📚 レッスン一覧";
  hudEl.insertBefore(lessonListBtn, refBtn.nextSibling);
  lessonListBtn.addEventListener("click", showLessonListModal);
}

// ── ホームボタン ────────────────────────────────────────────────────

document.getElementById("home-btn")!.addEventListener("click", () => {
  if (confirm("ゲームを終了してメインメニューに戻りますか？")) {
    if (tutorialMode) {
      endTutorialAndReturn();
    } else {
      showMenuScreen();
    }
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

document.getElementById("editor-preset-btn")!.addEventListener("click", showPresetModal);
updateLogSpeedBtn();
document.getElementById("log-speed-btn")!.addEventListener("click", cycleLogSpeed);
updateHighlightBtn();
document.getElementById("highlight-toggle-btn")!.addEventListener("click", toggleHighlight);

document.getElementById("end-turn-btn")!.addEventListener("click", onEndTurn);
document.getElementById("restart-btn")!.addEventListener("click", () => {
  if (tutorialMode) endTutorialAndReturn();
  else showMenuScreen();
});

// ── 起動 ────────────────────────────────────────────────────────────

buildPileModal();
buildCyclerModal();
buildRewardModal();
buildVictoryModal();
buildPresetModal();
buildStatsModal();
buildTutorialModal();
buildReferenceModal();
buildLessonContentModal();
buildLessonListModal();
buildEnemyWidget();
buildPlayerWidget();
buildLogWidget();
buildDeckWidget();
buildConsoleWidget();
buildDaemonWidget();

// エディタ復元 or デフォルト
function clearAllEditors(): void {
  for (const e of [...entries]) {
    e.editor.dispose();
    e.widget.remove();
    const idx = entries.indexOf(e);
    if (idx !== -1) entries.splice(idx, 1);
  }
}

function restoreEditorsFromStorage(): void {
  const savedEditors = loadEditorState();
  if (savedEditors && savedEditors.length > 0) {
    for (const s of savedEditors) {
      addEditor(s.title, s.code, s.x, s.y, s.kind, s.h, s.w);
    }
  } else {
    addEditor("editor #1", INITIAL_CODE, 690, 20, "main");
  }
}

restoreEditorsFromStorage();

updateCanvas();
buildMenuScreen();
buildCharSelectScreen();
buildShopScreen();
buildLessonScreen();
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
  const unlockRows = UNLOCKABLE_ITEMS.map(item => `
    <label class="unlock-row">
      <span class="unlock-name">${item.insert.replace(/\$\{1:([^}]*)\}/, "$1")}</span>
      <span class="unlock-desc">${item.doc}</span>
      <label class="toggle-switch">
        <input type="checkbox" data-key="${item.key}">
        <span class="toggle-slider"></span>
      </label>
    </label>
  `).join("");

  panel.innerHTML = `
    <div class="unlock-panel-header">
      <span>🔓 アンロック関数 <span class="dev-badge">DEV</span></span>
      <button class="pile-popup-close" id="unlock-panel-close">✕</button>
    </div>
    <div class="unlock-panel-body">
      <div class="unlock-section-label">個別アンロック（コインショップ実装まではここで一時ON/OFF）</div>
      ${unlockRows}
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

  // ── DEVメニュー（メインメニュー右上） ────────────────────────────
  const devMenuBtn = document.createElement("button");
  devMenuBtn.id = "dev-menu-btn";
  devMenuBtn.className = "dev-menu-btn";
  devMenuBtn.textContent = "🛠 DEVメニュー";
  document.getElementById("menu-screen")!.appendChild(devMenuBtn);

  const devMenuPanel = document.createElement("div");
  devMenuPanel.id = "dev-menu-panel";
  devMenuPanel.className = "dev-menu-panel hidden";
  devMenuPanel.innerHTML = `
    <div class="unlock-panel-header">
      <span>🛠 DEVメニュー <span class="dev-badge">DEV</span></span>
      <button class="pile-popup-close" id="dev-menu-close">✕</button>
    </div>
    <div class="unlock-panel-body">
      <div class="unlock-section-label">バイトを追加</div>
      <div class="dev-menu-row">
        <input type="number" id="dev-menu-byte-input" class="dev-menu-input" value="1000" min="0" />
        <button class="widget-btn primary" id="dev-menu-add-bytes-btn">➕ 追加</button>
      </div>
      <div class="unlock-section-label">購入済みアイテムをリセット</div>
      <div class="dev-menu-row">
        <button class="widget-btn danger" id="dev-menu-reset-purchases-btn">🔄 レッスン・アンロックを未購入に戻す</button>
      </div>
    </div>
  `;
  document.getElementById("menu-screen")!.appendChild(devMenuPanel);

  devMenuBtn.addEventListener("click", () => devMenuPanel.classList.toggle("hidden"));
  document.getElementById("dev-menu-close")!.addEventListener("click", () => {
    devMenuPanel.classList.add("hidden");
  });
  document.getElementById("dev-menu-add-bytes-btn")!.addEventListener("click", () => {
    const input  = document.getElementById("dev-menu-byte-input") as HTMLInputElement;
    const amount = parseInt(input.value, 10);
    if (!Number.isFinite(amount) || amount <= 0) return;
    addBytes(amount);
  });
  document.getElementById("dev-menu-reset-purchases-btn")!.addEventListener("click", () => {
    localStorage.removeItem("runtime_rogue_lessons");
    localStorage.removeItem("runtime_rogue_purchased_unlocks");
  });
}

void CARDS;
