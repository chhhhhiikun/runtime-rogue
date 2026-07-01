import type { CardId } from "./cards";
import type { StageDef } from "./stages";

export interface TutorialStep {
  stage: StageDef;
  deck: CardId[];          // このステージ専用の手札構成（キャラの初期デッキは使わない）
  allowedFns: string[];    // このステージで呼び出せる関数名だけを公開する
  tip: string;             // Markdown（```js コードフェンス対応）。最初に表示する内容
  followUp?: {             // このステージ中にエラーが起きたら、少し待ってから表示し直す内容
    tip: string;
  };
  unlockFunctionKw?: boolean; // このステップ開始時に function キーワードを解禁する
}

// 現時点では Stage 1・2 のみ実装（以降のステージは追って追加していく）
export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    stage: {
      name: "練習用スライム",
      hp: 3,
      intentPattern: [{ kind: "attack", value: 4 }],
    },
    deck: ["lrAttack"],
    allowedFns: ["attack"],
    tip:
      "`attack()` で攻撃できます。手札には `attack` が1枚あります。\n\n" +
      "以下のコードを書いて **RUN** を押してみましょう。\n\n" +
      "```js\nattack();\n```",
  },
  {
    stage: {
      name: "3連撃スライム",
      hp: 9,
      intentPattern: [{ kind: "attack", value: 4 }],
    },
    deck: ["lrAttack"],
    allowedFns: ["attack"],
    tip:
      "手札の `attack` はやっぱり1枚だけです。\n" +
      "敵のHPは9なので、試しに書いてみましょう:\n\n" +
      "```js\nattack();\nattack();\nattack();\n```",
    followUp: {
      tip:
        "手札は1枚なのに3回書かれているため、実行するとエラーになります。\n" +
        "**同じ関数は、手札にある枚数より多くコードに書くことはできません。**\n\n" +
        "同じ行を何度も書く代わりに、ループを使いましょう。 " +
        "ループの中に書けば「書いた回数」は1回とみなされます。\n\n" +
        "```js\nwhile (true) {\n  attack();\n}\n```\n\n" +
        "Main Clockがなくなるまで繰り返され、敵を倒せます。",
    },
  },
];
