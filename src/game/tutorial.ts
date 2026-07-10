import type { CardId } from "./cards";
import type { StageDef } from "./stages";

export interface TutorialStep {
  title: string;            // モーダル本文の先頭に見出しとして表示する
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

// Step1〜7（旧「for文」ステップは初心者には難しく実戦でもあまり使われないため削除）
export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    title: "⚔ はじめの一撃を放とう",
    stage: {
      name: "練習用スライム",
      hp: 4,
      intentPattern: [{ kind: "attack", value: 4 }],
    },
    deck: ["tutorialAttack"],
    allowedFns: ["attack"],
    tip:
      "はじめまして、Runtime Rogueへようこそ！\n\n" +
      "このゲームでは、実際のJavaScriptコードを書いて敵と戦います。まずは肩慣らしです。\n\n" +
      "`attack()` を呼ぶと攻撃できます。手札には `attack` が1枚あります。\n\n" +
      "以下のコードを書いて **RUN** を押してみましょう。\n\n" +
      "```js\nattack(); // 敵を攻撃する\n```",
  },
  {
    title: "🔁 くり返しの呪文、while",
    stage: {
      name: "3連撃スライム",
      hp: 12,
      intentPattern: [{ kind: "attack", value: 4 }],
    },
    deck: ["tutorialAttack"],
    allowedFns: ["attack"],
    tip:
      "手札の `attack` はやっぱり1枚だけです。今度は敵のHPが12あるので、同じように書いたらどうなるか試してみましょう。\n\n" +
      "```js\nattack();\nattack();\nattack();\n```",
    followUp: {
      tip:
        "エラーが出てしまいましたね。大丈夫、ここからが本番です。\n\n" +
        "手札は1枚なのに3回書かれているのが原因です。**同じ関数は、手札にある枚数より多くコードに書くことはできません。**\n\n" +
        "同じ行を何度も書く代わりに、`while`（ループ）を使ってみましょう。\n\n" +
        "```js\nwhile (true) {\n  attack(); // これが繰り返される\n}\n```\n\n" +
        "`while (条件)` は「条件がtrueの間、くり返す」という意味です。`true` は「常に真」なので、`while (true)` は「ずっとくり返す」になります。ループの中に書けば「書いた回数」は1回とみなされます。\n\n" +
        "Main Clockがなくなるまで繰り返され、敵を倒せます。",
    },
  },
  {
    title: "🛡 攻めと守り",
    stage: {
      name: "見張りゴブリン",
      hp: 20,
      intentPattern: [{ kind: "attack", value: 5 }],
    },
    deck: ["tutorialAttack", "tutorialBlock"],
    allowedFns: ["attack", "block"],
    tip:
      "今回の敵はあなたにも攻撃してきます。`block()` を使うと、次に敵から受けるダメージを軽減できます。\n\n" +
      "`attack` と `block` が1枚ずつ手札にあります。たとえばこう書けます（他のやり方でも構いません）。\n\n" +
      "```js\nwhile (true) {\n  attack(); // 攻撃する\n  block();  // 守りも固める\n}\n```\n\n" +
      "Main Clockがなくなり敵がまだ倒れていなければ、画面右上の **ターン終了** ボタンを押して次のターンへ進みましょう。",
  },
  {
    title: "🏷 カードの個性、Unique と Disposable",
    stage: {
      name: "見習い人形",
      hp: 26,
      intentPattern: [{ kind: "attack", value: 4 }],
    },
    deck: ["tutorialAttack", "tutorialBurst", "tutorialRecover"],
    allowedFns: ["attack", "burst", "recover"],
    tip:
      "カードには特別な性質を持つものもあります。\n\n" +
      "**Unique**: 1ターンに1回しか使えません（手札のカードに付く水色の「Unique」タグで確認できます）。\n" +
      "**Disposable（使い捨て）**: 1回使うとそのステージ中は手札から無くなります（次のステージでは元に戻ります）。\n\n" +
      "今回は、強力な一撃を放つ `burst()`（Unique）と、HPを回復する `recover()`（Disposable）が手札にあります。\n\n" +
      "```js\nburst(); // 1ターンに1回だけの強い一撃\n\nwhile (true) {\n  attack(); // 通常の攻撃で残りを削る\n}\n```\n\n" +
      "`burst()` はループの外で1回だけ呼んでいる点に注目してください。ループの中に入れると、2回目の呼び出しでエラーになります。",
    followUp: {
      tip:
        "エラーになったなら、`burst()` をループの中に入れていませんか？ **Unique** 属性のカードは1ターンに1回までです。ループの外に出してみましょう。",
    },
  },
  {
    title: "🔀 条件で分岐する、if",
    stage: {
      // このステップのコードは if 文（ループなし）なので、AUTOは1攻撃ごとにRUNし直す形になる。
      // HPが大きいと「1ターン分の攻撃回数×ターン数」のRUNサイクルが積み重なり体感が遅くなるため、
      // 1ターン（Main Clock 10 / 攻撃コスト1 = 最大10回）で倒し切れる程度に抑える
      name: "居眠り門番",
      hp: 32,
      intentPattern: [{ kind: "block", value: 6 }],
    },
    deck: ["tutorialAttack"],
    allowedFns: ["attack", "mainClock", "endTurn"],
    tip:
      "この敵はブロックしかしてこないので、安心していろいろ試せます。\n\n" +
      "Main Clockが残っている間は攻撃し、無くなったらターンを終える——そんな判断をコードにするにはどうしたらいいでしょう？\n\n" +
      "`if` 文を使うと、条件によって処理を変えられます。たとえばこう書けます。\n\n" +
      "```js\nif (mainClock() > 0) {\n  attack();  // Main Clockが残っていれば攻撃\n} else {\n  endTurn(); // 残っていなければターンを終える\n}\n```\n\n" +
      "このコードを書いたら、RUNの隣にある **⟳ AUTO** ボタンを押してみましょう。書いた判断が自動でくり返されます。",
  },
  {
    title: "⚡ あなただけの必殺技を作ろう",
    stage: {
      name: "しつこいゴブリン",
      hp: 40,
      intentPattern: [{ kind: "attack", value: 5 }],
    },
    deck: ["tutorialAttack", "tutorialBlock"],
    allowedFns: ["attack", "block", "mainClock"],
    unlockFunctionKw: true,
    tip:
      "ここまでは、用意された道具を組み合わせるだけでした。ここから先は少し違います。\n\n" +
      "あんなのあったら良いな…と、考えてみましょう。\n\n" +
      "言葉にできるものは何でも作れます！\n\n" +
      "`function` を使うと、自分だけの関数を定義できます。これまで書いてきたループを、ひとつの関数にまとめてみましょう。\n\n" +
      "```js\n// 関数を作成\nfunction comboLoop() {\n  while (mainClock() > 0) {\n    attack();\n    block();\n  }\n}\n\n// 作成した関数を使用！\ncomboLoop();\n```\n\n" +
      "名前も中身も自由です。上の例は一つの案にすぎません。",
    followUp: {
      tip:
        "エラーになった？よくあることです。むしろ、何か新しいことを試した証拠です。\n\n" +
        "こんな発想もあります。\n\n" +
        "```js\n// 関数を作成\nfunction guard() {\n  while (mainClock() > 0) {\n    block();\n    if (mainClock() > 0) attack();\n  }\n}\n\n// 作成した関数を使用！\nguard();\n```\n\n" +
        "迷ったら、下の「← 元の説明を見る」でさっきの説明を見比べられます。",
    },
  },
  {
    title: "🤖 動き続けるプログラム、DAEMON",
    stage: {
      name: "巣ごもりオーガ",
      hp: 60,
      intentPattern: [{ kind: "attack", value: 6 }],
    },
    deck: ["tutorialAttack", "tutorialBlock"],
    allowedFns: ["attack", "block", "mainClock", "daemonCost"],
    daemonEnabled: true,
    tip:
      "最後に **DAEMON** を紹介します。DAEMONはメインエディタとは別に動く「常駐プログラム」で、" +
      "**戦闘開始時と、それ以降は毎ターンの開始時に自動的に実行**されます。使う資源もMain Clockとは別の**Daemon Cost**です。\n\n" +
      "あなたが考えた動きを、あなたが見ていない間も実行させる——そんなことができます。\n\n" +
      "まず、画面下の **CONSOLE** パネルに次のように入力してEnterを押してみましょう。\n\n" +
      "```\ndeploy attack\n```\n\n" +
      "`attack` カードがDaemonへ配置されます（配置コストとして、そのカードの基本コストの2倍がMain Clockから消費されます）。\n\n" +
      "`attack` をDaemonに任せたので、これ以降メインエディタでは `attack()` は呼べなくなります。メインエディタには以下を書いてください。\n\n" +
      "```js\nwhile (mainClock() > 0) {\n  block(); // 攻撃はDaemonに任せて、こちらは守りに専念\n}\n```\n\n" +
      "そして、画面に現れた **DAEMON** エディタに以下を書いてください。\n\n" +
      "```js\nwhile (daemonCost() > 0) {\n  attack(); // 毎ターン自動で実行される\n}\n```\n\n" +
      "**ターン終了**ボタンを何度か押して、自分では `attack()` を呼んでいないのに敵へダメージが入り続けることを確認してみましょう。",
  },
];

// チュートリアル完了時に表示するメッセージ
export const TUTORIAL_COMPLETE_OVERLAY = "🎓 チュートリアル完了！"; // オーバーレイ用（短く）
export const TUTORIAL_COMPLETE_LOG =
  "あんなのあったら良いな、と思ったものが、もう作れるようになっています。ここから先は、あなた次第です。"; // ログ用（Step6の2行に回帰）
