// ラン用マップの生成。8フロア（分岐）+ボス（ドラゴン固定）。
// フロア間は部分結合（各ノードが次フロアの近傍1〜2ノードに接続する、Slay the Spire方式）。
// 詳細はCONTEXT.md「マップ」「ノード」参照。

import { STAGES } from "./stages";

export type NodeType = "battle" | "shop" | "event";

export const MAP_FLOOR_COUNT = 8; // ボスを除くフロア数

export interface MapNode {
  id: string;
  floor: number;      // 0-indexed。0〜MAP_FLOOR_COUNT-1が通常フロア、MAP_FLOOR_COUNTがボス
  x: number;           // フロア内での並び順（接続計算・表示用）
  type: NodeType;
  stageIndex?: number; // battleノード: STAGES配列内のインデックス（ボスを除く）
  eventId?: string;    // eventノード: EventDef.id
  connections: string[]; // 次フロアで接続しているノードid
}

export interface RunMap {
  floors: MapNode[][]; // floors[0..MAP_FLOOR_COUNT-1] + floors[MAP_FLOOR_COUNT] = [ボスノード1つ]
}

const NODE_TYPE_WEIGHTS: Array<{ type: NodeType; weight: number }> = [
  { type: "battle", weight: 60 },
  { type: "event", weight: 25 },
  { type: "shop", weight: 15 },
];

function pickNodeType(): NodeType {
  const total = NODE_TYPE_WEIGHTS.reduce((s, w) => s + w.weight, 0);
  let roll = Math.random() * total;
  for (const w of NODE_TYPE_WEIGHTS) {
    if (roll < w.weight) return w.type;
    roll -= w.weight;
  }
  return "battle";
}

// battleノードの敵は、フロアの深さに応じた「窓」の中から抽選する（使い回しつつ緩やかに強くなる）
function pickStageIndex(floor: number, nonBossCount: number): number {
  const tierSize = Math.max(1, Math.ceil(nonBossCount / MAP_FLOOR_COUNT));
  const rangeStart = Math.min(floor * tierSize, nonBossCount - 1);
  const rangeEnd = Math.min(rangeStart + tierSize, nonBossCount);
  const span = Math.max(1, rangeEnd - rangeStart);
  return rangeStart + Math.floor(Math.random() * span);
}

function randEventId(eventIds: string[]): string {
  return eventIds[Math.floor(Math.random() * eventIds.length)];
}

export function generateMap(eventIds: string[]): RunMap {
  const nonBossCount = STAGES.length - 1; // 最後(isBoss)を除く
  const floors: MapNode[][] = [];

  // shop/eventが連続フロアに固まらないよう、直近何フロアで出たかを覚えておく
  const MIN_SPACING = 2; // 同じ種別は最低2フロア空ける
  const lastFloorOfType: Record<NodeType, number> = { battle: -99, shop: -99, event: -99 };

  for (let floor = 0; floor < MAP_FLOOR_COUNT; floor++) {
    const nodeCount = 2 + Math.floor(Math.random() * 2); // 2〜3
    const nodes: MapNode[] = [];
    let usedShop = false, usedEvent = false; // 同じフロアにshop/eventが重複しないよう1フロア1個までに抑える
    for (let x = 0; x < nodeCount; x++) {
      let type: NodeType = floor === 0 ? "battle" : pickNodeType(); // 1フロア目は分岐に戸惑わせないよう全battle固定
      if (type === "shop" && (usedShop || floor - lastFloorOfType.shop < MIN_SPACING)) type = "battle";
      if (type === "event" && (usedEvent || floor - lastFloorOfType.event < MIN_SPACING)) type = "battle";
      if (type === "shop") usedShop = true;
      if (type === "event") usedEvent = true;
      const node: MapNode = {
        id: `f${floor}n${x}`,
        floor, x, type,
        connections: [],
      };
      if (type === "battle") {
        node.stageIndex = pickStageIndex(floor, nonBossCount);
      } else if (type === "event") {
        node.eventId = randEventId(eventIds);
      }
      nodes.push(node);
    }
    // このフロアが全部shop/eventだったら、1つを強制的にbattleにする（毎フロア最低1戦闘は保証）
    if (floor > 0 && !nodes.some(n => n.type === "battle")) {
      const forced = nodes[Math.floor(Math.random() * nodes.length)];
      forced.type = "battle";
      forced.eventId = undefined;
      forced.stageIndex = pickStageIndex(floor, nonBossCount);
    }
    if (nodes.some(n => n.type === "shop"))  lastFloorOfType.shop  = floor;
    if (nodes.some(n => n.type === "event")) lastFloorOfType.event = floor;
    floors.push(nodes);
  }

  // 1周を通じてshop/eventに最低2回ずつ触れられるよう保証する。
  // 変換先のフロアは「まだそのタイプを持たないフロアの中で、既存の同タイプから最も離れているフロア」を
  // 貪欲に選ぶことで、序盤/終盤いずれかに固まらないよう分散させる
  const ensureSpread = (type: NodeType, minimum: number): void => {
    const hasType = (i: number) => floors[i].some(n => n.type === type);
    let count = floors.flat().filter(n => n.type === type).length;
    while (count < minimum) {
      let bestFloor = -1, bestDist = -1;
      for (let i = 1; i < MAP_FLOOR_COUNT; i++) {
        if (hasType(i)) continue;
        if (!floors[i].some(n => n.type === "battle")) continue; // 変換できるノードがない
        const existing: number[] = [];
        for (let j = 1; j < MAP_FLOOR_COUNT; j++) if (hasType(j)) existing.push(j);
        const dist = existing.length === 0 ? 999 : Math.min(...existing.map(j => Math.abs(j - i)));
        if (dist > bestDist) { bestDist = dist; bestFloor = i; }
      }
      if (bestFloor === -1) break; // これ以上変換できるフロアがない
      const target = floors[bestFloor].find(n => n.type === "battle")!;
      target.type = type;
      target.stageIndex = undefined;
      if (type === "event") target.eventId = randEventId(eventIds);
      count++;
    }
  };
  ensureSpread("shop", 2);
  ensureSpread("event", 2);

  // フロア間の接続（部分結合）: 各ノードは次フロアの近傍1〜2ノードに接続する
  for (let floor = 0; floor < MAP_FLOOR_COUNT - 1; floor++) {
    const current = floors[floor];
    const next = floors[floor + 1];
    for (const node of current) {
      const ratio = next.length / current.length;
      const centerX = Math.min(next.length - 1, Math.floor(node.x * ratio));
      const targets = new Set<number>([centerX]);
      if (Math.random() < 0.5) {
        const alt = centerX + (Math.random() < 0.5 ? -1 : 1);
        if (alt >= 0 && alt < next.length) targets.add(alt);
      }
      node.connections = [...targets].map(x => next[x].id);
    }
    // 次フロアで接続が1本も来ていないノードがあれば、直前フロアの最寄りノードから接続を足す
    const reached = new Set(current.flatMap(n => n.connections));
    for (const orphan of next) {
      if (reached.has(orphan.id)) continue;
      const nearest = current.reduce((best, n) =>
        Math.abs(n.x * (next.length / current.length) - orphan.x) <
        Math.abs(best.x * (next.length / current.length) - orphan.x) ? n : best,
      current[0]);
      nearest.connections.push(orphan.id);
    }
  }

  // 最終フロア → ボスは全ノード接続
  const bossNode: MapNode = {
    id: "boss",
    floor: MAP_FLOOR_COUNT,
    x: 0,
    type: "battle",
    stageIndex: STAGES.length - 1, // ドラゴン固定
    connections: [],
  };
  for (const node of floors[MAP_FLOOR_COUNT - 1]) {
    node.connections = [bossNode.id];
  }
  floors.push([bossNode]);

  return { floors };
}

export function findNode(map: RunMap, id: string): MapNode | undefined {
  for (const floor of map.floors) {
    const found = floor.find(n => n.id === id);
    if (found) return found;
  }
  return undefined;
}
