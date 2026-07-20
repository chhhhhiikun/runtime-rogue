// 割り込み（イベント）: マップのイベントノードで発生する、2〜4択のテキスト選択。
// コードを書く要素は含まない。バイトは戦闘勝利時のみ獲得できるため、イベント報酬には含めない。
// 詳細はCONTEXT.md「割り込み」参照。

export type EventOutcomeEffect =
  | { kind: "gainCash"; amount: number }
  | { kind: "loseCash"; amount: number }
  | { kind: "gainPlugin" }                       // 未所持のプラグインからランダムに1つ入手（全所持済みならキャッシュ+1000で代替）
  | { kind: "loseHpPercent"; percent: number }    // 最大HPに対する割合ダメージ
  | { kind: "refactorRandomCard" }                // 対象カード（スターター/Common）からランダムに1枚を無料でリファクタリング
  | { kind: "nextBattleEnergyPenalty"; amount: number } // 次の1戦闘のみ、Main Clock初期値-amount
  | { kind: "nextBattleEnemyIntentBoost" }        // 次の1戦闘のみ、敵の最初の意図を強化
  | { kind: "none" };

export interface EventOutcome {
  weight: number; // 同じ選択肢内での相対確率（例: 1/1で50%ずつ）
  effects: EventOutcomeEffect[];
}

export interface EventChoice {
  label: string;
  hint: string; // 選択肢を選ぶ前に見える効果の説明（このゲームは「外しても隠しデメリットはない」設計方針に合わせ、事前に開示する）
  outcomes: EventOutcome[];
}

export interface EventDef {
  id: string;
  title: string;
  description: string;
  choices: EventChoice[];
}

export const EVENTS: EventDef[] = [
  {
    id: "suspiciousPackage",
    title: "怪しいパッケージ",
    description: "見知らぬ配布元のパッケージを見つけた。インストールすれば便利そうだが、素性は分からない。",
    choices: [
      {
        label: "そのままインストールする",
        hint: "無料でプラグインを1つ入手。ただしHP-10%",
        outcomes: [{ weight: 1, effects: [{ kind: "gainPlugin" }, { kind: "loseHpPercent", percent: 10 }] }],
      },
      {
        label: "検証してから導入する",
        hint: "キャッシュ4300を払って安全にプラグインを1つ入手",
        outcomes: [{ weight: 1, effects: [{ kind: "loseCash", amount: 4300 }, { kind: "gainPlugin" }] }],
      },
      {
        label: "無視する",
        hint: "何も起きない",
        outcomes: [{ weight: 1, effects: [{ kind: "none" }] }],
      },
    ],
  },
  {
    id: "debugLogPile",
    title: "デバッグログの山",
    description: "放置されたデバッグログの山を見つけた。整理すれば売れそうだが、時間がかかりそうだ。",
    choices: [
      {
        label: "整理する",
        hint: "キャッシュ+1500。ただし次の戦闘のみMain Clock初期値-2",
        outcomes: [{ weight: 1, effects: [{ kind: "gainCash", amount: 1500 }, { kind: "nextBattleEnergyPenalty", amount: 2 }] }],
      },
      {
        label: "放置する",
        hint: "何も起きない",
        outcomes: [{ weight: 1, effects: [{ kind: "none" }] }],
      },
    ],
  },
  {
    id: "freelanceRefactorJob",
    title: "野良のリファクタリング案件",
    description: "コードのリファクタリングを頼まれた。引き受ければ経験になりそうだ。",
    choices: [
      {
        label: "引き受ける",
        hint: "手持ちのカードを1枚、無料でリファクタリングできる",
        outcomes: [{ weight: 1, effects: [{ kind: "refactorRandomCard" }] }],
      },
      {
        label: "断る",
        hint: "紹介料としてキャッシュ+800",
        outcomes: [{ weight: 1, effects: [{ kind: "gainCash", amount: 800 }] }],
      },
    ],
  },
  {
    id: "brokenCi",
    title: "壊れたCI",
    description: "CIパイプラインが壊れている。放っておくと後で響きそうだ。",
    choices: [
      {
        label: "自分で直す",
        hint: "キャッシュ+1500。ただしHP-15%",
        outcomes: [{ weight: 1, effects: [{ kind: "gainCash", amount: 1500 }, { kind: "loseHpPercent", percent: 15 }] }],
      },
      {
        label: "外注する",
        hint: "キャッシュ-1200で解決。被害なし",
        outcomes: [{ weight: 1, effects: [{ kind: "loseCash", amount: 1200 }] }],
      },
      {
        label: "放置する",
        hint: "支払いなし。ただし次の戦闘の敵の最初の意図が強化される",
        outcomes: [{ weight: 1, effects: [{ kind: "nextBattleEnemyIntentBoost" }] }],
      },
    ],
  },
  {
    id: "mysteryUsb",
    title: "謎のUSBメモリ",
    description: "落ちているUSBメモリを見つけた。中身は分からない。",
    choices: [
      {
        label: "挿してみる",
        hint: "50%でプラグインを無料入手、50%でHP-20%",
        outcomes: [
          { weight: 1, effects: [{ kind: "gainPlugin" }] },
          { weight: 1, effects: [{ kind: "loseHpPercent", percent: 20 }] },
        ],
      },
      {
        label: "売り払う",
        hint: "キャッシュ+1000",
        outcomes: [{ weight: 1, effects: [{ kind: "gainCash", amount: 1000 }] }],
      },
      {
        label: "解析する",
        hint: "キャッシュ+700",
        outcomes: [{ weight: 1, effects: [{ kind: "gainCash", amount: 700 }] }],
      },
      {
        label: "捨てる",
        hint: "何も起きない",
        outcomes: [{ weight: 1, effects: [{ kind: "none" }] }],
      },
    ],
  },
];

export function getEvent(id: string): EventDef | undefined {
  return EVENTS.find(e => e.id === id);
}

// weightに応じてoutcomeを1つ抽選する
export function rollOutcome(choice: EventChoice): EventOutcome {
  const total = choice.outcomes.reduce((sum, o) => sum + o.weight, 0);
  let roll = Math.random() * total;
  for (const outcome of choice.outcomes) {
    if (roll < outcome.weight) return outcome;
    roll -= outcome.weight;
  }
  return choice.outcomes[choice.outcomes.length - 1];
}
