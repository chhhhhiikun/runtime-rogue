import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import TsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

import { CARDS, type CardId } from "../game/cards";
import type { UnlockFunctions } from "../sandbox/runCode";

// ── Monaco Worker セットアップ ──────────────────────────────────────

(window as { MonacoEnvironment?: unknown }).MonacoEnvironment = {
  getWorker(_: unknown, label: string) {
    if (label === "typescript" || label === "javascript") return new TsWorker();
    return new EditorWorker();
  },
};

// ── カスタムテーマ ──────────────────────────────────────────────────

monaco.editor.defineTheme("runtime-rogue-dark", {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "comment",    foreground: "5b6478" },
    { token: "string",     foreground: "ce9178" },
    { token: "number",     foreground: "b5cea8" },
    { token: "keyword",    foreground: "569cd6" },
    { token: "delimiter",  foreground: "e6e9f0" },
  ],
  colors: {
    "editor.background":                      "#1a1f2b",
    "editor.foreground":                      "#e6e9f0",
    "editor.lineHighlightBackground":         "#222838",
    "editor.selectionBackground":             "#2a3a5c",
    "editorCursor.foreground":                "#6ad1ff",
    "editorGutter.background":                "#1a1f2b",
    "editorLineNumber.foreground":            "#5b6478",
    "editorLineNumber.activeForeground":      "#9aafc8",
    "editorWidget.background":                "#1d2230",
    "editorWidget.border":                    "#333b50",
    "editorSuggestWidget.background":         "#1d2230",
    "editorSuggestWidget.border":             "#333b50",
    "editorSuggestWidget.selectedBackground": "#2a3550",
    "editorSuggestWidget.foreground":         "#e6e9f0",
    "editorSuggestWidget.highlightForeground":"#6ad1ff",
    "editorSuggestWidget.focusHighlightForeground":"#6ad1ff",
    "list.hoverBackground":                   "#222838",
  },
});

// ── API 型宣言（Monaco の型推論を助ける） ──────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(monaco.languages as any).typescript.javascriptDefaults.addExtraLib(`
declare function enemyHp(): number;
declare function myHp(): number;
declare function myBlock(): number;
declare function mainClock(): number;
declare function daemonCost(): number;
declare function enemyBlock(): number;
declare function enemyIntent(): { kind: "attack" | "block"; value: number; boosted?: boolean; ignoresBlock?: boolean };
declare function comboCount(): number;
declare function damageDealtThisTurn(): number;
declare function sameActionStreak(): number;
declare function comboIncrement(): number;
declare function turn(): number;
declare function storedValue(): number;
declare function turnsSinceRelease(): number;
declare function isUsable(fn: string): boolean;
declare function cardCost(fn: string): number;
declare function deploy(fn: string): void;
declare function myHand(): string[];
declare function myDeck(): string[];
declare function myDrawPile(): string[];
declare function myDiscard(): string[];
declare function myDeployed(): string[];
declare function endTurn(): void;
declare function attack(): void;
declare function block(): void;
`, "runtime-rogue-api.d.ts");

// ── 補完プロバイダ ──────────────────────────────────────────────────

let _getHand: () => CardId[] = () => [];
let _getUnlocks: () => UnlockFunctions = () => ({
  enemyHp: false, myHp: false, myBlock: false, enemyBlock: false,
  damageDealtThisTurn: false, comboIncrement: false, turn: false,
  endTurn: false, enemyIntent: false, isUsable: false,
  myDeck: false, myHand: false, myDrawPile: false, myDiscard: false, myDeployed: false,
  cardCost: false,
});
let _providerRegistered = false;

// 常時ON（アンロック不要）
export const READ_ITEMS: Array<{ label: string; insert: string; detail: string; doc: string }> = [
  { label: "mainClock",   insert: "mainClock()",   detail: "() → number",       doc: "残りMain Clock" },
  { label: "daemonCost",  insert: "daemonCost()",  detail: "() → number",       doc: "残りDaemon Cost" },
  { label: "comboCount",  insert: "comboCount()",  detail: "() → number",       doc: "現在のコンボカウンター値" },
  { label: "sameActionStreak",    insert: "sameActionStreak()",    detail: "() → number", doc: "同じ関数を連続で呼んだ回数" },
  { label: "storedValue",         insert: "storedValue()",         detail: "() → number", doc: "Object Breakerの変数に蓄積されている値" },
  { label: "turnsSinceRelease",   insert: "turnsSinceRelease()",   detail: "() → number", doc: "release系(release/compact/bigRelease)を最後に使ってから経過したターン数" },
  { label: "deploy",      insert: "deploy(\"${1:attack}\")",   detail: "(fn: string) → void",    doc: "手札のカードをDaemonへ常駐化する（コスト: 基礎コスト×2をMain Clockから消費）" },
];

// 個別にアンロックする関数。byteCostは情報の価値に応じた6段階のティア
// （1,000〜10,000バイト。詳細はCLAUDE.mdの「状態読み取り関数・アンロック関数」参照）
export const UNLOCKABLE_ITEMS: Array<{ label: string; insert: string; detail: string; doc: string; key: keyof UnlockFunctions; byteCost: number }> = [
  { label: "enemyHp",     insert: "enemyHp()",     detail: "() → number",       doc: "敵の現在HP",         key: "enemyHp", byteCost: 2000 },
  { label: "myHp",        insert: "myHp()",        detail: "() → number",       doc: "自分の現在HP",       key: "myHp", byteCost: 1000 },
  { label: "myBlock",     insert: "myBlock()",     detail: "() → number",       doc: "自分の現在ブロック量", key: "myBlock", byteCost: 1000 },
  { label: "enemyBlock",  insert: "enemyBlock()",  detail: "() → number",       doc: "敵の現在ブロック量",   key: "enemyBlock", byteCost: 2000 },
  { label: "damageDealtThisTurn", insert: "damageDealtThisTurn()", detail: "() → number", doc: "このターン敵に与えた合計ダメージ", key: "damageDealtThisTurn", byteCost: 2000 },
  { label: "comboIncrement",      insert: "comboIncrement()",      detail: "() → number", doc: "コンボが1回の使用で増加する量（0なら増加停止中）", key: "comboIncrement", byteCost: 4000 },
  { label: "turn",                insert: "turn()",                detail: "() → number", doc: "現在のターン数", key: "turn", byteCost: 1000 },
  { label: "endTurn",     insert: "endTurn()",     detail: "() → void",         doc: "ターンを終了する", key: "endTurn", byteCost: 4000 },
  { label: "enemyIntent", insert: "enemyIntent()", detail: "() → {kind,value}", doc: "敵の次の行動", key: "enemyIntent", byteCost: 8000 },
  { label: "isUsable",    insert: "isUsable(\"${1:attack}\")", detail: "(fn: string) → boolean", doc: "そのカードが今のターン使用可能かどうか（Unique使用済み等はfalse）", key: "isUsable", byteCost: 4000 },
  { label: "myDeck",     insert: "myDeck()",     detail: "() → CardId[]", doc: "デッキ全カードの配列", key: "myDeck", byteCost: 4000 },
  { label: "myHand",     insert: "myHand()",     detail: "() → CardId[]", doc: "現在の手札", key: "myHand", byteCost: 6000 },
  { label: "myDrawPile", insert: "myDrawPile()", detail: "() → CardId[]", doc: "山札（ドロー待ちカード）", key: "myDrawPile", byteCost: 8000 },
  { label: "myDiscard",  insert: "myDiscard()",  detail: "() → CardId[]", doc: "捨て札", key: "myDiscard", byteCost: 2000 },
  { label: "myDeployed", insert: "myDeployed()", detail: "() → CardId[]", doc: "Daemonにデプロイ済みのカード", key: "myDeployed", byteCost: 4000 },
  { label: "cardCost", insert: "cardCost(\"${1:attack}\")", detail: "(fn: string) → number", doc: "そのカードの現在のコスト（割引反映後）", key: "cardCost", byteCost: 4000 },
];

function ensureProvider(): void {
  if (_providerRegistered) return;
  _providerRegistered = true;

  monaco.languages.registerCompletionItemProvider("javascript", {
    triggerCharacters: [],
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber:   position.lineNumber,
        startColumn:     word.startColumn,
        endColumn:       word.endColumn,
      };

      const unlocks = _getUnlocks();
      const hand    = _getHand();

      const seenFn = new Set<string>();
      const cardItems = hand
        .filter(id => {
          const fn = CARDS[id]?.fn ?? id;
          if (seenFn.has(fn)) return false;
          seenFn.add(fn);
          return true;
        })
        .map((id, i) => {
          const def = CARDS[id];
          const insertText = def.signature.replace(/\(([^)]+)\)/, "(${1:$1})");
          return {
            label:           def.fn,  // lrAttack→"attack" など fn名で表示
            kind:            monaco.languages.CompletionItemKind.Function,
            detail:          def.signature,
            documentation:   def.description,
            insertText,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            sortText:        `0${String(i).padStart(3, "0")}`,
            range,
          };
        });

      const readItems = READ_ITEMS.map((item, i) => ({
        label:            item.label,
        kind:             monaco.languages.CompletionItemKind.Function,
        detail:           item.detail,
        documentation:    item.doc,
        insertText:       item.insert,
        insertTextRules:  monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        sortText:         `1${String(i).padStart(3, "0")}`,
        range,
      }));

      const unlockItems: monaco.languages.CompletionItem[] = UNLOCKABLE_ITEMS
        .filter(item => unlocks[item.key])
        .map((item, i) => ({
          label:           item.label,
          kind:            monaco.languages.CompletionItemKind.Function,
          detail:          item.detail,
          documentation:   item.doc,
          insertText:      item.insert,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          sortText:        `2${String(i).padStart(3, "0")}`,
          range,
        }));

      return { suggestions: [...cardItems, ...readItems, ...unlockItems] };
    },
  });
}

// ── エディタ作成 ────────────────────────────────────────────────────

export type MonacoEditor = monaco.editor.IStandaloneCodeEditor;

export function createEditor(
  container: HTMLElement,
  initial: string,
  getHand: () => CardId[],
  getUnlocks?: () => UnlockFunctions,
): MonacoEditor {
  _getHand = getHand;
  if (getUnlocks) _getUnlocks = getUnlocks;
  ensureProvider();

  const editor = monaco.editor.create(container, {
    value: initial,
    language: "javascript",
    theme: "runtime-rogue-dark",
    fontSize: 13,
    fontFamily: "'Cascadia Code', Consolas, 'Courier New', monospace",
    fontLigatures: true,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    lineNumbers: "on",
    tabSize: 2,
    wordWrap: "on",
    automaticLayout: true,
    quickSuggestions: { other: true, comments: false, strings: false },
    suggestOnTriggerCharacters: true,
    acceptSuggestionOnEnter: "on",
    acceptSuggestionOnCommitCharacter: true,
    suggest: { showWords: false, showSnippets: true },
    scrollbar: { verticalScrollbarSize: 6 },
    overviewRulerLanes: 0,
    renderLineHighlight: "line",
    padding: { top: 6, bottom: 6 },
  });

  return editor;
}

export function getCode(editor: MonacoEditor): string {
  return editor.getValue();
}

export function setCode(editor: MonacoEditor, code: string): void {
  editor.getModel()?.setValue(code);
}

export function insertText(editor: MonacoEditor, text: string): void {
  editor.focus();
  editor.trigger("runtime-rogue", "type", { text });
}

// Monaco のトークナイザでコード文字列をシンタックスハイライト済みHTMLに変換する
// （チュートリアルウィンドウ等、エディタ以外の場所でコード例を表示するために使う）。
// Markdownフェンスの慣用名（js/ts）はMonacoの言語IDではないため、ここで正式IDに解決する。
// 未知のIDを渡すとcolorizeはエラーにならず「全トークン無色（mtk1）」で返すので、ズレに気づきにくい
const COLORIZE_LANG_ALIASES: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
};

export async function colorizeCode(code: string, language = "javascript"): Promise<string> {
  return monaco.editor.colorize(code, COLORIZE_LANG_ALIASES[language] ?? language, {});
}
