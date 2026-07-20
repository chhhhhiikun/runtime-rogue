// プラグイン（レリック）: パッケージマネージャで購入する、ラン終了まで持続する受動効果。
// 全キャラ共通。単純なステータス修正のみ（条件付きの能動的な効果は将来拡張）。
// 詳細はCONTEXT.md「プラグイン」参照。

export type PluginEffect =
  | { kind: "maxHp"; amount: number }              // 最大HP（現在HPも同時に加算）
  | { kind: "extraDrawPerTurn"; amount: number }    // 毎ターンの追加ドロー枚数
  | { kind: "maxEnergy"; amount: number }           // 毎ターン全回復するMain Clockの上限
  | { kind: "startingBlock"; amount: number }       // 各戦闘開始時の初期ブロック
  | { kind: "maxDaemonCost"; amount: number }       // Daemon Costの上限
  | { kind: "comboIncrementBonus"; amount: number }  // コンボ増加量のベース値への加算（デフォルト1に加算）
  | { kind: "byteMultiplier"; percent: number }      // バイト獲得量の倍率ボーナス（戦闘勝利時のみ）
  | { kind: "cashMultiplier"; percent: number };     // キャッシュ獲得量の倍率ボーナス（戦闘勝利時のみ）

export interface PluginDef {
  id: string;
  name: string;
  description: string;
  effect: PluginEffect;
}

export const PLUGINS: PluginDef[] = [
  {
    id: "bufferOverflow",
    name: "大容量バッファ",
    description: "最大HP +8",
    effect: { kind: "maxHp", amount: 8 },
  },
  {
    id: "autoPreload",
    name: "自動プリロード",
    description: "毎ターンの追加ドロー +1",
    effect: { kind: "extraDrawPerTurn", amount: 1 },
  },
  {
    id: "constantOverclock",
    name: "常時オーバークロック",
    description: "毎ターンのMain Clock +1",
    effect: { kind: "maxEnergy", amount: 1 },
  },
  {
    id: "residentFirewall",
    name: "常駐ファイアウォール",
    description: "戦闘開始時ブロック +5",
    effect: { kind: "startingBlock", amount: 5 },
  },
  {
    id: "extraWorkerThread",
    name: "追加ワーカースレッド",
    description: "Daemon Costの上限 +1",
    effect: { kind: "maxDaemonCost", amount: 1 },
  },
  {
    id: "fastCompiler",
    name: "高速コンパイラ",
    description: "コンボ増加量 +0.2",
    effect: { kind: "comboIncrementBonus", amount: 0.2 },
  },
  {
    id: "referralLink",
    name: "リファラルリンク",
    description: "バイト獲得量 +10%",
    effect: { kind: "byteMultiplier", percent: 0.1 },
  },
  {
    id: "cashFlowImprovement",
    name: "キャッシュフロー改善",
    description: "キャッシュ獲得量 +10%",
    effect: { kind: "cashMultiplier", percent: 0.1 },
  },
];

export function getPlugin(id: string): PluginDef | undefined {
  return PLUGINS.find(p => p.id === id);
}
