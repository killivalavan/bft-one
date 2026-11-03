import type { CityStoreNode } from "@/lib/hooks/useCityDashboardData";

export type CityObjectKind = "hq" | "warehouse" | "finance" | "store" | "add_plot" | "van" | "tree_cafe";

export interface CityBuildingPlacement {
  id: string;
  kind: CityObjectKind;
  label: string;
  subLabel?: string;
  x: number;
  z: number;
  rotationY: number;
  storeNode?: CityStoreNode;
  routeWaypoints: Array<{ x: number; z: number }>;
  styleVariant: number;
  topProductMeta?: {
    name: string;
    storeName: string;
    units: number;
    revenue: number;
    marginPct?: number;
    wholesaleRate?: number;
    category?: string;
  };
}

export interface CityRoadSegment {
  x: number;
  z: number;
  width: number;
  depth: number;
  orientation: "horizontal" | "vertical" | "intersection";
}

export interface CityLayoutResult {
  worldWidth: number;
  worldDepth: number;
  hqPlacement: CityBuildingPlacement;
  warehousePlacement: CityBuildingPlacement;
  financePlacement: CityBuildingPlacement;
  storePlacements: CityBuildingPlacement[];
  addPlotPlacement: CityBuildingPlacement;
  roads: CityRoadSegment[];
  trees: Array<{ x: number; z: number; scale: number; variant: number }>;
}

/**
 * Generates a deterministic, expandable isometric 3D city layout with wide 2-lane boulevards,
 * clear separation between plazas and roads, and lush park trees across the green lawn.
 */
export function computeCityLayout(
  storeNodes: CityStoreNode[],
  hqStoreName?: string
): CityLayoutResult {
  const hqPlacement: CityBuildingPlacement = {
    id: "building-hq",
    kind: "hq",
    label: hqStoreName?.trim() ? hqStoreName.trim() : "Supply Hub HQ",
    subLabel: "Central Bakery & Dispatch",
    x: 0,
    z: -6.0,
    rotationY: 0,
    routeWaypoints: [{ x: 0, z: 0.8 }],
    styleVariant: 0,
  };

  const warehousePlacement: CityBuildingPlacement = {
    id: "building-warehouse",
    kind: "warehouse",
    label: "Catalog & Stock",
    subLabel: "Production Warehouse",
    x: -10.8,
    z: -6.0,
    rotationY: 0,
    routeWaypoints: [
      { x: 0, z: 0.8 },
      { x: -10.8, z: 0.8 },
    ],
    styleVariant: 1,
  };

  const financePlacement: CityBuildingPlacement = {
    id: "building-finance",
    kind: "finance",
    label: "Finance & Ledger Vault",
    subLabel: "Collections & Dues",
    x: 10.8,
    z: -6.0,
    rotationY: 0,
    routeWaypoints: [
      { x: 0, z: 0.8 },
      { x: 10.8, z: 0.8 },
    ],
    styleVariant: 2,
  };

  const totalSlotsNeeded = Math.max(4, storeNodes.length + 1);
  const slotDefs: Array<{ x: number; z: number; roadZ: number; rotationY: number }> = [];

  // Generous 4-column avenue spacing with green lawn & trees between stores
  const centerOrderedCols = [-10.5, -3.5, 3.5, 10.5];

  // Each tier places stores at `storeZ` facing +Z (rotY = 0, directly toward the camera)
  // with a full 2-lane boulevard running cleanly in front at `roadZ = storeZ + 4.6`
  const avenueConfigs = [
    { storeZ: 6.0, roadZ: 10.6, rotY: 0 },
    { storeZ: 15.8, roadZ: 20.4, rotY: 0 },
    { storeZ: -15.2, roadZ: -10.6, rotY: 0 },
    { storeZ: 25.6, roadZ: 30.2, rotY: 0 },
    { storeZ: -25.0, roadZ: -20.4, rotY: 0 },
  ];

  let dynamicSouthZ = 35.4;
  while (avenueConfigs.length * centerOrderedCols.length < totalSlotsNeeded + 4) {
    avenueConfigs.push({
      storeZ: dynamicSouthZ,
      roadZ: dynamicSouthZ + 4.6,
      rotY: 0,
    });
    dynamicSouthZ += 9.8;
  }

  for (const tier of avenueConfigs) {
    for (const colX of centerOrderedCols) {
      slotDefs.push({
        x: colX,
        z: tier.storeZ,
        roadZ: tier.roadZ,
        rotationY: tier.rotY,
      });
    }
  }

  const storePlacements: CityBuildingPlacement[] = storeNodes.map((node, idx) => {
    const slot = slotDefs[idx];
    const spineX = slot.x < 0 ? -16.2 : 16.2;

    const waypoints: Array<{ x: number; z: number }> = [
      { x: 0, z: 0.8 },
      { x: spineX, z: 0.8 },
      { x: spineX, z: slot.roadZ },
      { x: slot.x, z: slot.roadZ },
    ];

    return {
      id: `store-${node.id}`,
      kind: "store",
      label: node.displayName,
      subLabel:
        node.unpaidDues > 0
          ? `₹${node.unpaidDues.toLocaleString("en-IN")} Due`
          : `₹${node.billedAmount.toLocaleString("en-IN")}`,
      x: slot.x,
      z: slot.z,
      rotationY: slot.rotationY,
      storeNode: node,
      routeWaypoints: waypoints,
      styleVariant: idx % 5,
    };
  });

  const addSlot = slotDefs[storeNodes.length];
  const addPlotPlacement: CityBuildingPlacement = {
    id: "building-add-plot",
    kind: "add_plot",
    label: "+ Add Client Store",
    subLabel: "Expand Supply Network",
    x: addSlot.x,
    z: addSlot.z,
    rotationY: addSlot.rotationY,
    routeWaypoints: [
      { x: 0, z: 0.8 },
      { x: addSlot.x < 0 ? -16.2 : 16.2, z: 0.8 },
      { x: addSlot.x < 0 ? -16.2 : 16.2, z: addSlot.roadZ },
      { x: addSlot.x, z: addSlot.roadZ },
    ],
    styleVariant: 0,
  };

  // Active road network: HQ Plaza Boulevard (z = 0.8) + every active store avenue
  const usedRoadZs = new Set<number>([0.8]);
  for (let i = 0; i < Math.max(1, storeNodes.length); i++) {
    usedRoadZs.add(slotDefs[i].roadZ);
  }

  const allZs = [
    -11,
    ...Array.from(usedRoadZs),
    ...storePlacements.map((s) => s.z),
  ];
  const minZ = Math.min(...allZs) - 6.0;
  const maxZ = Math.max(...allZs) + 6.0;
  const worldWidth = 46;
  const worldDepth = Math.max(40, maxZ - minZ + 6);

  const roads: CityRoadSegment[] = [];
  const roadWidth = 35.6;
  const twoLaneRoadDepth = 3.2;

  usedRoadZs.forEach((rz) => {
    roads.push({
      x: 0,
      z: rz,
      width: roadWidth,
      depth: twoLaneRoadDepth,
      orientation: "horizontal",
    });
  });

  const sortedRoadZs = Array.from(usedRoadZs).sort((a, b) => a - b);
  if (sortedRoadZs.length > 1) {
    const zStart = sortedRoadZs[0];
    const zEnd = sortedRoadZs[sortedRoadZs.length - 1];
    const vDepth = zEnd - zStart + twoLaneRoadDepth;
    const vCenterZ = (zStart + zEnd) / 2;

    roads.push({
      x: -16.2,
      z: vCenterZ,
      width: twoLaneRoadDepth,
      depth: vDepth,
      orientation: "vertical",
    });
    roads.push({
      x: 16.2,
      z: vCenterZ,
      width: twoLaneRoadDepth,
      depth: vDepth,
      orientation: "vertical",
    });
  }

  // Abundant park trees framing the avenues, store pockets, and perimeter
  const trees: Array<{ x: number; z: number; scale: number; variant: number }> = [
    // Central Plaza & Behind HQ
    { x: -5.6, z: -6.0, scale: 1.1, variant: 0 },
    { x: 5.6, z: -6.0, scale: 1.1, variant: 1 },
    { x: -16.0, z: -6.0, scale: 1.2, variant: 2 },
    { x: 16.0, z: -6.0, scale: 1.15, variant: 3 },
    { x: -8.2, z: -9.6, scale: 1.15, variant: 1 },
    { x: -3.2, z: -9.8, scale: 1.25, variant: 0 },
    { x: 3.2, z: -9.8, scale: 1.2, variant: 2 },
    { x: 8.2, z: -9.6, scale: 1.15, variant: 3 },
    { x: -14.2, z: -9.6, scale: 1.05, variant: 0 },
    { x: 14.2, z: -9.6, scale: 1.1, variant: 1 },

    // Left & Right Outer Boulevard Greenbelts
    { x: -19.8, z: -6.0, scale: 1.2, variant: 2 },
    { x: 19.8, z: -6.0, scale: 1.2, variant: 0 },
    { x: -19.8, z: -1.0, scale: 1.15, variant: 1 },
    { x: 19.8, z: -1.0, scale: 1.15, variant: 3 },
    { x: -19.8, z: 4.0, scale: 1.25, variant: 0 },
    { x: 19.8, z: 4.0, scale: 1.2, variant: 2 },
    { x: -19.8, z: 9.5, scale: 1.1, variant: 3 },
    { x: 19.8, z: 9.5, scale: 1.15, variant: 1 },
    { x: -19.8, z: 14.5, scale: 1.2, variant: 0 },
    { x: 19.8, z: 14.5, scale: 1.25, variant: 2 },
    { x: -19.8, z: 19.5, scale: 1.15, variant: 1 },
    { x: 19.8, z: 19.5, scale: 1.1, variant: 3 },
    { x: -19.8, z: 24.5, scale: 1.2, variant: 2 },
    { x: 19.8, z: 24.5, scale: 1.2, variant: 0 },

    // Pocket Park Trees between Client Stores (Tier 1 & Tier 2)
    { x: -7.0, z: 5.8, scale: 0.92, variant: 0 },
    { x: 0.0, z: 5.8, scale: 0.95, variant: 2 },
    { x: 7.0, z: 5.8, scale: 0.92, variant: 1 },
    { x: -13.6, z: 5.8, scale: 0.95, variant: 3 },
    { x: 13.6, z: 5.8, scale: 0.95, variant: 0 },

    { x: -7.0, z: 15.6, scale: 0.92, variant: 2 },
    { x: 0.0, z: 15.6, scale: 0.95, variant: 1 },
    { x: 7.0, z: 15.6, scale: 0.92, variant: 3 },
    { x: -13.6, z: 15.6, scale: 0.95, variant: 0 },
    { x: 13.6, z: 15.6, scale: 0.95, variant: 2 },

    // South Park Promenade Trees
    { x: -11.5, z: 24.5, scale: 1.15, variant: 1 },
    { x: -4.5, z: 24.5, scale: 1.1, variant: 0 },
    { x: 4.5, z: 24.5, scale: 1.15, variant: 3 },
    { x: 11.5, z: 24.5, scale: 1.1, variant: 2 },
  ];

  return {
    worldWidth,
    worldDepth,
    hqPlacement,
    warehousePlacement,
    financePlacement,
    storePlacements,
    addPlotPlacement,
    roads,
    trees,
  };
}
