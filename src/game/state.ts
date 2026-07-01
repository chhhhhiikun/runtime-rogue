// 戦闘状態の型と初期化。worker / main 両方が import する純粋データ。

export interface EnemyIntent {
  kind: "attack" | "block";
  value: number;
}

export interface CombatState {
  player: { hp: number; maxHp: number; block: number };
  enemy: {
    hp: number;
    maxHp: number;
    block: number;
    vulnerable: number; // >0 の間、被ダメ +50%（ターン終了でリセット）
    poison: number; // ターン終了時に hp へダメージ
    intent: EnemyIntent; // 次に行う行動（予告）
  };
  energy: number;
  maxEnergy: number;
  turn: number;
  rebootUsedThisTurn: boolean; // RUN をまたいで1ターン1回のみ（レガシー互換）
  comboCount: number;          // バトル中に累積するコンボカウンター
  comboIncrement: number;      // default 1, stackOverflow → 3
  asyncAwaitActive: boolean;   // asyncAwait が発動中
  nextTurnExtraDraws: number;  // 次ターンの追加ドロー枚数
  nextTurnExtraEnergy: number; // 次ターンの追加エネルギー
  uniqueUsedThisTurn: string[]; // Unique カードの使用済みリスト (CardId[])
  costZeroCardIds: string[];            // このターンコスト0のカードId（caching/GC用）
  costReductionMap: Record<string, number>; // ターン中のコスト削減量（compilerOptimization/refactoring用）
  cachedCardId: string | null;          // caching() で次ターンに持ち越すカードId
  characterId: string;         // 現在のキャラクターId
  daemonCost: number;           // Daemon の現在コスト
  maxDaemonCost: number;        // Daemon の最大コスト（毎ターン全回復）
}

export const MAX_ENERGY = 10;
export const MAX_DAEMON_COST = 5;

export function initialState(): CombatState {
  return {
    player: { hp: 40, maxHp: 40, block: 0 },
    enemy: {
      hp: 60,
      maxHp: 60,
      block: 0,
      vulnerable: 0,
      poison: 0,
      intent: { kind: "attack", value: 7 },
    },
    energy: MAX_ENERGY,
    maxEnergy: MAX_ENERGY,
    turn: 1,
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
    characterId: "loopRunner",
    daemonCost: MAX_DAEMON_COST,
    maxDaemonCost: MAX_DAEMON_COST,
  };
}
