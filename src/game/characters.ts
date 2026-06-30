import type { CardId } from "./cards";

export interface CharacterDef {
  id: string;
  name: string;
  emoji: string;
  hp: number;
  starterDeck: CardId[];
  cardPool: { common: CardId[]; uncommon: CardId[]; rare: CardId[] };
  concept: string;
  available: boolean;
}

export const CHARACTERS: CharacterDef[] = [
  {
    id: "loopRunner",
    name: "Loop Runner",
    emoji: "🏃",
    hp: 35,
    starterDeck: ["lrAttack", "lrBlock", "quickScan"],
    cardPool: {
      common: ["initialize", "noop", "shift", "sleep", "forceQuit", "overClock", "ping", "incrementalAttack", "refactoring", "patch"],
      uncommon: ["incrementalBlock", "conditionalBlock", "bufferOverflowProtection", "asyncDraw", "caching", "multiThreading", "garbageCollection"],
      rare: ["recursion", "asyncAwait", "stackOverflow", "lrExecute", "compilerOptimization"],
    },
    concept: "低コストカードをループで連打し、コンボ数を稼いで爆発力を出す。",
    available: true,
  },
  {
    id: "objectBreaker",
    name: "Object Breaker",
    emoji: "💾",
    hp: 55,
    starterDeck: [],
    cardPool: { common: [], uncommon: [], rare: [] },
    concept: "変数に数値を蓄積・倍化させ、最後に一撃で解放する重戦車。",
    available: false,
  },
  {
    id: "bugInjector",
    name: "Bug Injector",
    emoji: "👾",
    hp: 45,
    starterDeck: [],
    cardPool: { common: [], uncommon: [], rare: [] },
    concept: "持続ダメージを植え付け、強固な防御で耐えながら敵を自滅させる。",
    available: false,
  },
  {
    id: "rngCracker",
    name: "RNG Cracker",
    emoji: "🎲",
    hp: 40,
    starterDeck: [],
    cardPool: { common: [], uncommon: [], rare: [] },
    concept: "Math.random() によるギャンブルカードを確率ハック関数で制御する。",
    available: false,
  },
];

export function getCharacter(id: string): CharacterDef {
  return CHARACTERS.find(c => c.id === id) ?? CHARACTERS[0];
}

export function getAllCharacterCards(char: CharacterDef): CardId[] {
  return [...char.starterDeck, ...char.cardPool.common, ...char.cardPool.uncommon, ...char.cardPool.rare];
}
