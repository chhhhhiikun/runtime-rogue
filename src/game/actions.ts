import type { CombatState } from "./state";

export type Action =
  // Legacy actions
  | { kind: "attack";    amount: number; cost: number }
  | { kind: "block";     amount: number; cost: number }
  | { kind: "heal";      amount: number; cost: number }
  | { kind: "execute";   cost: number }
  | { kind: "vulnerable"; cost: number }
  | { kind: "poison";    amount: number; cost: number }
  | { kind: "pierce";    amount: number; cost: number }
  | { kind: "shatter";   cost: number }
  | { kind: "drain";     amount: number; cost: number }
  | { kind: "nullify";   cost: number }
  | { kind: "overload";  amount: number; cost: number }
  | { kind: "reboot";    cost: number }
  | { kind: "combo";     n: number; k: number; cost: number }
  // Loop Runner actions
  | { kind: "lrAttack"; cost: number }
  | { kind: "lrBlock"; cost: number }
  | { kind: "quickScan"; cost: number }
  | { kind: "initialize"; cost: number }
  | { kind: "noop"; cost: number }
  | { kind: "shift"; cost: number }
  | { kind: "sleep"; cost: number }
  | { kind: "forceQuit"; cost: number }
  | { kind: "overClock"; cost: number }
  | { kind: "ping"; cost: number; comboCount: number }
  | { kind: "incrementalAttack"; cost: number; comboCount: number }
  | { kind: "refactoring"; cost: number }
  | { kind: "patch"; cost: number }
  | { kind: "incrementalBlock"; cost: number; comboCount: number }
  | { kind: "conditionalBlock"; cost: number; comboCount: number }
  | { kind: "bufferOverflowProtection"; cost: number }
  | { kind: "asyncDraw"; cost: number }
  | { kind: "caching"; cost: number }
  | { kind: "multiThreading"; cost: number }
  | { kind: "garbageCollection"; cost: number }
  | { kind: "recursion"; cost: number }
  | { kind: "asyncAwait"; cost: number }
  | { kind: "stackOverflow"; cost: number }
  | { kind: "lrExecute"; cost: number; comboCount: number }
  | { kind: "compilerOptimization"; cost: number };

function damageEnemy(s: CombatState, raw: number): number {
  let dmg = raw;
  if (s.enemy.block > 0) {
    const absorbed = Math.min(s.enemy.block, dmg);
    s.enemy.block -= absorbed;
    dmg -= absorbed;
  }
  s.enemy.hp = Math.max(0, s.enemy.hp - dmg);
  return dmg;
}

function vulnDmg(s: CombatState, base: number): number {
  return s.enemy.vulnerable > 0 ? Math.floor(base * 1.5) : base;
}

export function applyAction(s: CombatState, a: Action): string {
  s.energy -= a.cost;

  switch (a.kind) {
    case "attack": {
      const raw   = vulnDmg(s, a.amount);
      const dealt = damageEnemy(s, raw);
      return `attack: 敵に ${dealt} ダメージ`;
    }
    case "block": {
      s.player.block += a.amount;
      return `block: ブロック +${a.amount}`;
    }
    case "heal": {
      const before = s.player.hp;
      s.player.hp  = Math.min(s.player.maxHp, s.player.hp + a.amount);
      return `heal: HP +${s.player.hp - before}`;
    }
    case "execute": {
      if (s.enemy.hp <= 12) { s.enemy.hp = 0; return "execute: 処刑成功！"; }
      return "execute: 敵HPが高く不発";
    }
    case "vulnerable": {
      s.enemy.vulnerable = 1;
      return "vulnerable: 敵が脆弱化（被ダメ+50%）";
    }
    case "poison": {
      s.enemy.poison += a.amount;
      return `poison: 毒 +${a.amount}（合計 ${s.enemy.poison}）`;
    }
    case "pierce": {
      const raw   = vulnDmg(s, a.amount);
      s.enemy.hp  = Math.max(0, s.enemy.hp - raw);
      return `pierce: ブロック無視 ${raw} ダメージ`;
    }
    case "shatter": {
      const before    = s.enemy.block;
      s.enemy.block   = Math.floor(before / 2);
      return `shatter: 敵ブロック ${before} → ${s.enemy.block}`;
    }
    case "drain": {
      const raw    = vulnDmg(s, a.amount);
      const dealt  = damageEnemy(s, raw);
      const healed = Math.ceil(a.amount / 2);
      s.player.hp  = Math.min(s.player.maxHp, s.player.hp + healed);
      return `drain: ${dealt} ダメージ + HP +${healed} 回復`;
    }
    case "nullify": {
      const before  = s.enemy.block;
      s.enemy.block = 0;
      return `nullify: 敵ブロック ${before} → 0`;
    }
    case "overload": {
      const raw    = vulnDmg(s, a.amount * 2);
      s.enemy.hp   = Math.max(0, s.enemy.hp - raw);
      s.player.hp  = Math.max(0, s.player.hp - a.amount);
      return `overload: 敵に ${raw} ダメージ（貫通）、自分に ${a.amount} ダメージ`;
    }
    case "reboot": {
      const gained  = Math.min(s.maxEnergy - s.energy, 5);
      s.energy     += gained;
      s.rebootUsedThisTurn = true;
      return `reboot: エネルギー +${gained}`;
    }
    case "combo": {
      s.comboCount++;
      const base  = a.n * a.k;
      const raw   = vulnDmg(s, base);
      const dealt = damageEnemy(s, raw);
      return `combo(${a.n}) × ${a.k}回目 → ${dealt} ダメージ`;
    }

    // ── Loop Runner ──────────────────────────────────────────────
    case "lrAttack": {
      const raw   = vulnDmg(s, 6);
      const dealt = damageEnemy(s, raw);
      return `attack: 敵に ${dealt} ダメージ`;
    }
    case "lrBlock": {
      s.player.block += 5;
      return `block: ブロック +5`;
    }
    case "quickScan": {
      const raw   = vulnDmg(s, 3);
      const dealt = damageEnemy(s, raw);
      return `quickScan: 敵に ${dealt} ダメージ`;
    }
    case "initialize": {
      s.player.block += 3;
      s.nextTurnExtraDraws++;
      s.nextTurnExtraEnergy++;
      return `initialize: ブロック +3、次ターンエネルギー+1・ドロー+1`;
    }
    case "noop": {
      return `noop: 何もしない`;
    }
    case "shift": {
      return `shift: 手札1枚捨て、1枚ドロー`;
    }
    case "sleep": {
      s.player.block += 3;
      s.nextTurnExtraEnergy++;
      return `sleep: ブロック +3、次ターンエネルギー+1`;
    }
    case "forceQuit": {
      const raw   = vulnDmg(s, 4);
      const dealt = damageEnemy(s, raw);
      s.nextTurnExtraDraws += 2;
      return `forceQuit: 敵に ${dealt} ダメージ、次ターンドロー+2`;
    }
    case "overClock": {
      s.player.hp = Math.max(0, s.player.hp - 2);
      s.energy += 1;
      return `overClock: HP -2、エネルギー+1`;
    }
    case "ping": {
      const raw   = vulnDmg(s, a.comboCount);
      const dealt = damageEnemy(s, raw);
      return `ping: 敵に ${dealt} ダメージ（コンボ×1）`;
    }
    case "incrementalAttack": {
      const bonus = a.comboCount % 2 !== 0 ? 4 : 0;
      const raw   = vulnDmg(s, 8 + bonus);
      const dealt = damageEnemy(s, raw);
      return `incrementalAttack: 敵に ${dealt} ダメージ${bonus ? "（奇数コンボ +4）" : ""}`;
    }
    case "refactoring": {
      return `refactoring: 手札の最高コスト2枚のコスト-1`;
    }
    case "patch": {
      s.player.hp = Math.min(s.player.maxHp, s.player.hp + 2);
      return `patch: HP +2 回復`;
    }
    case "incrementalBlock": {
      s.player.block += a.comboCount;
      return `incrementalBlock: ブロック +${a.comboCount}（コンボ数）`;
    }
    case "conditionalBlock": {
      const amount = a.comboCount % 2 === 0 ? 5 : 2;
      s.player.block += amount;
      return `conditionalBlock: ブロック +${amount}`;
    }
    case "bufferOverflowProtection": {
      s.player.block += 3;
      return `bufferOverflowProtection: ブロック +3`;
    }
    case "asyncDraw": {
      return `asyncDraw: カードをドロー`;
    }
    case "caching": {
      return `caching: 最高コストカードを次ターンに持ち越し`;
    }
    case "multiThreading": {
      return `multiThreading: コンボ+3、1枚ドロー`;
    }
    case "garbageCollection": {
      s.energy += 1;
      return `garbageCollection: 捨て札から1枚回収、エネルギー+1`;
    }
    case "recursion": {
      return `recursion: プログラム再実行`;
    }
    case "asyncAwait": {
      s.asyncAwaitActive = true;
      return `asyncAwait: 以降の攻撃にコンボ数分の追加ダメージ`;
    }
    case "stackOverflow": {
      s.player.hp = Math.max(0, s.player.hp - 5);
      s.comboIncrement = 3;
      return `stackOverflow: HP -5、コンボ増加が×3に`;
    }
    case "lrExecute": {
      if (s.enemy.hp <= a.comboCount * 3) {
        s.enemy.hp = 0;
        return `execute: 処刑成功！（敵HP ≤ コンボ×3）`;
      }
      return `execute: 敵HPが高く不発（コンボ×3 = ${a.comboCount * 3}）`;
    }
    case "compilerOptimization": {
      return `compilerOptimization: 3枚ドロー、通常カードのコスト0`;
    }
  }
}
