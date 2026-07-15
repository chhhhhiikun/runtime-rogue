import type { CardId } from "./cards";

export interface CharacterDef {
  id: string;
  name: string;
  emoji: string;
  hp: number;
  starterDeck: CardId[];
  cardPool: { common: CardId[]; uncommon: CardId[]; rare: CardId[]; fatal: CardId[] };
  concept: string;
  available: boolean;
}

export const CHARACTERS: CharacterDef[] = [
  {
    id: "loopRunner",
    name: "Loop Runner",
    emoji: "🏃",
    hp: 35,
    starterDeck: ["lrAttack", "lrBlock", "noop"],
    cardPool: {
      common: ["initialize", "forceQuit", "overClock", "incrementalAttack", "patch"],
      uncommon: ["incrementalBlock", "bufferOverflowProtection", "asyncDraw"],
      rare: ["lrExecute", "stackOverflow", "overclockBurst"],
      fatal: ["compilerOptimization"],
    },
    concept: "低コストカードをループで連打し、コンボ数を稼いで爆発力を出す。",
    available: true,
  },
  {
    id: "objectBreaker",
    name: "Object Breaker",
    emoji: "💾",
    hp: 55,
    starterDeck: ["obAttack", "obBlock", "charge"],
    cardPool: {
      common: ["store", "release", "compact", "defrag", "fortify"],
      uncommon: ["double", "overcharge", "siphon"],
      rare: ["surge", "bigRelease", "ironWall"],
      fatal: ["singularity"],
    },
    concept: "変数に数値を蓄積・倍化させ、最後に一撃で解放する重戦車。",
    available: true,
  },
  {
    id: "bugInjector",
    name: "Bug Injector",
    emoji: "👾",
    hp: 45,
    starterDeck: ["biAttack", "biBlock", "debug"],
    cardPool: {
      common: ["throwTypeError", "throwRangeError", "throwSyntaxError", "hotfix", "firewall"],
      uncommon: ["stackTrace", "raiseException", "errorBoundary"],
      rare: ["coreDump", "edgeCase", "hotReload"],
      fatal: ["segmentationFault"],
    },
    concept: "敵の内部情報をdebug()で解析し、弱点のエラーを的確に叩き込む調査型。",
    available: true,
  },
  {
    id: "rngCracker",
    name: "RNG Cracker",
    emoji: "🎲",
    hp: 40,
    starterDeck: [],
    cardPool: { common: [], uncommon: [], rare: [], fatal: [] },
    concept: "Math.random() によるギャンブルカードを確率ハック関数で制御する。",
    available: false,
  },
];

export function getCharacter(id: string): CharacterDef {
  return CHARACTERS.find(c => c.id === id) ?? CHARACTERS[0];
}

export function getAllCharacterCards(char: CharacterDef): CardId[] {
  return [...char.starterDeck, ...char.cardPool.common, ...char.cardPool.uncommon, ...char.cardPool.rare, ...char.cardPool.fatal];
}
