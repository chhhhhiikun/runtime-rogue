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
  | "stackOverflow"
  // Object Breaker Starter
  | "obAttack" | "obBlock" | "charge"
  // Object Breaker Common
  | "store" | "release" | "compact" | "defrag" | "fortify"
  // Object Breaker Uncommon
  | "double" | "overcharge" | "siphon"
  // Object Breaker Rare
  | "surge" | "bigRelease" | "ironWall"
  // Object Breaker Fatal
  | "singularity"
  // Bug Injector Starter
  | "biAttack" | "biBlock"
  // Bug Injector Common
  | "throwTypeError" | "throwRangeError" | "throwSyntaxError" | "hotfix" | "firewall"
  // Bug Injector Uncommon
  | "stackTrace" | "raiseException" | "errorBoundary"
  // Bug Injector Rare
  | "coreDump" | "edgeCase" | "hotReload"
  // Bug Injector Fatal
  | "segmentationFault"
  // RNG Cracker Starter
  | "rcAttack" | "rcBlock" | "skipRoll"
  // RNG Cracker Common
  | "doubleDown" | "riskyGuard" | "insurance" | "retryRoll" | "oddsBoost"
  // RNG Cracker Uncommon
  | "forceSeed" | "chainRoll" | "fortifyBet"
  // RNG Cracker Rare
  | "jackpot" | "seedLock" | "martingale"
  // RNG Cracker Fatal
  | "allIn"
  // チュートリアル専用（数値固定・コンボ計算なし。本編の報酬プールには含めない）
  | "tutorialAttack" | "tutorialBlock" | "tutorialBurst" | "tutorialRecover";

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
    description: "敵のエラーログ（30件の配列）を取得する。コスト: 1",
    rarity: "starter", attributes: ["unique"],
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
    description: "敵に 3+min(3,⌊combo/4⌋) ダメージ（最大6）。コスト: 1",
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
  stackOverflow: {
    id: "stackOverflow", fn: "stackOverflow",
    signature: "stackOverflow()",
    description: "自分 HP -3。このターン中コンボ増加が +1 の代わりに +5 になる。コスト: 2",
    rarity: "rare", attributes: ["unique"],
  },
  overclockBurst: {
    id: "overclockBurst", fn: "overclockBurst",
    signature: "overclockBurst()",
    description: "エネルギーを全回復し、コンボ +3 を得る。コスト: 0",
    rarity: "rare", attributes: ["unique"],
  },

  // ─── Loop Runner Fatal（最上位・排出率1%）───────────────────────
  compilerOptimization: {
    id: "compilerOptimization", fn: "compilerOptimization",
    signature: "compilerOptimization()",
    description: "カード 3 枚引く。このターン手札の通常カード（属性なし）のコストを 0 にする。コスト: 2",
    rarity: "fatal", attributes: ["unique"],
  },

  // ─── Object Breaker Starter ───────────────────────────────────
  obAttack: {
    id: "obAttack", fn: "attack",
    signature: "attack()",
    description: "敵に 5 ダメージ。コスト: 2",
    rarity: "starter", attributes: [],
  },
  obBlock: {
    id: "obBlock", fn: "block",
    signature: "block()",
    description: "ブロック +6。コスト: 2",
    rarity: "starter", attributes: [],
  },
  charge: {
    id: "charge", fn: "charge",
    signature: "charge()",
    description: "変数に +2 を格納する。コスト: 0",
    rarity: "starter", attributes: ["unique"],
  },

  // ─── Object Breaker Common ─────────────────────────────────────
  store: {
    id: "store", fn: "store",
    signature: "store()",
    description: "変数に +4 を格納する。コスト: 2",
    rarity: "common", attributes: [],
  },
  release: {
    id: "release", fn: "release",
    signature: "release()",
    description: "変数の値だけ敵にダメージを与え、変数を 0 にする。コスト: 1",
    rarity: "common", attributes: [],
  },
  compact: {
    id: "compact", fn: "compact",
    signature: "compact()",
    description: "変数を半分にし、減った分だけ即座に敵にダメージ。コスト: 1",
    rarity: "common", attributes: [],
  },
  defrag: {
    id: "defrag", fn: "defrag",
    signature: "defrag()",
    description: "自分 HP +3 回復。使い捨て。コスト: 0",
    rarity: "common", attributes: ["disposable"],
  },
  fortify: {
    id: "fortify", fn: "fortify",
    signature: "fortify()",
    description: "ブロック += max(2, ⌊変数/5⌋)。コスト: 1",
    rarity: "common", attributes: [],
  },

  // ─── Object Breaker Uncommon ───────────────────────────────────
  double: {
    id: "double", fn: "double",
    signature: "double()",
    description: "変数を 2 倍にする。コスト: 3",
    rarity: "uncommon", attributes: ["unique"],
  },
  overcharge: {
    id: "overcharge", fn: "overcharge",
    signature: "overcharge()",
    description: "変数に +8 を格納する。自分に 2 ダメージ。コスト: 2",
    rarity: "uncommon", attributes: [],
  },
  siphon: {
    id: "siphon", fn: "siphon",
    signature: "siphon()",
    description: "変数から 5 を消費し、自分 HP をその分回復。コスト: 0",
    rarity: "uncommon", attributes: [],
  },

  // ─── Object Breaker Rare ───────────────────────────────────────
  surge: {
    id: "surge", fn: "surge",
    signature: "surge()",
    description: "変数を 1.5 倍にする（切り捨て）。コスト: 2",
    rarity: "rare", attributes: ["unique"],
  },
  bigRelease: {
    id: "bigRelease", fn: "bigRelease",
    signature: "bigRelease()",
    description: "変数の 1.5 倍だけ敵にダメージを与え、変数を 0 にする。コスト: 4",
    rarity: "rare", attributes: ["unique"],
  },
  ironWall: {
    id: "ironWall", fn: "ironWall",
    signature: "ironWall()",
    description: "ブロック +14。コスト: 3",
    rarity: "rare", attributes: ["unique"],
  },

  // ─── Object Breaker Fatal（最上位・排出率1%）───────────────────
  singularity: {
    id: "singularity", fn: "singularity",
    signature: "singularity()",
    description: "変数を 3 倍にし、さらに +10 する。コスト: 3",
    rarity: "fatal", attributes: ["unique"],
  },

  // ─── Bug Injector Starter ──────────────────────────────────────
  biAttack: {
    id: "biAttack", fn: "attack",
    signature: "attack()",
    description: "敵に 5 ダメージ。コスト: 2",
    rarity: "starter", attributes: [],
  },
  biBlock: {
    id: "biBlock", fn: "block",
    signature: "block()",
    description: "ブロック +6。コスト: 2",
    rarity: "starter", attributes: [],
  },

  // ─── Bug Injector Common ────────────────────────────────────────
  throwTypeError: {
    id: "throwTypeError", fn: "throwTypeError",
    signature: "throwTypeError()",
    description: "弱点(最多)がTypeErrorなら敵に12ダメージ、それ以外は5ダメージ。コスト: 2",
    rarity: "common", attributes: [],
  },
  throwRangeError: {
    id: "throwRangeError", fn: "throwRangeError",
    signature: "throwRangeError()",
    description: "弱点(最多)がRangeErrorなら敵に12ダメージ、それ以外は5ダメージ。コスト: 2",
    rarity: "common", attributes: [],
  },
  throwSyntaxError: {
    id: "throwSyntaxError", fn: "throwSyntaxError",
    signature: "throwSyntaxError()",
    description: "弱点(最多)がSyntaxErrorなら敵に12ダメージ、それ以外は5ダメージ。コスト: 2",
    rarity: "common", attributes: [],
  },
  hotfix: {
    id: "hotfix", fn: "hotfix",
    signature: "hotfix()",
    description: "自分 HP +3 回復。使い捨て。コスト: 0",
    rarity: "common", attributes: ["disposable"],
  },
  firewall: {
    id: "firewall", fn: "firewall",
    signature: "firewall()",
    description: "ブロック +9。コスト: 2",
    rarity: "common", attributes: [],
  },

  // ─── Bug Injector Uncommon ──────────────────────────────────────
  stackTrace: {
    id: "stackTrace", fn: "stackTrace",
    signature: "stackTrace()",
    description: "カードを2枚引く。コスト: 1",
    rarity: "uncommon", attributes: [],
  },
  raiseException: {
    id: "raiseException", fn: "raiseException",
    signature: "raiseException(\"${1:TypeError}\")",
    description: "引数が弱点(最多)と一致なら敵に21ダメージ、不一致なら8ダメージ。コスト: 3",
    rarity: "uncommon", attributes: ["unique"],
  },
  errorBoundary: {
    id: "errorBoundary", fn: "errorBoundary",
    signature: "errorBoundary(\"${1:TypeError}\")",
    description: "引数が弱点(最多)と一致ならブロック+16、不一致なら+8。コスト: 3",
    rarity: "uncommon", attributes: ["unique"],
  },

  // ─── Bug Injector Rare ───────────────────────────────────────────
  coreDump: {
    id: "coreDump", fn: "coreDump",
    signature: "coreDump(\"${1:TypeError}\")",
    description: "引数が弱点(最多)と一致なら敵に36ダメージ、不一致なら10ダメージ。コスト: 4",
    rarity: "rare", attributes: ["unique"],
  },
  edgeCase: {
    id: "edgeCase", fn: "edgeCase",
    signature: "edgeCase(\"${1:TypeError}\")",
    description: "引数が最少属性と一致なら敵に40ダメージ、不一致なら10ダメージ。コスト: 4",
    rarity: "rare", attributes: ["unique"],
  },
  hotReload: {
    id: "hotReload", fn: "hotReload",
    signature: "hotReload()",
    description: "カードを3枚引き、このターンの手札コストを-1（最低0）。コスト: 2",
    rarity: "rare", attributes: ["unique"],
  },

  // ─── Bug Injector Fatal（最上位・排出率1%）───────────────────────
  segmentationFault: {
    id: "segmentationFault", fn: "segmentationFault",
    signature: "segmentationFault(\"${1:TypeError}\")",
    description: "引数が弱点(最多)と一致なら敵に50ダメージ（ブロック無視）、不一致なら16ダメージ（ブロック無視）。コスト: 4",
    rarity: "fatal", attributes: ["unique"],
  },

  // ─── RNG Cracker Starter ────────────────────────────────────────
  rcAttack: {
    id: "rcAttack", fn: "attack",
    signature: "attack()",
    description: "50%で敵に8ダメージ、50%で2ダメージ（平均5）。コスト: 2",
    rarity: "starter", attributes: [],
  },
  rcBlock: {
    id: "rcBlock", fn: "block",
    signature: "block()",
    description: "50%でブロック+9、50%で+3（平均6）。コスト: 2",
    rarity: "starter", attributes: [],
  },
  skipRoll: {
    id: "skipRoll", fn: "skipRoll",
    signature: "skipRoll()",
    description: "内部seedを1つ空費して進める（効果なし）。コスト: 1",
    rarity: "starter", attributes: [],
  },

  // ─── RNG Cracker Common ──────────────────────────────────────────
  doubleDown: {
    id: "doubleDown", fn: "doubleDown",
    signature: "doubleDown()",
    description: "40%で敵に18ダメージ、60%で4ダメージ。コスト: 3",
    rarity: "common", attributes: [],
  },
  riskyGuard: {
    id: "riskyGuard", fn: "riskyGuard",
    signature: "riskyGuard()",
    description: "40%でブロック+20、60%で+5。コスト: 3",
    rarity: "common", attributes: [],
  },
  insurance: {
    id: "insurance", fn: "insurance",
    signature: "insurance()",
    description: "次に使うギャンブル系カードが外れた時のペナルティを1回分軽減する。コスト: 1",
    rarity: "common", attributes: [],
  },
  retryRoll: {
    id: "retryRoll", fn: "retryRoll",
    signature: "retryRoll()",
    description: "直前のギャンブル系カードの結果を無効化し、次のseedで撃ち直す。コスト: 1",
    rarity: "common", attributes: [],
  },
  oddsBoost: {
    id: "oddsBoost", fn: "oddsBoost",
    signature: "oddsBoost()",
    description: "次の1回だけ、ギャンブル系カードの成功ラインを+20%有利にする。コスト: 2",
    rarity: "common", attributes: [],
  },

  // ─── RNG Cracker Uncommon ─────────────────────────────────────────
  forceSeed: {
    id: "forceSeed", fn: "forceSeed",
    signature: "forceSeed(${1:n})",
    description: "内部seedを指定した値に上書きする（次の出目を完全にコントロール）。コスト: 4",
    rarity: "uncommon", attributes: [],
  },
  chainRoll: {
    id: "chainRoll", fn: "chainRoll",
    signature: "chainRoll()",
    description: "seedを2つ連続消費。両方成功なら敵に28ダメージ、いずれか失敗なら8ダメージ。コスト: 3",
    rarity: "uncommon", attributes: [],
  },
  fortifyBet: {
    id: "fortifyBet", fn: "fortifyBet",
    signature: "fortifyBet()",
    description: "seedを2つ連続消費。両方成功ならブロック+32、いずれか失敗なら+10。コスト: 3",
    rarity: "uncommon", attributes: [],
  },

  // ─── RNG Cracker Rare ─────────────────────────────────────────────
  jackpot: {
    id: "jackpot", fn: "jackpot",
    signature: "jackpot()",
    description: "25%で敵に50ダメージ、外れなら自分に4ダメージ。コスト: 4",
    rarity: "rare", attributes: [],
  },
  seedLock: {
    id: "seedLock", fn: "seedLock",
    signature: "seedLock()",
    description: "3ターンの間、敵によるseed干渉ギミックを無効化する。コスト: 3",
    rarity: "rare", attributes: [],
  },
  martingale: {
    id: "martingale", fn: "martingale",
    signature: "martingale()",
    description: "基礎12ダメージに、直前から連続で外れたギャンブル系カードの回数×6ダメージを加算する。コスト: 3",
    rarity: "rare", attributes: [],
  },

  // ─── RNG Cracker Fatal（最上位・排出率1%）─────────────────────────
  allIn: {
    id: "allIn", fn: "allIn",
    signature: "allIn()",
    description: "残りMain Clockを全て消費する。30%でその7倍のダメージ、外れなら効果なし。コスト: 0（動的）",
    rarity: "fatal", attributes: [],
  },

  // ─── チュートリアル専用（コンボ計算なしの固定値） ───────────────
  tutorialAttack: {
    id: "tutorialAttack", fn: "attack",
    signature: "attack()",
    description: "敵に 4 ダメージ。コスト: 1",
    rarity: "starter", attributes: [],
  },
  tutorialBlock: {
    id: "tutorialBlock", fn: "block",
    signature: "block()",
    description: "ブロック +4。コスト: 1",
    rarity: "starter", attributes: [],
  },
  tutorialBurst: {
    id: "tutorialBurst", fn: "burst",
    signature: "burst()",
    description: "敵に 10 ダメージ。1ターンに1回だけ。コスト: 2",
    rarity: "starter", attributes: ["unique"],
  },
  tutorialRecover: {
    id: "tutorialRecover", fn: "recover",
    signature: "recover()",
    description: "自分 HP +8 回復。使い捨て。コスト: 0",
    rarity: "starter", attributes: ["disposable"],
  },
};

export const HAND_SIZE = 3; // 毎ターン開始時に3枚ドロー（山札切れで捨て札シャッフル）

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
    case "debug": return 1;
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
    // OB Starter
    case "obAttack": return 2;
    case "obBlock": return 2;
    case "charge": return 0;
    // OB Common
    case "store": return 2;
    case "release": return 1;
    case "compact": return 1;
    case "defrag": return 0;
    case "fortify": return 1;
    // OB Uncommon
    case "double": return 3;
    case "overcharge": return 2;
    case "siphon": return 0;
    // OB Rare
    case "surge": return 2;
    case "bigRelease": return 4;
    case "ironWall": return 3;
    // OB Fatal
    case "singularity": return 3;
    // BI Starter
    case "biAttack": return 2;
    case "biBlock": return 2;
    // debug は既存Legacyケース（0）を流用
    // BI Common
    case "throwTypeError": return 2;
    case "throwRangeError": return 2;
    case "throwSyntaxError": return 2;
    case "hotfix": return 0;
    case "firewall": return 2;
    // BI Uncommon
    case "stackTrace": return 1;
    case "raiseException": return 3;
    case "errorBoundary": return 3;
    // BI Rare
    case "coreDump": return 4;
    case "edgeCase": return 4;
    case "hotReload": return 2;
    // BI Fatal
    case "segmentationFault": return 4;
    // RC Starter
    case "rcAttack": return 2;
    case "rcBlock": return 2;
    case "skipRoll": return 1;
    // RC Common
    case "doubleDown": return 3;
    case "riskyGuard": return 3;
    case "insurance": return 1;
    case "retryRoll": return 1;
    case "oddsBoost": return 2;
    // RC Uncommon
    case "forceSeed": return 4;
    case "chainRoll": return 3;
    case "fortifyBet": return 3;
    // RC Rare
    case "jackpot": return 4;
    case "seedLock": return 3;
    case "martingale": return 3;
    // RC Fatal（動的コスト。実際の消費量はworker.ts側で残りMain Clock全消費として処理）
    case "allIn": return 0;
    // チュートリアル専用
    case "tutorialAttack": return 1;
    case "tutorialBlock": return 1;
    case "tutorialBurst": return 2;
    case "tutorialRecover": return 0;
  }
}

// パッケージマネージャ「リファクタリング」で強化された後に表示する説明文。
// 変わった数値・文字は <span class="upgraded-value"> で囲み、UI側で強調表示する。
// 対象はスターター・Common・Uncommon・Rare（Fatalは対象外。worker.ts/actions.tsのisUpgraded()判定と対応）。
export const CARD_UPGRADE_DESCRIPTIONS: Partial<Record<CardId, string>> = {
  // Loop Runner
  lrAttack: "敵に <span class=\"upgraded-value\">4</span>+min(3,⌊combo/4⌋) ダメージ（最大<span class=\"upgraded-value\">7</span>）。コスト: 1",
  lrBlock: "ブロック +max(<span class=\"upgraded-value\">3</span>, <span class=\"upgraded-value\">6</span>-⌊combo/2⌋)。コンボが増えるほど効果ダウン。コスト: 1",
  noop: "コンボ +1、さらに<span class=\"upgraded-value\">カードを1枚ドロー</span>。コスト: 0",
  initialize: "ブロック +3。次ターン開始時エネルギー +1。コスト: <span class=\"upgraded-value\">0</span>",
  forceQuit: "敵に <span class=\"upgraded-value\">6</span> ダメージ。実行を終了する。コスト: 1",
  overClock: "自分 HP -2 してエネルギー +<span class=\"upgraded-value\">2</span>。コスト: 0",
  incrementalAttack: "敵にコンボ数 × 2 ダメージ。コスト: <span class=\"upgraded-value\">1</span>",
  patch: "自分 HP +<span class=\"upgraded-value\">4</span> 回復。使い捨て。コスト: 0",
  // Object Breaker
  obAttack: "敵に <span class=\"upgraded-value\">7</span> ダメージ。コスト: 2",
  obBlock: "ブロック +<span class=\"upgraded-value\">8</span>。コスト: 2",
  charge: "変数に +<span class=\"upgraded-value\">4</span> を格納する。コスト: 0",
  store: "変数に +4 を格納する。コスト: <span class=\"upgraded-value\">1</span>",
  release: "変数の値だけ敵にダメージを与え、変数を 0 にする。コスト: <span class=\"upgraded-value\">0</span>",
  compact: "変数を半分にし、減った分だけ即座に敵にダメージ。コスト: <span class=\"upgraded-value\">0</span>",
  defrag: "自分 HP +<span class=\"upgraded-value\">6</span> 回復。使い捨て。コスト: 0",
  fortify: "ブロック += max(2, ⌊変数/5⌋)。コスト: <span class=\"upgraded-value\">0</span>",
  // Bug Injector
  biAttack: "敵に <span class=\"upgraded-value\">7</span> ダメージ。コスト: 2",
  biBlock: "ブロック +<span class=\"upgraded-value\">8</span>。コスト: 2",
  debug: "敵のエラーログ（30件の配列）を取得する。コスト: <span class=\"upgraded-value\">0</span>",
  throwTypeError: "弱点(最多)がTypeErrorなら敵に<span class=\"upgraded-value\">16</span>ダメージ、それ以外は<span class=\"upgraded-value\">6</span>ダメージ。コスト: 2",
  throwRangeError: "弱点(最多)がRangeErrorなら敵に<span class=\"upgraded-value\">16</span>ダメージ、それ以外は<span class=\"upgraded-value\">6</span>ダメージ。コスト: 2",
  throwSyntaxError: "弱点(最多)がSyntaxErrorなら敵に<span class=\"upgraded-value\">16</span>ダメージ、それ以外は<span class=\"upgraded-value\">6</span>ダメージ。コスト: 2",
  hotfix: "自分 HP +<span class=\"upgraded-value\">6</span> 回復。使い捨て。コスト: 0",
  firewall: "ブロック +<span class=\"upgraded-value\">12</span>。コスト: 2",
  // RNG Cracker
  rcAttack: "50%で敵に<span class=\"upgraded-value\">10</span>ダメージ、50%で<span class=\"upgraded-value\">4</span>ダメージ（平均<span class=\"upgraded-value\">7</span>）。コスト: 2",
  rcBlock: "50%でブロック+<span class=\"upgraded-value\">11</span>、50%で+<span class=\"upgraded-value\">5</span>（平均<span class=\"upgraded-value\">8</span>）。コスト: 2",
  skipRoll: "内部seedを<span class=\"upgraded-value\">2つ</span>空費して進める（効果なし）。コスト: 1",
  doubleDown: "40%で敵に<span class=\"upgraded-value\">22</span>ダメージ、60%で<span class=\"upgraded-value\">8</span>ダメージ。コスト: 3",
  riskyGuard: "40%でブロック+<span class=\"upgraded-value\">24</span>、60%で+<span class=\"upgraded-value\">9</span>。コスト: 3",
  insurance: "次に使うギャンブル系カードが外れた時のペナルティを1回分軽減する。コスト: <span class=\"upgraded-value\">0</span>",
  retryRoll: "直前のギャンブル系カードの結果を無効化し、次のseedで撃ち直す。コスト: <span class=\"upgraded-value\">0</span>",
  oddsBoost: "次の1回だけ、ギャンブル系カードの成功ラインを+<span class=\"upgraded-value\">30%</span>有利にする。コスト: 2",
  // Loop Runner Uncommon/Rare
  incrementalBlock: "ブロック +コンボ数。コスト: <span class=\"upgraded-value\">1</span>",
  bufferOverflowProtection: "手札を 1 枚捨て、ブロック +<span class=\"upgraded-value\">4</span>。コスト: 1",
  asyncDraw: "カードを 2 枚引く。コスト: <span class=\"upgraded-value\">0</span>",
  lrExecute: "敵 HP が コンボ数 × <span class=\"upgraded-value\">4</span> 以下なら即死（ブロック無視）。コスト: 3",
  stackOverflow: "自分 HP -3。このターン中コンボ増加が +1 の代わりに +5 になる。コスト: <span class=\"upgraded-value\">1</span>",
  overclockBurst: "エネルギーを全回復し、コンボ +<span class=\"upgraded-value\">4</span> を得る。コスト: 0",
  // Object Breaker Uncommon/Rare
  double: "変数を 2 倍にする。コスト: <span class=\"upgraded-value\">2</span>",
  overcharge: "変数に +<span class=\"upgraded-value\">10</span> を格納する。自分に 2 ダメージ。コスト: 2",
  siphon: "変数から <span class=\"upgraded-value\">6</span> を消費し、自分 HP をその分回復。コスト: 0",
  surge: "変数を 1.5 倍にする（切り捨て）。コスト: <span class=\"upgraded-value\">1</span>",
  bigRelease: "変数の 1.5 倍だけ敵にダメージを与え、変数を 0 にする。コスト: <span class=\"upgraded-value\">3</span>",
  ironWall: "ブロック +<span class=\"upgraded-value\">18</span>。コスト: 3",
  // Bug Injector Uncommon/Rare
  stackTrace: "カードを2枚引く。コスト: <span class=\"upgraded-value\">0</span>",
  raiseException: "引数が弱点(最多)と一致なら敵に<span class=\"upgraded-value\">26</span>ダメージ、不一致なら<span class=\"upgraded-value\">10</span>ダメージ。コスト: 3",
  errorBoundary: "引数が弱点(最多)と一致ならブロック+<span class=\"upgraded-value\">20</span>、不一致なら+<span class=\"upgraded-value\">10</span>。コスト: 3",
  coreDump: "引数が弱点(最多)と一致なら敵に<span class=\"upgraded-value\">45</span>ダメージ、不一致なら<span class=\"upgraded-value\">13</span>ダメージ。コスト: 4",
  edgeCase: "引数が最少属性と一致なら敵に<span class=\"upgraded-value\">50</span>ダメージ、不一致なら<span class=\"upgraded-value\">13</span>ダメージ。コスト: 4",
  hotReload: "カードを3枚引き、このターンの手札コストを-1（最低0）。コスト: <span class=\"upgraded-value\">1</span>",
  // RNG Cracker Uncommon/Rare
  forceSeed: "内部seedを指定した値に上書きする（次の出目を完全にコントロール）。コスト: <span class=\"upgraded-value\">3</span>",
  chainRoll: "seedを2つ連続消費。両方成功なら敵に<span class=\"upgraded-value\">35</span>ダメージ、いずれか失敗なら<span class=\"upgraded-value\">10</span>ダメージ。コスト: 3",
  fortifyBet: "seedを2つ連続消費。両方成功ならブロック+<span class=\"upgraded-value\">40</span>、いずれか失敗なら+<span class=\"upgraded-value\">13</span>。コスト: 3",
  jackpot: "25%で敵に50ダメージ、外れなら自分に4ダメージ。コスト: <span class=\"upgraded-value\">3</span>",
  seedLock: "<span class=\"upgraded-value\">4</span>ターンの間、敵によるseed干渉ギミックを無効化する。コスト: 3",
  martingale: "基礎<span class=\"upgraded-value\">15</span>ダメージに、直前から連続で外れたギャンブル系カードの回数×<span class=\"upgraded-value\">7</span>ダメージを加算する。コスト: 3",
};
