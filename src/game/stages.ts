import type { EnemyIntent } from "./state";

export interface StageDef {
  name: string;
  hp: number;
  intentPattern: EnemyIntent[];
  isBoss?: boolean;
}

export const STAGES: StageDef[] = [
  {
    name: "スライム",
    hp: 8,
    intentPattern: [
      { kind: "attack", value: 3 },
      { kind: "attack", value: 3 },
      { kind: "attack", value: 5 },
    ],
  },
  {
    name: "ゴブリン",
    hp: 18,
    intentPattern: [
      { kind: "attack", value: 6 },
      { kind: "attack", value: 5 },
      { kind: "block",  value: 5 },
    ],
  },
  {
    name: "スケルトン",
    hp: 28,
    intentPattern: [
      { kind: "attack", value: 7 },
      { kind: "block",  value: 6 },
      { kind: "attack", value: 9 },
      { kind: "attack", value: 5 },
    ],
  },
  {
    name: "オーク",
    hp: 38,
    intentPattern: [
      { kind: "block",  value: 8  },
      { kind: "attack", value: 10 },
      { kind: "attack", value: 8  },
      { kind: "attack", value: 12 },
    ],
  },
  {
    name: "ウェアウルフ",
    hp: 48,
    intentPattern: [
      { kind: "attack", value: 9  },
      { kind: "attack", value: 11 },
      { kind: "attack", value: 7  },
      { kind: "block",  value: 5  },
      { kind: "attack", value: 13 },
    ],
  },
  {
    name: "サイクロプス",
    hp: 55,
    intentPattern: [
      { kind: "attack", value: 14 },
      { kind: "block",  value: 10 },
      { kind: "attack", value: 12 },
      { kind: "attack", value: 16 },
      { kind: "block",  value: 8  },
    ],
  },
  {
    name: "ゴーレム",
    hp: 62,
    intentPattern: [
      { kind: "block",  value: 12 },
      { kind: "attack", value: 13 },
      { kind: "block",  value: 10 },
      { kind: "attack", value: 15 },
      { kind: "attack", value: 10 },
    ],
  },
  {
    name: "魔道士",
    hp: 68,
    intentPattern: [
      { kind: "attack", value: 10 },
      { kind: "attack", value: 14 },
      { kind: "block",  value: 12 },
      { kind: "attack", value: 18 },
      { kind: "block",  value: 8  },
    ],
  },
  {
    name: "デーモン",
    hp: 75,
    intentPattern: [
      { kind: "attack", value: 12 },
      { kind: "attack", value: 16 },
      { kind: "attack", value: 10 },
      { kind: "block",  value: 14 },
      { kind: "attack", value: 20 },
    ],
  },
  {
    name: "竜騎士",
    hp: 82,
    intentPattern: [
      { kind: "block",  value: 14 },
      { kind: "attack", value: 15 },
      { kind: "attack", value: 18 },
      { kind: "block",  value: 12 },
      { kind: "attack", value: 20 },
      { kind: "attack", value: 12 },
    ],
  },
  {
    name: "ドラゴン",
    hp: 100,
    intentPattern: [
      { kind: "attack", value: 12 },
      { kind: "block",  value: 20 },
      { kind: "attack", value: 18 },
      { kind: "attack", value: 10 },
      { kind: "block",  value: 15 },
      { kind: "attack", value: 25 },
    ],
    isBoss: true,
  },
];
