export type Rarity = "starter" | "common" | "uncommon" | "rare" | "fatal";
export type CardAttribute = "unique" | "disposable";

export type CardId =
  // Legacy cards
  | "attack" | "block" | "heal" | "execute" | "vulnerable" | "poison"
  | "pierce" | "shatter"
  | "drain" | "nullify" | "overload" | "reboot" | "combo" | "debug" | "cycler"
  // Loop Runner Starter
  | "lrAttack" | "lrBlock" | "noop"
  // Loop Runner Common
  | "initialize" | "forceQuit" | "overClock" | "incrementalAttack" | "patch"
  // Loop Runner Uncommon
  | "incrementalBlock" | "bufferOverflowProtection" | "asyncDraw"
  // Loop Runner Rare
  | "lrExecute" | "compilerOptimization" | "overclockBurst"
  // Loop Runner Fatal
  | "stackOverflow";

export interface CardDef {
  id: CardId;
  fn: string;
  signature: string;
  description: string;
  rarity: Rarity;
  attributes: CardAttribute[];
}

export const CARDS: Record<CardId, CardDef> = {
  // ─── Legacy cards ───────────────────────────────────────────
  attack: {
    id: "attack", fn: "attack",
    signature: "attack(n)",
    description: "敵に n ダメージ。コスト: n",
    rarity: "starter", attributes: [],
  },
  block: {
    id: "block", fn: "block",
    signature: "block(n)",
    description: "ブロックを n 得る（被ダメ軽減）。コスト: n",
    rarity: "starter", attributes: [],
  },
  heal: {
    id: "heal", fn: "heal",
    signature: "heal(n)",
    description: "自分の HP を n 回復。コスト: n",
    rarity: "starter", attributes: [],
  },
  execute: {
    id: "execute", fn: "execute",
    signature: "execute()",
    description: "敵HP≤12なら即死（ブロック無視）。コスト: 3",
    rarity: "rare", attributes: [],
  },
  vulnerable: {
    id: "vulnerable", fn: "vulnerable",
    signature: "vulnerable()",
    description: "このターン敵の被ダメ+50%。コスト: 2",
    rarity: "uncommon", attributes: [],
  },
  poison: {
    id: "poison", fn: "poison",
    signature: "poison(n)",
    description: "毒 n 付与。毎ターン終了時にダメージ。コスト: n",
    rarity: "common", attributes: [],
  },
  pierce: {
    id: "pierce", fn: "pierce",
    signature: "pierce(n)",
    description: "ブロックを無視して n ダメージ。コスト: n",
    rarity: "common", attributes: [],
  },
  shatter: {
    id: "shatter", fn: "shatter",
    signature: "shatter()",
    description: "敵のブロックを半減にする。コスト: 2",
    rarity: "uncommon", attributes: [],
  },
  drain: {
    id: "drain", fn: "drain",
    signature: "drain(n)",
    description: "n ダメージ＋自分 ceil(n/2) 回復。コスト: n+1",
    rarity: "uncommon", attributes: [],
  },
  nullify: {
    id: "nullify", fn: "nullify",
    signature: "nullify()",
    description: "敵のブロックを 0 にする。コスト: 3",
    rarity: "rare", attributes: [],
  },
  overload: {
    id: "overload", fn: "overload",
    signature: "overload(n)",
    description: "ブロック貫通 n×2 ダメージ（敵は体力を直接失う）。自分も n の体力を失う。コスト: n",
    rarity: "uncommon", attributes: [],
  },
  reboot: {
    id: "reboot", fn: "reboot",
    signature: "reboot()",
    description: "エネルギー +5（上限まで）。1ターン1回のみ。コスト: 0",
    rarity: "uncommon", attributes: ["unique"],
  },
  combo: {
    id: "combo", fn: "combo",
    signature: "combo(n)",
    description: "n×コンボ数 ダメージ（同ターン中に呼ぶたびに倍率↑、ターン終了でリセット）。コスト: n",
    rarity: "common", attributes: [],
  },
  debug: {
    id: "debug", fn: "debug",
    signature: "debug()",
    description: "敵の詳細情報をコンソールに出力。コスト: 0",
    rarity: "common", attributes: [],
  },
  cycler: {
    id: "cycler", fn: "cycler",
    signature: "cycler(n)",
    description: "n枚捨てて n枚ドロー（捨てるカードを選択）。コスト: 0",
    rarity: "uncommon", attributes: ["unique"],
  },

  // ─── Loop Runner Starter ─────────────────────────────────────
  lrAttack: {
    id: "lrAttack", fn: "attack",
    signature: "attack()",
    description: "敵に 3+⌊combo/3⌋ ダメージ。コンボが増えるほど威力UP。コスト: 1",
    rarity: "starter", attributes: [],
  },
  lrBlock: {
    id: "lrBlock", fn: "block",
    signature: "block()",
    description: "ブロック +max(2, 5-⌊combo/2⌋)。コンボが増えるほど効果ダウン。コスト: 1",
    rarity: "starter", attributes: [],
  },
  noop: {
    id: "noop", fn: "noop",
    signature: "noop()",
    description: "何もしない（コンボ +1 のみ）。コスト: 0",
    rarity: "starter", attributes: ["unique"],
  },

  // ─── Loop Runner Common ───────────────────────────────────────
  initialize: {
    id: "initialize", fn: "initialize",
    signature: "initialize()",
    description: "ブロック +3。次ターン開始時エネルギー +1。コスト: 1",
    rarity: "common", attributes: [],
  },
  forceQuit: {
    id: "forceQuit", fn: "forceQuit",
    signature: "forceQuit()",
    description: "敵に 4 ダメージ。実行を終了する。コスト: 1",
    rarity: "common", attributes: [],
  },
  overClock: {
    id: "overClock", fn: "overClock",
    signature: "overClock()",
    description: "自分 HP -2 してエネルギー +1。コスト: 0",
    rarity: "common", attributes: [],
  },
  incrementalAttack: {
    id: "incrementalAttack", fn: "incrementalAttack",
    signature: "incrementalAttack()",
    description: "敵にコンボ数 × 2 ダメージ。コスト: 2",
    rarity: "common", attributes: [],
  },
  patch: {
    id: "patch", fn: "patch",
    signature: "patch()",
    description: "自分 HP +2 回復。使い捨て。コスト: 0",
    rarity: "common", attributes: ["disposable"],
  },

  // ─── Loop Runner Uncommon ─────────────────────────────────────
  incrementalBlock: {
    id: "incrementalBlock", fn: "incrementalBlock",
    signature: "incrementalBlock()",
    description: "ブロック +コンボ数。コスト: 2",
    rarity: "uncommon", attributes: ["unique"],
  },
  bufferOverflowProtection: {
    id: "bufferOverflowProtection", fn: "bufferOverflowProtection",
    signature: "bufferOverflowProtection()",
    description: "手札を 1 枚捨て、ブロック +3。コスト: 1",
    rarity: "uncommon", attributes: [],
  },
  asyncDraw: {
    id: "asyncDraw", fn: "asyncDraw",
    signature: "asyncDraw()",
    description: "カードを 2 枚引く。コスト: 1",
    rarity: "uncommon", attributes: [],
  },

  // ─── Loop Runner Rare ─────────────────────────────────────────
  lrExecute: {
    id: "lrExecute", fn: "execute",
    signature: "execute()",
    description: "敵 HP が コンボ数 × 3 以下なら即死（ブロック無視）。コスト: 3",
    rarity: "rare", attributes: ["unique"],
  },
  compilerOptimization: {
    id: "compilerOptimization", fn: "compilerOptimization",
    signature: "compilerOptimization()",
    description: "カード 3 枚引く。このターン手札の通常カード（属性なし）のコストを 0 にする。コスト: 2",
    rarity: "rare", attributes: ["unique"],
  },
  overclockBurst: {
    id: "overclockBurst", fn: "overclockBurst",
    signature: "overclockBurst()",
    description: "エネルギーを全回復し、コンボ +3 を得る。コスト: 0",
    rarity: "rare", attributes: ["unique"],
  },

  // ─── Loop Runner Fatal（最上位・排出率1%）───────────────────────
  stackOverflow: {
    id: "stackOverflow", fn: "stackOverflow",
    signature: "stackOverflow()",
    description: "自分 HP -3。このターン中コンボ増加が +1 の代わりに +5 になる。コスト: 2",
    rarity: "fatal", attributes: ["unique"],
  },
};

export const HAND_SIZE = 3; // 毎ターン開始時に3枚ドロー（StS方式：山札切れで捨て札シャッフル）

// カードの基礎コスト（動的コストのカードは 0 を返す）。Deploy コスト計算にも使う。
export function getCardBaseCost(id: CardId): number {
  switch (id) {
    // Legacy
    case "attack": return 0; // dynamic
    case "block": return 0;  // dynamic
    case "heal": return 0;   // dynamic
    case "execute": return 3;
    case "vulnerable": return 2;
    case "poison": return 0; // dynamic
    case "pierce": return 0; // dynamic
    case "shatter": return 2;
    case "drain": return 0;  // dynamic
    case "nullify": return 3;
    case "overload": return 0; // dynamic
    case "reboot": return 0;
    case "combo": return 0;  // dynamic
    case "debug": return 0;
    case "cycler": return 0;
    // LR Starter
    case "lrAttack": return 1;
    case "lrBlock": return 1;
    case "noop": return 0;
    // LR Common
    case "initialize": return 1;
    case "forceQuit": return 1;
    case "overClock": return 0;
    case "incrementalAttack": return 2;
    case "patch": return 0;
    // LR Uncommon
    case "incrementalBlock": return 2;
    case "bufferOverflowProtection": return 1;
    case "asyncDraw": return 1;
    // LR Rare
    case "lrExecute": return 3;
    case "compilerOptimization": return 2;
    case "overclockBurst": return 0;
    // LR Fatal
    case "stackOverflow": return 2;
  }
}
