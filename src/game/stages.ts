import type { EnemyIntent } from "./state";

export interface StageDef {
  name: string;
  hp: number;
  intentPattern: EnemyIntent[];
  isBoss?: boolean;
}

// 基準: attack() コスト1・ダメージ6、エネルギー10 → 最大60ダメージ/ターン
// 後半ステージはコンボカードで火力が上がることを想定してスケール
export const STAGES: StageDef[] = [
  {
    // 約2ターン（純attack ループ想定）
    name: "スライム",
    hp: 80,
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
    intentPattern: [
      { kind: "block",  value: 14 },
      { kind: "attack", value: 13 },
      { kind: "attack", value: 11 },
      { kind: "attack", value: 16 },
    ],
  },
  {
    // 約5ターン。連続高火力
    name: "ウェアウルフ",
    hp: 360,
    intentPattern: [
      { kind: "attack", value: 12 },
      { kind: "attack", value: 15 },
      { kind: "attack", value: 10 },
      { kind: "block",  value: 10 },
      { kind: "attack", value: 18 },
    ],
  },
  {
    // 約6〜7ターン。超高火力
    name: "サイクロプス",
    hp: 450,
    intentPattern: [
      { kind: "attack", value: 16 },
      { kind: "block",  value: 12 },
      { kind: "attack", value: 14 },
      { kind: "attack", value: 20 },
      { kind: "block",  value: 10 },
    ],
  },
  {
    // 約8ターン。重ブロック主体
    name: "ゴーレム",
    hp: 540,
    intentPattern: [
      { kind: "block",  value: 16 },
      { kind: "attack", value: 15 },
      { kind: "block",  value: 14 },
      { kind: "attack", value: 18 },
      { kind: "attack", value: 12 },
    ],
  },
  {
    // 約9〜10ターン
    name: "魔道士",
    hp: 620,
    intentPattern: [
      { kind: "attack", value: 12 },
      { kind: "attack", value: 17 },
      { kind: "block",  value: 14 },
      { kind: "attack", value: 22 },
      { kind: "block",  value: 10 },
    ],
  },
  {
    // 約11ターン。猛攻
    name: "デーモン",
    hp: 720,
    intentPattern: [
      { kind: "attack", value: 14 },
      { kind: "attack", value: 19 },
      { kind: "attack", value: 12 },
      { kind: "block",  value: 16 },
      { kind: "attack", value: 24 },
    ],
  },
  {
    // 約13ターン。攻防バランス型
    name: "竜騎士",
    hp: 820,
    intentPattern: [
      { kind: "block",  value: 18 },
      { kind: "attack", value: 18 },
      { kind: "attack", value: 22 },
      { kind: "block",  value: 16 },
      { kind: "attack", value: 24 },
      { kind: "attack", value: 14 },
    ],
  },
  {
    // ボス。約15〜20ターン想定
    name: "ドラゴン",
    hp: 1000,
    intentPattern: [
      { kind: "attack", value: 14 },
      { kind: "block",  value: 24 },
      { kind: "attack", value: 22 },
      { kind: "attack", value: 12 },
      { kind: "block",  value: 20 },
      { kind: "attack", value: 30 },
    ],
    isBoss: true,
  },
];
