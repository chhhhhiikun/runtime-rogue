// 戦闘状態の型と初期化。worker / main 両方が import する純粋データ。

export interface EnemyIntent {
  kind: "attack" | "block";
  value: number;
  boosted?: boolean;      // 過負荷反撃などで強化された意図かどうか（ログ表示用）
  ignoresBlock?: boolean; // ゴーレムの装甲貫通ギミック用。真の場合、プレイヤーのブロックを無視して直接ダメージを与える
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
  damageDealtThisTurn: number;  // このターン敵に与えた合計ダメージ（過負荷反撃などの判定用）
  sameActionKind: string | null; // 直近に呼ばれたカードのkind（単眼看破ギミック用）
  sameActionStreak: number;      // 同じkindが連続で呼ばれた回数（単眼看破ギミック用）
  maxSingleHitThisTurn: number;  // このターン中、1回のカード呼び出しで与えた最大ダメージ（禁忌の一撃ギミック用）
  storedValue: number;           // Object Breaker: 蓄積された値。ターンをまたいでリセットされない（戦闘開始時のみ0）
  turnsSinceRelease: number;     // release系(release/compact/bigRelease)を最後に使ってから経過したターン数（GCギミック用）
  releasedThisTurn: boolean;     // このターン中にrelease系を使ったか（ターン境界でturnsSinceReleaseに反映）
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
    damageDealtThisTurn: 0,
    sameActionKind: null,
    sameActionStreak: 0,
    maxSingleHitThisTurn: 0,
    storedValue: 0,
    turnsSinceRelease: 0,
    releasedThisTurn: false,
  };
}
