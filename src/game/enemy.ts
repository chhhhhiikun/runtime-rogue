import type { CombatState, EnemyIntent } from "./state";

export function chooseIntent(turn: number, pattern: EnemyIntent[]): EnemyIntent {
  return { ...pattern[turn % pattern.length] };
}

export function enemyAct(s: CombatState): string {
  const intent = s.enemy.intent;
  if (intent.kind === "block") {
    s.enemy.block += intent.value;
    return `敵はブロック +${intent.value} を得た`;
  }
  let dmg = intent.value;
  if (s.player.block > 0) {
    const absorbed   = Math.min(s.player.block, dmg);
    s.player.block  -= absorbed;
    dmg             -= absorbed;
  }
  s.player.hp = Math.max(0, s.player.hp - dmg);
  return `敵の攻撃！ あなたに ${dmg} ダメージ`;
}
