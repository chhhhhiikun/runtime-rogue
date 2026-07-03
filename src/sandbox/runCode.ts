import CodeWorker from "./worker.ts?worker";
import type { RunRequest, RunResult, UnlockFunctions, DeckSnapshot } from "./worker";
import type { CombatState, EnemyIntent } from "../game/state";
import type { CardId } from "../game/cards";
import type { StageGimmick } from "../game/stages";

export type { UnlockFunctions, DeckSnapshot };

export const DEFAULT_UNLOCKS: UnlockFunctions = {
  deckInfo:   true,
  endTurn:    true,
  functionKw: true,
  arrowFn:    true,
};

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
): Promise<RunResult> {
  return new Promise((resolve) => {
    const worker = new CodeWorker();

    const timer = setTimeout(() => {
      worker.terminate();
      resolve({
        actions: [],
        finalState: state,
        error: "実行が長すぎます（無限ループの可能性）。コードを見直してください。",
        consoleLogs: [],
      });
    }, timeoutMs);

    worker.onmessage = (e: MessageEvent<RunResult>) => {
      clearTimeout(timer);
      worker.terminate();
      resolve(e.data);
    };

    worker.onerror = (e: ErrorEvent) => {
      clearTimeout(timer);
      worker.terminate();
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
      gimmick,
    };
    worker.postMessage(req);
  });
}
