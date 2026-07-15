import type { CombatState, EnemyIntent } from "./state";
import type { CardId } from "./cards";

// Bug Injector: 弱点系カードの結果は、record()時点でmatched/dmg/amountを確定させてからactionに詰める
// （applyActionは純粋な再生関数であり、req.weaknessGimmick等の追加情報を持たないため。
//  matched判定・ギミックによる上書きはすべてworker.ts側のカード関数で完結させる）

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
  // Object Breaker actions
  | { kind: "charge"; cost: number }
  | { kind: "store"; cost: number }
  | { kind: "release"; cost: number }
  | { kind: "compact"; cost: number }
  | { kind: "defrag"; cost: number }
  | { kind: "fortify"; cost: number }
  | { kind: "double"; cost: number }
  | { kind: "overcharge"; cost: number }
  | { kind: "siphon"; cost: number }
  | { kind: "surge"; cost: number }
  | { kind: "bigRelease"; cost: number }
  | { kind: "singularity"; cost: number }
  // Bug Injector actions
  | { kind: "debug"; cost: number }
  | { kind: "weaknessAttack"; matched: boolean; dmg: number; ignoresBlock?: boolean; cost: number }
  | { kind: "weaknessBlock"; matched: boolean; amount: number; cost: number }
  | { kind: "hotReload"; cost: number }
  // RNG Cracker actions
  | { kind: "gambleAttack"; success: boolean; dmg: number; cost: number }
  | { kind: "gambleBlock"; success: boolean; amount: number; cost: number }
  | { kind: "gambleRevert"; gambleKind: "attack" | "block"; amount: number; cost: number }
  | { kind: "skipRoll"; cost: number }
  | { kind: "insurance"; cost: number }
  | { kind: "retryRoll"; cost: number }
  | { kind: "oddsBoost"; cost: number }
  | { kind: "forceSeed"; cost: number }
  | { kind: "seedLock"; cost: number }
  // 敵ギミックによるプレイヤーへの即時ダメージ（竜騎士「見切りの一撃」等。コストは発生しない）
  | { kind: "gimmickDamage"; amount: number; label: string }
  // 敵ギミックによる敵への即時ブロック付与（サイクロプス「単眼看破」等。コストは発生しない）
  | { kind: "gimmickBlock"; amount: number; label: string }
  // 敵ギミックによるstoredValueの直接上書き（Object Breaker「上限キャップ」等。コストは発生しない）
  | { kind: "gimmickStoredValueSet"; value: number; label: string }
  // ターン境界（敵ターン処理）。storedValueDeltaはstoredValueGimmick（被弾時吸収/GC）による増減分
  | { kind: "enemyTurn"; intent: EnemyIntent; nextIntent: EnemyIntent; label: string; poisonDmg: number; storedValueDelta?: number };

// viaDaemon: Daemon による自動実行由来のアクションかどうか（ログ表示・アニメーション分岐用）
// cardId: このアクションを発生させた具体的なカードid（実行行・カードハイライト用。record()経由のアクションのみ付与）
// sourceLine: ユーザーが書いたコード内の行番号（1-indexed、メイン/DAEMONエディタ自身のコード範囲内のみ。同上）
export type Action = ActionCore & { viaDaemon?: boolean; cardId?: CardId; sourceLine?: number };

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
    if (a.storedValueDelta) {
      s.storedValue = Math.max(0, s.storedValue + a.storedValueDelta);
    }
    if (s.releasedThisTurn) {
      s.turnsSinceRelease = 0;
    } else {
      s.turnsSinceRelease++;
    }
    s.releasedThisTurn = false;
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

  // gimmickStoredValueSet はコストを消費しない、敵ギミックによるstoredValueの直接上書き
  if (a.kind === "gimmickStoredValueSet") {
    s.storedValue = a.value;
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

    // ── Object Breaker ───────────────────────────────────────────
    case "charge": {
      s.storedValue += 2;
      return `charge: 変数 +2（${s.storedValue}）`;
    }
    case "store": {
      s.storedValue += 4;
      return `store: 変数 +4（${s.storedValue}）`;
    }
    case "release": {
      const raw   = vulnDmg(s, s.storedValue);
      const dealt = damageEnemy(s, raw);
      s.storedValue = 0;
      return `release: 変数を解放して敵に ${dealt} ダメージ`;
    }
    case "compact": {
      const before  = s.storedValue;
      const after   = Math.floor(before / 2);
      const removed = before - after;
      s.storedValue = after;
      const raw   = vulnDmg(s, removed);
      const dealt = damageEnemy(s, raw);
      return `compact: 変数 ${before} → ${after}、敵に ${dealt} ダメージ`;
    }
    case "defrag": {
      s.player.hp = Math.min(s.player.maxHp, s.player.hp + 3);
      return `defrag: HP +3 回復`;
    }
    case "fortify": {
      const amount = Math.max(2, Math.floor(s.storedValue / 5));
      s.player.block += amount;
      return `fortify: ブロック +${amount}（変数${s.storedValue}）`;
    }
    case "double": {
      s.storedValue *= 2;
      return `double: 変数を2倍に（${s.storedValue}）`;
    }
    case "overcharge": {
      s.storedValue += 8;
      s.player.hp = Math.max(0, s.player.hp - 2);
      return `overcharge: 変数 +8（${s.storedValue}）、自分に2ダメージ`;
    }
    case "siphon": {
      const consumed = Math.min(5, s.storedValue);
      s.storedValue -= consumed;
      s.player.hp = Math.min(s.player.maxHp, s.player.hp + consumed);
      return `siphon: 変数から${consumed}を消費してHP +${consumed}`;
    }
    case "surge": {
      s.storedValue = Math.floor(s.storedValue * 1.5);
      return `surge: 変数を1.5倍に（${s.storedValue}）`;
    }
    case "bigRelease": {
      const raw   = vulnDmg(s, Math.floor(s.storedValue * 1.5));
      const dealt = damageEnemy(s, raw);
      s.storedValue = 0;
      return `bigRelease: 変数を解放して敵に ${dealt} ダメージ`;
    }
    case "singularity": {
      s.storedValue = s.storedValue * 3 + 10;
      return `singularity: 変数を3倍+10に（${s.storedValue}）`;
    }

    // ── Bug Injector ──────────────────────────────────────────────
    case "debug": {
      return "debug: 敵のエラーログを取得した";
    }
    case "weaknessAttack": {
      let dealt: number;
      if (a.ignoresBlock) {
        const raw = vulnDmg(s, a.dmg);
        s.enemy.hp = Math.max(0, s.enemy.hp - raw);
        s.damageDealtThisTurn += raw;
        dealt = raw;
      } else {
        const raw = vulnDmg(s, a.dmg);
        dealt = damageEnemy(s, raw);
      }
      return a.matched ? `🎯 弱点直撃！ 敵に ${dealt} ダメージ` : `敵に ${dealt} ダメージ`;
    }
    case "weaknessBlock": {
      s.player.block += a.amount;
      return a.matched ? `🎯 弱点防御！ ブロック +${a.amount}` : `ブロック +${a.amount}`;
    }
    case "hotReload": {
      return "hotReload: 3枚ドロー、このターンの手札コスト-1";
    }

    // ── RNG Cracker ─────────────────────────────────────────────────
    case "gambleAttack": {
      const raw   = vulnDmg(s, a.dmg);
      const dealt = damageEnemy(s, raw);
      return a.success ? `🎰 成功！ 敵に ${dealt} ダメージ` : `外れ… 敵に ${dealt} ダメージ`;
    }
    case "gambleBlock": {
      s.player.block += a.amount;
      return a.success ? `🎰 成功！ ブロック +${a.amount}` : `外れ… ブロック +${a.amount}`;
    }
    case "gambleRevert": {
      // retryRoll(): 直前のギャンブル結果を打ち消す（簡易実装。ブロック吸収分の巻き戻しはしない）
      if (a.gambleKind === "attack") {
        s.enemy.hp = Math.min(s.enemy.maxHp, s.enemy.hp + a.amount);
      } else {
        s.player.block = Math.max(0, s.player.block - a.amount);
      }
      return "retryRoll: 直前の結果を打ち消した";
    }
    case "skipRoll": {
      return "skipRoll: seedを1つ進めた";
    }
    case "insurance": {
      return "insurance: 次のギャンブル外れのペナルティを軽減する";
    }
    case "retryRoll": {
      return "retryRoll: 直前のギャンブル結果を撃ち直す";
    }
    case "oddsBoost": {
      return "oddsBoost: 次のギャンブルの成功ラインを有利にする";
    }
    case "forceSeed": {
      return "forceSeed: seedを上書きした";
    }
    case "seedLock": {
      return "seedLock: 敵のseed干渉ギミックを一時的に無効化する";
    }
  }
}
