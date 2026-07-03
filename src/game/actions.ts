import type { CombatState, EnemyIntent } from "./state";

export type ActionCore =
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
  | { kind: "lrAttack"; cost: number; comboCount: number }
  | { kind: "lrBlock"; cost: number; comboCount: number }
  | { kind: "initialize"; cost: number }
  | { kind: "noop"; cost: number }
  | { kind: "forceQuit"; cost: number }
  | { kind: "overClock"; cost: number }
  | { kind: "incrementalAttack"; cost: number; comboCount: number }
  | { kind: "patch"; cost: number }
  | { kind: "incrementalBlock"; cost: number; comboCount: number }
  | { kind: "bufferOverflowProtection"; cost: number }
  | { kind: "asyncDraw"; cost: number }
  | { kind: "stackOverflow"; cost: number }
  | { kind: "lrExecute"; cost: number; comboCount: number }
  | { kind: "compilerOptimization"; cost: number }
  | { kind: "overclockBurst"; cost: number }
  // 敵ギミックによるプレイヤーへの即時ダメージ（竜騎士「見切りの一撃」等。コストは発生しない）
  | { kind: "gimmickDamage"; amount: number; label: string }
  // 敵ギミックによる敵への即時ブロック付与（サイクロプス「単眼看破」等。コストは発生しない）
  | { kind: "gimmickBlock"; amount: number; label: string }
  // ターン境界（敵ターン処理）
  | { kind: "enemyTurn"; intent: EnemyIntent; nextIntent: EnemyIntent; label: string; poisonDmg: number };

// viaDaemon: Daemon による自動実行由来のアクションかどうか（ログ表示・アニメーション分岐用）
export type Action = ActionCore & { viaDaemon?: boolean };

function damageEnemy(s: CombatState, raw: number): number {
  let dmg = raw;
  if (s.enemy.block > 0) {
    const absorbed = Math.min(s.enemy.block, dmg);
    s.enemy.block -= absorbed;
    dmg -= absorbed;
  }
  s.enemy.hp = Math.max(0, s.enemy.hp - dmg);
  s.damageDealtThisTurn += dmg;
  return dmg;
}

function vulnDmg(s: CombatState, base: number): number {
  return s.enemy.vulnerable > 0 ? Math.floor(base * 1.5) : base;
}

export function applyAction(
  s: CombatState,
  a: Action,
  costSource: "energy" | "daemon" = "energy",
): string {
  // enemyTurn はエネルギーを消費しない（ターン境界処理）
  if (a.kind === "enemyTurn") {
    if (a.poisonDmg > 0) {
      s.enemy.hp = Math.max(0, s.enemy.hp - a.poisonDmg);
    }
    s.enemy.vulnerable = 0;
    if (a.intent.kind === "block") {
      s.enemy.block += a.intent.value;
    } else {
      let dmg = a.intent.value;
      if (!a.intent.ignoresBlock && s.player.block > 0) {
        const absorbed = Math.min(s.player.block, dmg);
        s.player.block -= absorbed;
        dmg -= absorbed;
      }
      s.player.hp = Math.max(0, s.player.hp - dmg);
    }
    s.player.block       = 0;
    s.energy             = s.maxEnergy + s.nextTurnExtraEnergy;
    s.nextTurnExtraEnergy = 0;
    s.comboCount         = 0;
    s.comboIncrement     = 1;
    s.asyncAwaitActive   = false;
    s.rebootUsedThisTurn = false;
    s.uniqueUsedThisTurn = [];
    s.costZeroCardIds    = [];
    s.costReductionMap   = {};
    s.daemonCost         = s.maxDaemonCost;
    s.damageDealtThisTurn = 0;
    s.sameActionKind      = null;
    s.sameActionStreak    = 0;
    s.maxSingleHitThisTurn = 0;
    s.turn++;
    s.enemy.intent = { ...a.nextIntent };
    return a.label;
  }

  // gimmickDamage はコストを消費しない、敵ギミックによるプレイヤーへの直接ダメージ
  if (a.kind === "gimmickDamage") {
    let dmg = a.amount;
    if (s.player.block > 0) {
      const absorbed = Math.min(s.player.block, dmg);
      s.player.block -= absorbed;
      dmg -= absorbed;
    }
    s.player.hp = Math.max(0, s.player.hp - dmg);
    return a.label;
  }

  // gimmickBlock はコストを消費しない、敵ギミックによる敵への直接ブロック付与
  if (a.kind === "gimmickBlock") {
    s.enemy.block += a.amount;
    return a.label;
  }

  if (costSource === "daemon") {
    s.daemonCost -= a.cost;
  } else {
    s.energy -= a.cost;
  }

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
      // combo火力にキャップ(+3)を設け、単純連打による青天井の火力インフレを抑える。
      // 爆発力は incrementalAttack() など専用カードで出す設計。
      const dmg  = 3 + Math.min(3, Math.floor(a.comboCount / 4));
      const raw   = vulnDmg(s, dmg);
      const dealt = damageEnemy(s, raw);
      return `attack: 敵に ${dealt} ダメージ (combo:${a.comboCount})`;
    }
    case "lrBlock": {
      const amount = Math.max(2, 5 - Math.floor(a.comboCount / 2));
      s.player.block += amount;
      return `block: ブロック +${amount} (combo:${a.comboCount})`;
    }
    case "initialize": {
      s.player.block += 3;
      s.nextTurnExtraEnergy++;
      return `initialize: ブロック +3、次ターンエネルギー+1`;
    }
    case "noop": {
      return `noop: 何もしない`;
    }
    case "forceQuit": {
      const raw   = vulnDmg(s, 4);
      const dealt = damageEnemy(s, raw);
      return `forceQuit: 敵に ${dealt} ダメージ、実行を終了`;
    }
    case "overClock": {
      s.player.hp = Math.max(0, s.player.hp - 2);
      s.energy += 1;
      return `overClock: HP -2、エネルギー+1`;
    }
    case "incrementalAttack": {
      const raw   = vulnDmg(s, a.comboCount * 2);
      const dealt = damageEnemy(s, raw);
      return `incrementalAttack: 敵に ${dealt} ダメージ（コンボ×2）`;
    }
    case "patch": {
      s.player.hp = Math.min(s.player.maxHp, s.player.hp + 2);
      return `patch: HP +2 回復`;
    }
    case "incrementalBlock": {
      s.player.block += a.comboCount;
      return `incrementalBlock: ブロック +${a.comboCount}（コンボ数）`;
    }
    case "bufferOverflowProtection": {
      s.player.block += 3;
      return `bufferOverflowProtection: ブロック +3`;
    }
    case "asyncDraw": {
      return `asyncDraw: カードを2枚ドロー`;
    }
    case "stackOverflow": {
      s.player.hp = Math.max(0, s.player.hp - 3);
      s.comboIncrement = 5;
      return `stackOverflow: HP -3、コンボ増加が+5に`;
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
    case "overclockBurst": {
      const gained = s.maxEnergy - s.energy;
      s.energy = s.maxEnergy;
      s.comboCount += 3;
      return `overclockBurst: エネルギー +${gained}（全回復）、コンボ+3`;
    }

  }
}
