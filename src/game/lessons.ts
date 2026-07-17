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
    title: "代入とlet/constの違い",
    requiresFn: "enemyIntent",
    byteCost: 1300,
    body:
      "関数の戻り値は、変数に代入していつでも使い回せます。\n\n" +
      "```js\nconst intent = enemyIntent();\nif (intent.kind === \"attack\") {\n  block();\n}\n```\n\n" +
      "毎回 `enemyIntent()` を書き直さなくても、一度 `const` に入れておけば同じ結果を何度でも参照できます。\n\n" +
      "変数には`let`と`const`の2種類があります。`let`は後から値を再代入できる変数、`const`は一度代入したら再代入できない変数です。\n\n" +
      "```js\nlet count = 0;\ncount = count + 1; // OK\n\nconst hp = myHp();\nhp = 10; // エラーになる\n```\n\n" +
      "途中で値を書き換える予定があるなら`let`、書き換えないなら`const`を使うのが基本です。" +
      "書き換えない前提で`const`にしておくと、後から「あれ、この変数どこかで変わってる？」と探す手間が減ります。",
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
    title: "functionと引数・戻り値",
    byteCost: 600,
    body:
      "自分だけの関数を作ると、何度も使う処理に名前を付けて呼び出せます。\n\n" +
      "```js\nfunction doubleAttack() {\n  attack();\n  attack();\n}\n\ndoubleAttack();\n```\n\n" +
      "「あんなのあったら良いな」と思った動きは、`function` で言葉にして自分だけのカードのように呼び出せます。\n\n" +
      "関数は、`()`の中で値（引数）を受け取り、`return`で値を返すこともできます。\n\n" +
      "```js\nfunction isLowHp(threshold) {\n  return myHp() < threshold;\n}\n\nif (isLowHp(10)) {\n  block();\n}\n```\n\n" +
      "判定ロジックを関数として切り出しておくと、しきい値を変えながら何度でも呼び出せます。",
  },
  {
    id: "includes",
    title: "includesとlength",
    byteCost: 600,
    body:
      "配列に特定の値が含まれているかどうかは、`includes()` で調べられます。\n\n" +
      "```js\nconst hand = myHand();\nif (hand.includes(\"block\")) {\n  block();\n}\n```\n\n" +
      "手札や山札の中身をそのまま条件分岐に使いたいときに便利です。\n\n" +
      "配列の要素数は`.length`で確認できます。\n\n" +
      "```js\nif (myHand().length >= 4) {\n  attack();\n}\n```\n\n" +
      "「何が入っているか」を見る`includes`と、「いくつ入っているか」を見る`.length`は、配列を扱うときによく組み合わせて使います。",
  },

  // ─── プログラミング基礎・JS基礎 ─────────────────────────────────
  {
    id: "dotNotation",
    title: "ドット記法・オブジェクトリテラル・メソッド",
    byteCost: 1550,
    body:
      "オブジェクトの中の値には、`.`（ドット）でアクセスできます。\n\n" +
      "```js\nconst intent = enemyIntent();\nconsole.log(intent.kind);\n```\n\n" +
      "`intent.kind`のように、`.プロパティ名`で中身を取り出せます。\n\n" +
      "このようなオブジェクトは、`{ }`を使えば自分でも作れます。プロパティ名と値を`:`で結んで書きます。\n\n" +
      "```js\nconst myStatus = {\n  hp: myHp(),\n  block: myBlock(),\n};\n\nconsole.log(myStatus.hp);\n```\n\n" +
      "複数の値をひとまとめにして持ち運びたいときに便利です。\n\n" +
      "さらに、オブジェクトのプロパティの値が関数であるとき、それを**メソッド**と呼びます。" +
      "実は`myHand().includes(...)`の`includes`もメソッドの一種です。\n\n" +
      "```js\nconst helper = {\n  isLowHp: function () {\n    return myHp() < 10;\n  },\n};\n\nif (helper.isLowHp()) {\n  block();\n}\n```\n\n" +
      "「オブジェクト.関数っぽいもの()」という形を見たら、それはメソッド呼び出しです。自分で関数を作る詳しい書き方は`function`のレッスンで扱います。",
  },
  {
    id: "comments",
    title: "コメント（//）",
    byteCost: 300,
    body:
      "コードの説明を書きたいときは、`//`から行末までがコメントになります。\n\n" +
      "```js\n// HPが少ない時はブロックする\nif (myHp() < 10) {\n  block();\n}\n```\n\n" +
      "コメントはコードとして実行されないので、自分用のメモを自由に書けます。",
  },
  {
    id: "consoleLog",
    title: "console.logでのデバッグ",
    byteCost: 300,
    body:
      "`console.log()`で、実行中の値をコンソールに表示できます。\n\n" +
      "```js\nconsole.log(\"現在のHP:\", myHp());\n```\n\n" +
      "意図した通りに値が変化しているか、実行しながら確認できます。",
  },
  {
    id: "truthyFalsy",
    title: "truthy/falsyとBoolean変換",
    byteCost: 600,
    body:
      "JavaScriptでは、`0`や空文字・`null`・`undefined`は`if`の中で「偽」として扱われ、それ以外は「真」として扱われます。\n\n" +
      "```js\nif (myBlock()) {\n  attack();\n}\n```\n\n" +
      "`myBlock() > 0`と書かなくても、`myBlock()`が0でなければ真として動きます。\n\n" +
      "値を明示的に真偽値へ変換したいときは、`Boolean()`か`!!`（二重否定）を使います。\n\n" +
      "```js\nconsole.log(Boolean(0));  // false\nconsole.log(!!myBlock()); // myBlock()が0ならfalse、それ以外はtrue\n```\n\n" +
      "`if`の中では自動的に変換されますが、変数として「真偽値そのもの」を持っておきたいときに使えます。",
  },
  {
    id: "strictEquality",
    title: "===と==の違い・参照比較",
    byteCost: 1250,
    body:
      "`===`は値と型の両方を比較する厳密な比較演算子です。`==`は型を変換してから比較するため、意図しない一致が起きることがあります。\n\n" +
      "```js\nif (enemyIntent().kind === \"attack\") {\n  block();\n}\n```\n\n" +
      "迷ったら基本的に`===`を使うのが安全です。\n\n" +
      "ただし、オブジェクトや配列を`===`で比較すると、中身が同じでも「別物」として扱われることがあります。" +
      "比較されるのは中身ではなく、**同じ場所を指しているかどうか**だからです。\n\n" +
      "```js\nconst a = { kind: \"attack\" };\nconst b = { kind: \"attack\" };\nconsole.log(a === b); // false（中身は同じでも別のオブジェクト）\n\n" +
      "const intent = enemyIntent();\nconsole.log(intent === intent); // true（同じものを指している）\n```\n\n" +
      "オブジェクトの中身を比較したいときは、`===`ではなく`.kind`のようにプロパティごとに比較する必要があります。",
  },
  {
    id: "ifElse",
    title: "if/else if/elseと早期return",
    byteCost: 800,
    body:
      "`if`は条件が真のときだけ実行し、`else`はそれ以外のときに実行します。`else if`で条件を追加できます。\n\n" +
      "```js\nif (myHp() < 10) {\n  block();\n} else if (enemyHp() < 10) {\n  attack();\n} else {\n  attack();\n}\n```\n\n" +
      "状況に応じて行動を切り替える、コードの基本形です。\n\n" +
      "条件に合わない場合をすぐ`return`で抜けてしまうと、`if`の入れ子が浅くなって読みやすくなります（早期return、ガード節と呼ばれる書き方です）。\n\n" +
      "```js\nfunction shouldBlock() {\n  if (myHp() >= 10) return false;\n  if (myBlock() > 0) return false;\n  return true;\n}\n```\n\n" +
      "`if (A) { if (B) { ... } }`のように深く入れ子にするより、条件が成り立たない場合を先に弾いておく方が見通しがよくなります。",
  },
  {
    id: "logicalShortCircuit",
    title: "&&/||の短絡評価と返り値の正体",
    byteCost: 1250,
    body:
      "`&&`は左が真の時だけ右を実行し、`||`は左が偽の時だけ右を評価します。\n\n" +
      "```js\nmyBlock() === 0 && block();\n```\n\n" +
      "`if`を書かずに「条件が成り立つ時だけ実行する」という短い書き方ができます。\n\n" +
      "実は`&&`と`||`は、真偽値ではなく「最後に評価した値そのもの」を返しています。\n\n" +
      "```js\nconst card = myHand()[0] || \"none\";\nconsole.log(card); // 手札の先頭、なければ\"none\"\n\n" +
      "console.log(0 && \"x\"); // 0（左側で止まる）\nconsole.log(1 && \"x\"); // \"x\"（右側まで評価される）\n```\n\n" +
      "この性質を使うと、「値がなければ既定値を使う」という書き方が`if`なしでできます。",
  },
  {
    id: "ternary",
    title: "三項演算子",
    byteCost: 500,
    body:
      "`条件 ? A : B`で、条件が真ならA、偽ならBという値になります。`if/else`の短い言い換えです。\n\n" +
      "```js\nmyHp() < 10 ? block() : attack();\n```\n\n" +
      "1行で済む簡単な分岐に向いています。",
  },
  {
    id: "switchStatement",
    title: "switch文とフォールスルー",
    byteCost: 1250,
    body:
      "`switch`は、1つの値に対して複数のケースを順番に比較したいときに使います。\n\n" +
      "```js\nswitch (enemyIntent().kind) {\n  case \"attack\":\n    block();\n    break;\n  case \"block\":\n    attack();\n    break;\n}\n```\n\n" +
      "`if/else if`が長くなりすぎる時に整理して書けます。\n\n" +
      "注意点として、`break`を書き忘れると次の`case`にそのまま処理が続いてしまいます（フォールスルー）。" +
      "どのケースにも当てはまらない場合の受け皿として`default`も書けます。\n\n" +
      "```js\nswitch (enemyIntent().kind) {\n  case \"attack\":\n    block();\n    break;\n  case \"block\":\n    attack();\n    break;\n  default:\n    attack();\n}\n```\n\n" +
      "`break`忘れは意図しないバグの原因になりやすいので、基本的には各`case`の最後に必ず書く習慣をつけると安全です。",
  },
  {
    id: "whileLoop",
    title: "while文とdo...while",
    byteCost: 500,
    body:
      "`while`は、条件が真である間、繰り返し実行し続けます。\n\n" +
      "```js\nwhile (mainClock() > 0) {\n  attack();\n}\n```\n\n" +
      "Main Clockが尽きるまで攻撃し続ける、といった処理が書けます。\n\n" +
      "似た構文に`do...while`があります。こちらは条件を確認する前に、必ず1回だけ本体を実行します。\n\n" +
      "```js\ndo {\n  attack();\n} while (mainClock() > 0 && isUsable(\"attack\"));\n```\n\n" +
      "「とりあえず1回はやってから条件を見る」という処理に向いています。ただし条件がずっと真のままだと無限ループになってしまうので、" +
      "ループの中で条件に関わる値がちゃんと変化しているかを意識しておくと安全です。",
  },
  {
    id: "forLoop",
    title: "for文とスコープ",
    byteCost: 750,
    body:
      "`for`は、繰り返す回数をあらかじめ決めてループしたいときに使います。\n\n" +
      "```js\nfor (let i = 0; i < 3; i++) {\n  attack();\n}\n```\n\n" +
      "`i`が0から始まり、3になるまで（3回）繰り返します。\n\n" +
      "`i`は`for`の`()`の中で`let`宣言されているため、ループの外からは参照できません（これをスコープと呼びます）。" +
      "また、初期化・条件・更新の3つはそれぞれ自由に書き換えられるので、カウントダウンや増分を変えることもできます。\n\n" +
      "```js\nfor (let i = 3; i > 0; i--) {\n  console.log(i);\n}\n```",
  },
  {
    id: "breakContinue",
    title: "break/continueとラベル",
    byteCost: 750,
    body:
      "`break`はループを即座に抜け、`continue`はそのループの残りをスキップして次の回に進みます。\n\n" +
      "```js\nfor (const card of myHand()) {\n  if (card === \"block\") continue;\n  console.log(card);\n}\n```\n\n" +
      "特定の条件だけ処理をスキップしたい時に使えます。\n\n" +
      "ループが二重（入れ子）になっているとき、`break`は一番内側のループしか抜けません。外側までまとめて抜けたいときは、" +
      "ループにラベルを付けて`break ラベル名`と書きます。\n\n" +
      "```js\nouter: for (const card of myHand()) {\n  for (let i = 0; i < 2; i++) {\n    if (card === \"block\") break outer;\n  }\n}\n```\n\n" +
      "多用すると読みにくくなりがちなので、本当に必要な時だけ使うのがおすすめです。",
  },
  {
    id: "forOf",
    title: "for...ofとentries",
    byteCost: 750,
    body:
      "`for...of`は、配列の中身を1つずつ順番に取り出して処理できます。\n\n" +
      "```js\nfor (const card of myHand()) {\n  console.log(card);\n}\n```\n\n" +
      "手札や捨て札など、配列を丸ごと確認したい時に便利です。\n\n" +
      "何番目の要素かという「添字（インデックス）」も同時に欲しい場合は、`.entries()`を組み合わせます。\n\n" +
      "```js\nfor (const [i, card] of myHand().entries()) {\n  console.log(i, card);\n}\n```\n\n" +
      "似た名前の`for...in`もありますが、こちらは添字を文字列として列挙するもので、配列に対しては`for...of`を使うのが基本です。",
  },
  {
    id: "arrowFunction",
    title: "アロー関数・デフォルト引数・関数を値として渡す",
    byteCost: 1750,
    body:
      "アロー関数は`function`の短い書き方です。`=>`を使います。\n\n" +
      "```js\nconst isLowHp = (threshold) => myHp() < threshold;\n\nif (isLowHp(10)) {\n  block();\n}\n```\n\n" +
      "特に`filter`や`find`に渡す短い関数でよく使われます。\n\n" +
      "引数が渡されなかった時のために、デフォルト値を設定することもできます。\n\n" +
      "```js\nconst isLowHp2 = (threshold = 10) => myHp() < threshold;\n\nisLowHp2();   // 10と比較\nisLowHp2(20); // 20と比較\n```\n\n" +
      "呼び出し側が省略しても、安全な既定値で動きます。\n\n" +
      "さらに、関数は数値や文字列と同じように、変数に入れたり他の関数に渡したりできる**値**です。\n\n" +
      "```js\nfunction runIfSafe(condition, action) {\n  if (condition()) {\n    action();\n  }\n}\n\nrunIfSafe(() => myHp() > 10, () => attack());\n```\n\n" +
      "この「関数を引数として渡す」という考え方が、後で出てくる`filter`や`map`のような配列メソッドの土台になっています。",
  },
  {
    id: "arrayFind",
    title: "findとfilter",
    byteCost: 1500,
    body:
      "`find`は、条件に合う最初の1件を配列から探します。見つからなければ`undefined`になります。\n\n" +
      "```js\nconst blockCard = myHand().find(c => c === \"block\");\nif (blockCard) {\n  block();\n}\n```\n\n" +
      "`c => c === \"block\"`の部分は、配列の中身を1つずつ受け取ってチェックする小さな関数です。" +
      "`c`が「今チェックしている1個分の中身」（好きな名前でOK）、`=>`の右側がその判定式です。\n\n" +
      "```js\n// myHand() が [\"attack\", \"block\", \"attack\"] だとすると\nc = \"attack\"; c === \"block\" // → false（次へ）\nc = \"block\";  c === \"block\" // → true（ここで確定。findはこの\"block\"を返す）\n```\n\n" +
      "`function`を使わずに短く書けるので、`find`のような「配列の中身を1つずつチェックする」処理でよく使われます。" +
      "「1つでもあれば十分」という探し方に向いています。\n\n" +
      "一方`filter`は、同じように中身を1つずつチェックしますが、条件に合う要素**全部**を集めた新しい配列を作ります。\n\n" +
      "```js\nconst attacks = myHand().filter(c => c === \"attack\");\nif (attacks.length >= 2) {\n  attack();\n}\n```\n\n" +
      "「1件だけあれば十分か」「該当する分だけ全部欲しいか」で、`find`と`filter`を使い分けます。",
  },
  {
    id: "someEvery",
    title: "some/everyとmap",
    byteCost: 2000,
    body:
      "`some`は「1つでも条件を満たすか」、`every`は「全部条件を満たすか」を真偽値で返します。" +
      "どちらも`find`や`filter`と同じように、`c => ...`という形の小さな関数を渡して配列の中身を1つずつチェックします" +
      "（`c`が今チェックしている1個分の中身、`=>`の右側が判定式です）。\n\n" +
      "```js\nconst hasBlock  = myHand().some(c => c === \"block\");\nconst allAttack = myHand().every(c => c === \"attack\");\n```\n\n" +
      "`find`と違って、中身そのものではなく「あるかないか」だけを知りたい時に向いています。\n\n" +
      "`map`は、配列の各要素を変換した新しい配列を作ります。\n\n" +
      "```js\nconst upper = myHand().map(c => c.toUpperCase());\nconsole.log(upper);\n```\n\n" +
      "`c => c.toUpperCase()`は「その1個（`c`）を大文字にした結果を返す」という関数です。" +
      "`some`/`every`が真偽値を返す関数を渡すのに対して、`map`は「変換した後の値」を返す関数を渡す、という違いがあります。\n\n" +
      "`filter`が「選び出す」操作なのに対して、`map`は「中身の個数を変えずにそれぞれ加工する」操作です。似た形をしているので、目的に応じて使い分けます。",
  },
  {
    id: "destructuringArray",
    title: "分割代入（配列・オブジェクト）とデフォルト値",
    byteCost: 2000,
    body:
      "配列の要素を、順番通りに変数へ一気に取り出せます。\n\n" +
      "```js\nconst [first, second] = myHand();\nconsole.log(first);\n```\n\n" +
      "先頭の数枚だけ扱いたい時に、`myHand()[0]`と書くより読みやすくなります。\n\n" +
      "オブジェクトの場合は、プロパティを名前を指定して変数に取り出せます。\n\n" +
      "```js\nconst { kind, value } = enemyIntent();\nif (kind === \"attack\") {\n  console.log(\"敵の攻撃力:\", value);\n}\n```\n\n" +
      "`intent.kind`を何度も書く代わりに、最初に1回だけ取り出しておけます。\n\n" +
      "どちらの分割代入も、取り出す値がない場合に備えてデフォルト値を指定できます。\n\n" +
      "```js\nconst [first2 = \"none\"] = [];\nconsole.log(first2); // \"none\"\n\nconst { value: v = 0 } = {};\nconsole.log(v); // 0\n```\n\n" +
      "配列やオブジェクトが空っぽの時にエラーにならず、安全な既定値で動かせます。",
  },
  {
    id: "spreadSyntax",
    title: "スプレッド構文とテンプレートリテラル",
    byteCost: 1250,
    body:
      "`...`（スプレッド構文）で、配列やオブジェクトの中身を展開してコピーできます。\n\n" +
      "```js\nconst handCopy = [...myHand()];\nhandCopy.push(\"dummy\");\nconsole.log(myHand().length, handCopy.length);\n```\n\n" +
      "元の配列を書き換えずに、安全に加工したコピーを作れます。\n\n" +
      "バッククォート`` ` ``で囲むと、`${}`の中に変数や式を埋め込んだ文字列が書けます（テンプレートリテラル）。\n\n" +
      "```js\nconsole.log(`HP: ${myHp()} / Block: ${myBlock()}`);\n```\n\n" +
      "文字列を`+`でつなげるより読みやすく書けます。どちらも、値を「そのまま」ではなく「組み立て直して」使いたい時の道具という点で似ています。",
  },
  {
    id: "nullishDefault",
    title: "デフォルト値・null合体とオプショナルチェーン",
    byteCost: 1750,
    body:
      "`??`は、左側が`null`または`undefined`の時だけ右側の値を使います。\n\n" +
      "```js\nconst card = myHand().find(c => c === \"block\") ?? \"none\";\nconsole.log(card);\n```\n\n" +
      "`||`と似ていますが、`0`や空文字は「値がある」として扱う点が違います。\n\n" +
      "よくセットで使われるのが`?.`（オプショナルチェーン）です。値が`null`や`undefined`かもしれない時、`.`の代わりに`?.`を使うと、" +
      "途中でエラーにならず`undefined`を返してくれます。\n\n" +
      "```js\nconst maybeCard = myHand().find(c => c === \"block\");\nconsole.log(maybeCard?.length); // maybeCardがundefinedでもエラーにならない\n```\n\n" +
      "`?.`と`??`を組み合わせると、「あるかもしれないし、ないかもしれない値」を安全に扱えます。\n\n" +
      "```js\nconst length = maybeCard?.length ?? 0;\n```",
  },
  {
    id: "bracketNotation",
    title: "ブラケット記法とObject.keys/values/entries",
    byteCost: 2000,
    body:
      "プロパティ名が変数に入っている時など、`.`の代わりに`[]`でアクセスできます。\n\n" +
      "```js\nconst key = \"kind\";\nconst intent = enemyIntent();\nconsole.log(intent[key]);\n```\n\n" +
      "プロパティ名を実行時に決めたい場合に使います。\n\n" +
      "読み取りだけでなく、オブジェクトを作る時にも`[]`が使えます。プロパティ名を変数から動的に決めたい場合は、" +
      "`{ }`の中で`[変数名]: 値`のように書きます。\n\n" +
      "```js\nconst key2 = \"hp\";\nconst status = {\n  [key2]: myHp(),\n};\nconsole.log(status.hp);\n```\n\n" +
      "`Object.keys()`はプロパティ名の配列、`Object.values()`は値の配列を返します。\n\n" +
      "```js\nconst intent2 = enemyIntent();\nconsole.log(Object.keys(intent2));   // [\"kind\", \"value\"]\nconsole.log(Object.values(intent2)); // [\"attack\", 7] など\n```\n\n" +
      "オブジェクトの中身を配列として扱いたい時に使えます。\n\n" +
      "プロパティ名と値を両方まとめて欲しい時は`Object.entries()`が使えます。`for...of`と分割代入を組み合わせると、" +
      "名前と値を同時に取り出しながら処理できます。\n\n" +
      "```js\nfor (const [k, v] of Object.entries(intent2)) {\n  console.log(k, v);\n}\n```",
  },
  {
    id: "modulo",
    title: "剰余演算子（%）とMath.floor/ceil/round",
    byteCost: 1000,
    body:
      "`%`（剰余演算子）は、割り算の余りを求めます。「nターンごとに」といった周期判定によく使われます。\n\n" +
      "```js\nif (turn() % 3 === 0) {\n  block();\n}\n```\n\n" +
      "3ターンに1回だけブロックする、といった動きが書けます。\n\n" +
      "小数を整数に揃えたい時は、`Math.floor`（切り捨て）・`Math.ceil`（切り上げ）・`Math.round`（四捨五入）を使います。\n\n" +
      "```js\nconsole.log(Math.floor(4.7)); // 4\nconsole.log(Math.ceil(4.2));  // 5\nconsole.log(Math.round(4.5)); // 5\n```\n\n" +
      "どれも計算結果を整数に揃えたい時によく使われます。",
  },
  {
    id: "mathMinMax",
    title: "Math.min/maxとMath.random()",
    byteCost: 1500,
    body:
      "`Math.min`は複数の値のうち最小、`Math.max`は最大を返します。\n\n" +
      "```js\nconst safeAmount = Math.min(myBlock(), 10);\n```\n\n" +
      "値が上限・下限を超えないように抑えたい時に便利です。\n\n" +
      "`Math.random()`は、0以上1未満のランダムな小数を返します。\n\n" +
      "```js\nif (Math.random() < 0.5) {\n  console.log(\"表\");\n} else {\n  console.log(\"裏\");\n}\n```\n\n" +
      "RNG Crackerの内部seedも、突き詰めればこの考え方の応用です。\n\n" +
      "「0以上1未満の小数」だけでなく「1〜6のランダムな整数」のような範囲が欲しいときは、`Math.floor`と組み合わせます。\n\n" +
      "```js\nconst dice = Math.floor(Math.random() * 6) + 1; // 1〜6のいずれか\n```\n\n" +
      "`Math.random() * 6`で0以上6未満の小数にし、`Math.floor`で整数に切り捨て、`+1`で1〜6の範囲にずらしています。",
  },
  {
    id: "tryCatch",
    title: "try/catch/finallyと命名の付け方",
    byteCost: 2250,
    body:
      "`try`ブロックの中でエラーが起きても、`catch`で受け止めれば処理全体は止まりません。\n\n" +
      "```js\ntry {\n  attack();\n} catch (e) {\n  console.log(\"失敗:\", e.message);\n}\n```\n\n" +
      "使えないカードを誤って呼んでしまった時など、そこで処理が止まるのを防げます。\n\n" +
      "さらに`finally`ブロックを付けると、成功しても失敗しても必ず実行したい処理を書けます。\n\n" +
      "```js\ntry {\n  attack();\n} catch (e) {\n  console.log(\"失敗:\", e.message);\n} finally {\n  console.log(\"ここは必ず実行される\");\n}\n```\n\n" +
      "後片付けのような、結果に関わらずやっておきたい処理に向いています。\n\n" +
      "変数名や関数名は、中身が想像できる名前を付けると、後から自分で読み返した時に分かりやすくなります。\n\n" +
      "```js\n// 分かりにくい\nconst x = myHp() < 10;\n\n// 分かりやすい\nconst isLowHp = myHp() < 10;\n```\n\n" +
      "特に真偽値を持つ変数には`is`/`has`のような接頭辞をつけると、「true/falseが入っている」と一目で伝わります" +
      "（`isLowHp`、`hasBlock`など）。コードが長くなるほど、名前の分かりやすさが効いてきます。",
  },
];
