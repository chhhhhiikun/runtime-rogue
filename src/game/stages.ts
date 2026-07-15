import type { EnemyIntent } from "./state";

// ステージごとの「対抗ギミック」。詳細は CLAUDE.md の「## 敵ギミック」参照。
export type StageGimmick =
  // 過負荷反撃（ウェアウルフ）: 1ターン合計被ダメが threshold 以上 → 次の意図の値を multiplier 倍にする
  | { kind: "overkill"; threshold: number; multiplier: number }
  // 単眼看破（サイクロプス）: 同じ関数を streakThreshold 回連続で呼ぶ → 敵が即座にブロック +blockGain を得る
  | { kind: "monotony"; streakThreshold: number; blockGain: number }
  // 装甲貫通（ゴーレム）: ターン終了時、自分ブロックが threshold 以上残っている → 次の敵攻撃はブロック無視
  | { kind: "overguard"; threshold: number }
  // 詠唱封印（魔道士）: コンボ数が comboThreshold に達する → そのターン中コンボ増加が0になる
  | { kind: "overcastSeal"; comboThreshold: number }
  // 禁忌の一撃（デーモン）: 1回のカード呼び出しでのダメージが threshold 以上 → 次の意図の値を multiplier 倍にする
  | { kind: "burstSpike"; threshold: number; multiplier: number }
  // 見切りの一撃（竜騎士）: コンボ数が threshold 以上の状態からさらに増加するたび、damage ダメージを受ける
  | { kind: "imbalance"; threshold: number; damage: number }
  // 覚醒（ドラゴン）: turnThreshold ターン超過後、超過ターンごとに次意図を強化しつつコンボ増加量を減衰させる
  | { kind: "enrage"; turnThreshold: number; multiplierPerTurn: number; comboIncrementDecay: number };

// Object Breaker の storedValue（蓄積変数）を狙った、既存gimmickと並行して働く対抗ギミック。
// 1ステージにつき最大1つ、`gimmick`とは独立に設定できる。
export type StoredValueGimmick =
  // 上限キャップ: storedValueが threshold を超えると、超過分は即座に切り捨てられる
  | { kind: "cap"; threshold: number }
  // 被弾時吸収: 敵の攻撃行動のたび（ブロックの有無に関わらず）、storedValueの percent 分を奪われる
  | { kind: "absorb"; percent: number }
  // ガベージコレクション: release系(release/compact/bigRelease)を staleThreshold ターン使わないと、
  // 以降そのままの間、毎ターン decayRate 分だけ減衰し続ける
  | { kind: "decay"; staleThreshold: number; decayRate: number };

// Bug Injectorのdebug()/弱点属性システムを狙った、既存gimmickと並行して働く対抗ギミック。
// storedValueGimmickと同じく、1ステージにつき最大1つ、gimmickとは独立に設定できる。
export type WeaknessGimmick =
  // 未対応のバグ（ウェアウルフ）: 弱点系カードをidleTurnsターン連続で使わないと、敵HPがhealAmount回復する
  | { kind: "unpatchedBug"; idleTurns: number; healAmount: number }
  // 例外耐性（サイクロプス）: 同一ターン中にmatchThreshold回目の真の弱点一致が発生すると、それ以降は不一致扱いになる
  | { kind: "exceptionImmunity"; matchThreshold: number }
  // 防御的コンパイル（ゴーレム）: ターン終了時に自分ブロックがblockThreshold以上残っていると、次ターン中は弱点系カードが強制的に不一致扱いになる
  | { kind: "defensiveCompile"; blockThreshold: number }
  // サイレントキャッチ（デーモン）: 同じ弱点系カードをuseThreshold回使うと、それ以降そのカードは無効化される
  | { kind: "silentCatch"; useThreshold: number }
  // ログ肥大化（ドラゴン）: turnThresholdターンを超過すると、超過ターンごとにdebug()のログ総数がgrowthPerTurnずつ増えていく
  | { kind: "logBloat"; turnThreshold: number; growthPerTurn: number };

export interface StageDef {
  name: string;
  hp: number;
  intentPattern: EnemyIntent[];
  isBoss?: boolean;
  gimmick?: StageGimmick;
  storedValueGimmick?: StoredValueGimmick;
  weaknessGimmick?: WeaknessGimmick;
  // 基準報酬（実際の獲得量はここに±ジッターを乗せた値。main.tsのjitterReward参照）。
  // チュートリアル用ステージ（tutorial.ts）は通貨を獲得しないため未指定でよい
  byteReward?: number;
  cashReward?: number;
}

// 基準: attack() コスト1・ダメージ6、エネルギー10 → 最大60ダメージ/ターン
// 後半ステージはコンボカードで火力が上がることを想定してスケール
export const STAGES: StageDef[] = [
  {
    // 約2ターン（純attack ループ想定）
    name: "スライム",
    hp: 80,
    byteReward: 700,
    cashReward: 2000,
    intentPattern: [
      { kind: "attack", value: 6 },
      { kind: "attack", value: 6 },
      { kind: "attack", value: 9 },
    ],
  },
  {
    // 約2〜3ターン。ブロックあり
    name: "ゴブリン",
    hp: 140,
    byteReward: 770,
    cashReward: 2100,
    intentPattern: [
      { kind: "attack", value: 8  },
      { kind: "attack", value: 8  },
      { kind: "block",  value: 8  },
      { kind: "attack", value: 11 },
    ],
  },
  {
    // 約3ターン。高火力ターンあり
    name: "スケルトン",
    hp: 200,
    byteReward: 840,
    cashReward: 2200,
    intentPattern: [
      { kind: "attack", value: 10 },
      { kind: "block",  value: 9  },
      { kind: "attack", value: 14 },
      { kind: "attack", value: 8  },
    ],
  },
  {
    // 約4ターン。重ブロック
    name: "オーク",
    hp: 280,
    byteReward: 910,
    cashReward: 2300,
    intentPattern: [
      { kind: "block",  value: 14 },
      { kind: "attack", value: 13 },
      { kind: "attack", value: 11 },
      { kind: "attack", value: 16 },
    ],
  },
  {
    // 約5ターン。連続高火力。過負荷反撃ギミック持ち
    name: "ウェアウルフ",
    hp: 360,
    byteReward: 980,
    cashReward: 2400,
    intentPattern: [
      { kind: "attack", value: 12 },
      { kind: "attack", value: 15 },
      { kind: "attack", value: 10 },
      { kind: "block",  value: 10 },
      { kind: "attack", value: 18 },
    ],
    // 1ターンで30以上のダメージを与えると、次の意図の値が2倍になる（無限ループの物量ゴリ押しへの牽制）
    gimmick: { kind: "overkill", threshold: 30, multiplier: 2 },
    // storedValueが40を超えると超過分は噛み千切られる（Object Breakerの貯め込みへの牽制）
    storedValueGimmick: { kind: "cap", threshold: 40 },
    // 弱点系カードを3ターン使わないと、敵HPが5回復する（Bug Injectorのdebug()軽視への牽制）
    weaknessGimmick: { kind: "unpatchedBug", idleTurns: 3, healAmount: 5 },
  },
  {
    // 約6〜7ターン。超高火力
    name: "サイクロプス",
    hp: 450,
    byteReward: 1050,
    cashReward: 2500,
    intentPattern: [
      { kind: "attack", value: 16 },
      { kind: "block",  value: 12 },
      { kind: "attack", value: 14 },
      { kind: "attack", value: 20 },
      { kind: "block",  value: 10 },
    ],
    // 同じ関数を4回連続で呼ぶと、単調なループを見破られ敵が即座にブロック+8を得る
    gimmick: { kind: "monotony", streakThreshold: 4, blockGain: 8 },
    // storedValueが55を超えると超過分は即座に切り捨てられる
    storedValueGimmick: { kind: "cap", threshold: 55 },
    // 同一ターン中に3回目の弱点一致が発生すると、それ以降は不一致扱いになる（弱点連打の牽制）
    weaknessGimmick: { kind: "exceptionImmunity", matchThreshold: 3 },
  },
  {
    // 約8ターン。重ブロック主体
    name: "ゴーレム",
    hp: 540,
    byteReward: 1120,
    cashReward: 2600,
    intentPattern: [
      { kind: "block",  value: 16 },
      { kind: "attack", value: 15 },
      { kind: "block",  value: 14 },
      { kind: "attack", value: 18 },
      { kind: "attack", value: 12 },
    ],
    // ターン終了時に自分ブロックが15以上残っていると、次の敵攻撃はブロックを無視する（過剰な籠城への牽制）
    gimmick: { kind: "overguard", threshold: 15 },
    // ターン終了時に自分ブロックが15以上残っていると、次ターン中は弱点系カードが強制的に不一致扱いになる（籠城への二重の牽制）
    weaknessGimmick: { kind: "defensiveCompile", blockThreshold: 15 },
  },
  {
    // 約9〜10ターン
    name: "魔道士",
    hp: 620,
    byteReward: 1190,
    cashReward: 2700,
    intentPattern: [
      { kind: "attack", value: 12 },
      { kind: "attack", value: 17 },
      { kind: "block",  value: 14 },
      { kind: "attack", value: 22 },
      { kind: "block",  value: 10 },
    ],
    // コンボ数が12に達すると、そのターン中はそれ以上コンボが増加しなくなる（無限コンボ積みへの牽制）
    gimmick: { kind: "overcastSeal", comboThreshold: 12 },
    // storedValueが70を超えると超過分は即座に切り捨てられる
    storedValueGimmick: { kind: "cap", threshold: 70 },
  },
  {
    // 約11ターン。猛攻
    name: "デーモン",
    hp: 720,
    byteReward: 1260,
    cashReward: 2800,
    intentPattern: [
      { kind: "attack", value: 14 },
      { kind: "attack", value: 19 },
      { kind: "attack", value: 12 },
      { kind: "block",  value: 16 },
      { kind: "attack", value: 24 },
    ],
    // 1回の呼び出しで25以上のダメージを与えると（コンボを盛った大技等）、次の意図の値が1.5倍になる
    gimmick: { kind: "burstSpike", threshold: 25, multiplier: 1.5 },
    // storedValueが85を超えると超過分は即座に切り捨てられる
    storedValueGimmick: { kind: "cap", threshold: 85 },
    // 同じ弱点系カードを4回使うと、5回目以降そのカードは無効化される（1枚への依存の牽制）
    weaknessGimmick: { kind: "silentCatch", useThreshold: 4 },
  },
  {
    // 約13ターン。攻防バランス型
    name: "竜騎士",
    hp: 820,
    byteReward: 1330,
    cashReward: 2900,
    intentPattern: [
      { kind: "block",  value: 18 },
      { kind: "attack", value: 18 },
      { kind: "attack", value: 22 },
      { kind: "block",  value: 16 },
      { kind: "attack", value: 24 },
      { kind: "attack", value: 14 },
    ],
    // コンボ数が10に達した状態からさらに増加させるたび、見切られて2ダメージを受ける（無理な連撃への牽制）
    gimmick: { kind: "imbalance", threshold: 10, damage: 2 },
    // storedValueが90を超えると超過分はその場で見切られ削られる
    storedValueGimmick: { kind: "cap", threshold: 90 },
  },
  {
    // ボス。約15〜20ターン想定
    name: "ドラゴン",
    hp: 1000,
    byteReward: 1400,
    cashReward: 3000,
    intentPattern: [
      { kind: "attack", value: 14 },
      { kind: "block",  value: 24 },
      { kind: "attack", value: 22 },
      { kind: "attack", value: 12 },
      { kind: "block",  value: 20 },
      { kind: "attack", value: 30 },
    ],
    isBoss: true,
    // 15ターンを超えると、超過ターンごとに次意図が緩やかに強化されつつコンボ増加量も減衰していく（長期戦への牽制）
    gimmick: { kind: "enrage", turnThreshold: 15, multiplierPerTurn: 0.08, comboIncrementDecay: 0.3 },
    // storedValueが120を超えると超過分は即座に切り捨てられる
    storedValueGimmick: { kind: "cap", threshold: 120 },
    // 15ターンを超えると、超過ターンごとにdebug()のログ総数が6件ずつ増えていく（覚醒と同じ閾値で足並みを揃える）
    weaknessGimmick: { kind: "logBloat", turnThreshold: 15, growthPerTurn: 6 },
  },
];
