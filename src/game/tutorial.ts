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
  daemonEnabled?: boolean; // このステップ開始時にDAEMONウィジェットを表示し、コード・実行を有効化する
}

// Stage 1〜8 まで実装（以降のステージは追って追加していく）
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
  {
    stage: {
      name: "見張りゴブリン",
      hp: 25,
      intentPattern: [{ kind: "attack", value: 5 }],
    },
    deck: ["lrAttack", "lrBlock"],
    allowedFns: ["attack", "block"],
    tip:
      "敵はあなたにも攻撃してきます。`block()` を使うと、次に敵から受けるダメージを軽減できます。\n\n" +
      "今回は `attack` と `block` が1枚ずつ手札にあります。両方使ってみましょう。\n\n" +
      "```js\nwhile (true) {\n  attack();\n  block();\n}\n```\n\n" +
      "Main Clockがなくなり敵がまだ倒れていなければ、画面右上の **ターン終了** ボタンを押して次のターンへ進みましょう。",
  },
  {
    stage: {
      name: "見習い人形",
      hp: 20,
      intentPattern: [{ kind: "attack", value: 4 }],
    },
    deck: ["lrAttack", "noop", "patch"],
    allowedFns: ["attack", "noop", "patch"],
    tip:
      "`noop()` は何もしません（コンボ +1 のみ）。コスト0で使えます。試しに使ってみましょう:\n\n" +
      "```js\nwhile (true) {\n  noop();\n  attack();\n}\n```",
    followUp: {
      tip:
        "エラーになりましたね。`noop()` には **Unique** という属性がついていて、" +
        "1ターンに1回しか呼べません（手札のカードに付く紫色の「Unique」タグで確認できます）。\n\n" +
        "ループの外で1回だけ呼びましょう:\n\n" +
        "```js\nnoop();\nwhile (true) {\n  attack();\n}\n```\n\n" +
        "ちなみに `patch()` のような「使い捨て（Disposable）」属性のカードは、" +
        "1回使うとそのステージ中は手札から無くなります（次のステージでは元に戻ります）。",
    },
  },
  {
    stage: {
      name: "居眠り門番",
      hp: 150,
      intentPattern: [{ kind: "block", value: 6 }],
    },
    deck: ["lrAttack"],
    allowedFns: ["attack", "mainClock", "endTurn"],
    tip:
      "この敵はブロックしかしてこないので安心して試せます。\n\n" +
      "今回は `while` ループの代わりに `if` 文を使い、**⟳ AUTO** ボタンで自動的に繰り返させてみましょう。\n\n" +
      "```js\nif (mainClock() > 0) {\n  attack();\n} else {\n  endTurn();\n}\n```\n\n" +
      "このコードを書いたら、RUNの隣にある **⟳ AUTO** ボタンを押してください。" +
      "Main Clockが残っていれば攻撃し、0になったら自動でターンを終了する、を繰り返します。",
  },
  {
    stage: {
      name: "しつこいゴブリン",
      hp: 32,
      intentPattern: [{ kind: "attack", value: 7 }],
    },
    deck: ["lrAttack", "lrBlock"],
    allowedFns: ["attack", "block"],
    tip:
      "`while` の他に `for` 文でも繰り返せます。「何回繰り返すか」を決められるのが特徴です。\n\n" +
      "例えば「まず attack() を5回、残りは block() に使う」と書けます:\n\n" +
      "```js\nfor (let i = 0; i < 5; i++) {\n  attack();\n}\nwhile (true) {\n  block();\n}\n```\n\n" +
      "`for (let i = 0; i < 5; i++)` は「iが0から始まり5未満の間、iを1ずつ増やしながら繰り返す」" +
      "という意味で、結果的に5回だけ繰り返されます。",
  },
  {
    stage: {
      name: "反復するゴブリン",
      hp: 30,
      intentPattern: [{ kind: "attack", value: 5 }],
    },
    deck: ["lrAttack", "lrBlock"],
    allowedFns: ["attack", "block", "mainClock"],
    unlockFunctionKw: true,
    tip:
      "`function` を使うと、自分だけの関数を定義できます。これまで書いてきたループを、" +
      "ひとつの関数にまとめてみましょう。\n\n" +
      "```js\nfunction comboLoop() {\n  while (mainClock() > 0) {\n    attack();\n    block();\n  }\n}\n\ncomboLoop();\n```\n\n" +
      "さらに、画面上部の **📚 ライブラリ追加** ボタンを押すと、常に参照できる専用のエディタが追加されます。\n" +
      "`comboLoop` の定義をそちらに移し、メインのエディタには `comboLoop();` の呼び出しだけを残してみましょう。\n" +
      "ライブラリに書いた関数は、メインエディタからいつでも呼び出せます。",
  },
  {
    stage: {
      name: "巣ごもりオーガ",
      hp: 60,
      intentPattern: [{ kind: "attack", value: 6 }],
    },
    deck: ["lrAttack", "lrBlock"],
    allowedFns: ["attack", "block", "mainClock", "deploy", "daemonCost"],
    daemonEnabled: true,
    tip:
      "最後に **DAEMON** を紹介します。DAEMONはメインエディタとは別に動く「常駐プログラム」で、" +
      "**戦闘開始時と、それ以降は毎ターンの開始時に自動的に実行**されます。使う資源もMain Clockとは別の**Daemon Cost**です。\n\n" +
      "まず、手札のカードをDaemonへ配置する `deploy(名前)` を使います。配置されたカードは手札からは無くなりますが、" +
      "以後Daemonから呼び出せるようになります（配置コストとして、そのカードの基本コストの2倍がMain Clockから消費されます）。\n\n" +
      "メインエディタに以下を書いて実行してみましょう:\n\n" +
      "```js\ndeploy(\"attack\");\nwhile (mainClock() > 0) {\n  block();\n}\n```\n\n" +
      "`attack` をDaemonに任せたので、これ以降メインエディタでは `attack()` は呼べなくなります。" +
      "代わりに、画面に現れた **DAEMON** エディタに以下を書いてください:\n\n" +
      "```js\nwhile (daemonCost() > 0) {\n  attack();\n}\n```\n\n" +
      "DAEMONに書いたコードは毎ターンの開始時に自動で実行されます。**ターン終了**ボタンを何度か押して、" +
      "自分では `attack()` を呼んでいないのに敵へダメージが入り続けることを確認してみましょう。",
  },
];
