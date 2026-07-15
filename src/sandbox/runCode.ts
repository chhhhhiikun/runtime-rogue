import CodeWorker from "./worker.ts?worker";
import type { RunRequest, RunResult, UnlockFunctions, DeckSnapshot } from "./worker";
import type { CombatState, EnemyIntent } from "../game/state";
import type { CardId } from "../game/cards";
import type { StageGimmick, StoredValueGimmick, WeaknessGimmick } from "../game/stages";

export type { UnlockFunctions, DeckSnapshot };

// コインショップ（未実装）が入るまでは、既存プレイヤー体験を変えないため全てON。
// DEV用アンロックパネルで個別に一時OFFにして動作確認できる。
export const DEFAULT_UNLOCKS: UnlockFunctions = {
  enemyHp: true, myHp: true, myBlock: true, enemyBlock: true,
  damageDealtThisTurn: true, comboIncrement: true, turn: true,
  endTurn: true, enemyIntent: true, isUsable: true,
  myDeck: true, myHand: true, myDrawPile: true, myDiscard: true, myDeployed: true,
  cardCost: true,
};

// Worker はメッセージごとに独立したステートレス処理（RunRequest→RunResult）なので、
// 毎回 new Worker() すると（特にdevサーバ経由でworker.tsを都度再フェッチするため）
// 数百msの起動オーバーヘッドが発生する。使い回せる限り同じインスタンスを再利用する。
// タイムアウト（無限ループ検知）時のみ実際に terminate() し、次回呼び出し時に新規生成する。
let sharedWorker: Worker | null = null;
function getWorker(): Worker {
  if (!sharedWorker) sharedWorker = new CodeWorker();
  return sharedWorker;
}

export function runUserCode(
  code: string,
  state: CombatState,
  hand: CardId[],
  unlocks: UnlockFunctions = DEFAULT_UNLOCKS,
  deckSnapshot?: DeckSnapshot,
  timeoutMs = 5000,
  prefixCode?: string,
  drawPile?: CardId[],
  discardPile?: CardId[],
  characterCards?: CardId[],
  intentPattern?: EnemyIntent[],
  intentIndex?: number,
  daemonCode?: string,
  deployedCardIds?: CardId[],
  allowedFns?: string[],
  runDaemonAtStart?: boolean,
  gimmick?: StageGimmick,
  storedValueGimmick?: StoredValueGimmick,
  weaknessGimmick?: WeaknessGimmick,
): Promise<RunResult> {
  return new Promise((resolve) => {
    const worker = getWorker();

    const timer = setTimeout(() => {
      worker.terminate();
      sharedWorker = null; // 無限ループを止めるため実際に破棄。次回呼び出し時に新規生成される
      resolve({
        actions: [],
        finalState: state,
        error: "実行が長すぎます（無限ループの可能性）。コードを見直してください。",
        consoleLogs: [],
      });
    }, timeoutMs);

    worker.onmessage = (e: MessageEvent<RunResult>) => {
      clearTimeout(timer);
      resolve(e.data);
    };

    worker.onerror = (e: ErrorEvent) => {
      clearTimeout(timer);
      worker.terminate();
      sharedWorker = null; // エラー後のworker状態が不定なため破棄し、次回は新規生成する
      resolve({
        actions: [],
        finalState: state,
        error: e.message || "Worker でエラーが発生しました",
        consoleLogs: [],
      });
    };

    const req: RunRequest = {
      code, prefixCode, state, hand, unlocks, deckSnapshot,
      drawPile, discardPile, characterCards,
      intentPattern, intentIndex,
      daemonCode, deployedCardIds,
      allowedFns, runDaemonAtStart,
      gimmick, storedValueGimmick, weaknessGimmick,
    };
    worker.postMessage(req);
  });
}
