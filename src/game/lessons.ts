import type { UnlockFunctions } from "../sandbox/worker";

// レッスン: 関数「アクセス権」とは別に、既にアンロック済みの関数の実践的な使い方（構文パターン）を
// バイトで購入して学ぶ読み物。対象はアンロック関数と1対1ではなく、複数関数にまたがる概念（代入・分割代入等）
// を代表関数1つに紐づけて教える。詳細はCONTEXT.mdの「レッスン」参照
export interface LessonDef {
  id: string;
  title: string;
  // このレッスンを購入するための前提条件（この関数が既にアンロック済みであること）。
  // 指定された場合、同時にレッスン内の例文もこの関数で固定する。
  // 未指定（アンロック関数と紐付かない一般的なJS構文）の場合、前提条件なしで常に購入可能
  requiresFn?: keyof UnlockFunctions;
  byteCost: number;
  body: string; // Markdown（```js コードフェンス対応。main.tsのrenderMarkdown()でHTML化される）
}

export const LESSONS: LessonDef[] = [
  {
    id: "assignment",
    title: "代入",
    requiresFn: "enemyIntent",
    byteCost: 1000,
    body:
      "関数の戻り値は、変数に代入していつでも使い回せます。\n\n" +
      "```js\nconst intent = enemyIntent();\nif (intent.kind === \"attack\") {\n  block();\n}\n```\n\n" +
      "毎回 `enemyIntent()` を書き直さなくても、一度 `const` に入れておけば同じ結果を何度でも参照できます。",
  },
  {
    id: "myHp",
    title: "myHp",
    requiresFn: "myHp",
    byteCost: 150,
    body:
      "自分の現在HPを確認できます。\n\n" +
      "```js\nconst hp = myHp();\nif (hp < 10) {\n  block();\n}\n```\n\n" +
      "HPが少ないときだけ守りに回る、といった判断に使えます。",
  },
  {
    id: "turn",
    title: "turn",
    requiresFn: "turn",
    byteCost: 150,
    body:
      "現在のターン数を確認できます。\n\n" +
      "```js\nif (turn() > 5) {\n  block();\n}\n```\n\n" +
      "序盤と終盤で戦い方を切り替える、といった判断に使えます。",
  },
  {
    id: "myBlock",
    title: "myBlock",
    requiresFn: "myBlock",
    byteCost: 150,
    body:
      "自分の現在ブロック量を確認できます。\n\n" +
      "```js\nif (myBlock() === 0) {\n  block();\n}\n```\n\n" +
      "ブロックが切れているときだけ張り直す、といった無駄のない立ち回りに使えます。",
  },
  {
    id: "enemyHp",
    title: "enemyHp",
    requiresFn: "enemyHp",
    byteCost: 300,
    body:
      "敵の現在HPを確認できます。\n\n" +
      "```js\nif (enemyHp() < 10) {\n  attack();\n}\n```\n\n" +
      "敵の残りHPを見てから攻め方を変える、といった判断に使えます。",
  },
  {
    id: "enemyBlock",
    title: "enemyBlock",
    requiresFn: "enemyBlock",
    byteCost: 300,
    body:
      "敵の現在ブロック量を確認できます。\n\n" +
      "```js\nif (enemyBlock() > 0) {\n  attack();\n}\n```\n\n" +
      "ブロックが残っている間は攻撃を重ねる、といった立ち回りに使えます。",
  },
  {
    id: "damageDealtThisTurn",
    title: "damageDealtThisTurn",
    requiresFn: "damageDealtThisTurn",
    byteCost: 300,
    body:
      "このターン中に敵へ与えた合計ダメージを確認できます。\n\n" +
      "```js\nif (damageDealtThisTurn() < 20) {\n  attack();\n}\n```\n\n" +
      "そのターンの手応えを見て、追加の一手を判断できます。",
  },
  {
    id: "myDiscard",
    title: "myDiscard",
    requiresFn: "myDiscard",
    byteCost: 300,
    body:
      "捨て札を配列で確認できます。\n\n" +
      "```js\nconst discard = myDiscard();\nif (discard.length > 3) {\n  block();\n}\n```\n\n" +
      "これまで何を使ってきたかを振り返りながら判断できます。",
  },
  {
    id: "comboIncrement",
    title: "comboIncrement",
    requiresFn: "comboIncrement",
    byteCost: 500,
    body:
      "コンボが1回の使用でどれだけ増えるかを確認できます（0なら増加停止中）。\n\n" +
      "```js\nif (comboIncrement() > 0) {\n  attack();\n}\n```\n\n" +
      "コンボが増えなくなっているときは別の手に切り替える、といった判断に使えます。",
  },
  {
    id: "isUsable",
    title: "isUsable",
    requiresFn: "isUsable",
    byteCost: 500,
    body:
      "そのカードが今使用可能かどうかを確認できます（Unique使用済み等はfalse）。\n\n" +
      "```js\nif (isUsable(\"attack\")) {\n  attack();\n}\n```\n\n" +
      "使えないカードを呼んでエラーになる前に、使える手だけを選べます。",
  },
  {
    id: "myDeck",
    title: "myDeck",
    requiresFn: "myDeck",
    byteCost: 500,
    body:
      "デッキ全体のカード配列を確認できます。\n\n" +
      "```js\nconst deck = myDeck();\nif (deck.includes(\"block\")) {\n  block();\n}\n```\n\n" +
      "デッキ構成全体を見てから戦略を組み立てられます。",
  },
  {
    id: "myDeployed",
    title: "myDeployed",
    requiresFn: "myDeployed",
    byteCost: 500,
    body:
      "Daemonにデプロイ済みのカードを配列で確認できます。\n\n" +
      "```js\nconst deployed = myDeployed();\nif (deployed.includes(\"attack\")) {\n  block();\n}\n```\n\n" +
      "Daemon側で何が常駐しているかを踏まえて、Main Thread側の立ち回りを決められます。",
  },
  {
    id: "endTurn",
    title: "endTurn",
    requiresFn: "endTurn",
    byteCost: 500,
    body:
      "コードの中からターンを終了できます。\n\n" +
      "```js\nwhile (mainClock() > 0) {\n  attack();\n}\nendTurn();\n```\n\n" +
      "エネルギーを使い切ったら自動でターンを終える、というループが書けます。",
  },
  {
    id: "myHand",
    title: "myHand",
    requiresFn: "myHand",
    byteCost: 750,
    body:
      "現在の手札を配列で確認できます。\n\n" +
      "```js\nconst hand = myHand();\nif (hand.includes(\"block\")) {\n  block();\n}\n```\n\n" +
      "今引いているカードに応じて次の手を選べます。",
  },
  {
    id: "myDrawPile",
    title: "myDrawPile",
    requiresFn: "myDrawPile",
    byteCost: 1000,
    body:
      "山札（これからドローするカード）を配列で確認できます。\n\n" +
      "```js\nconst next = myDrawPile();\nif (next.includes(\"attack\")) {\n  block();\n}\n```\n\n" +
      "次に何を引くかが分かっていれば、先回りした立ち回りができます。",
  },
  {
    id: "function",
    title: "function",
    byteCost: 150,
    body:
      "自分だけの関数を作ると、何度も使う処理に名前を付けて呼び出せます。\n\n" +
      "```js\nfunction doubleAttack() {\n  attack();\n  attack();\n}\n\ndoubleAttack();\n```\n\n" +
      "「あんなのあったら良いな」と思った動きは、`function` で言葉にして自分だけのカードのように呼び出せます。",
  },
  {
    id: "includes",
    title: "includes",
    byteCost: 150,
    body:
      "配列に特定の値が含まれているかどうかは、`includes()` で調べられます。\n\n" +
      "```js\nconst hand = myHand();\nif (hand.includes(\"block\")) {\n  block();\n}\n```\n\n" +
      "手札や山札の中身をそのまま条件分岐に使いたいときに便利です。",
  },
];
