import type { MapDefinition } from "./types";

export const arenaMap: MapDefinition = {
  id: "arena",
  name: "Compact Arena",
  description: "Smaller, faster-paced map with central obstacles",
  width: 1600,
  height: 1200,
  gridSize: 40,

  teams: {
    red: {
      flagBase: { x: 80, y: 600 },
      spawnZone: { x: 160, y: 600, radius: 120 },
    },
    blue: {
      flagBase: { x: 1520, y: 600 },
      spawnZone: { x: 1440, y: 600, radius: 120 },
    },
  },

  walls: [
    // Perimeter walls (40px thickness)
    { x: 0, y: 0, width: 1600, height: 40 }, // Top
    { x: 0, y: 1160, width: 1600, height: 40 }, // Bottom
    { x: 0, y: 0, width: 40, height: 1200 }, // Left
    { x: 1560, y: 0, width: 40, height: 1200 }, // Right

    // Center pillar cluster (cross shape)
    { x: 720, y: 560, width: 160, height: 40 }, // Top horizontal
    { x: 720, y: 600, width: 160, height: 40 }, // Bottom horizontal
    { x: 760, y: 520, width: 80, height: 40 }, // Vertical top
    { x: 760, y: 640, width: 80, height: 40 }, // Vertical bottom

    // Left side structures
    { x: 360, y: 280, width: 200, height: 40 }, // Upper barrier
    { x: 360, y: 880, width: 200, height: 40 }, // Lower barrier
    { x: 280, y: 560, width: 40, height: 80 }, // Mid vertical

    // Right side structures (mirrored)
    { x: 1040, y: 280, width: 200, height: 40 }, // Upper barrier
    { x: 1040, y: 880, width: 200, height: 40 }, // Lower barrier
    { x: 1280, y: 560, width: 40, height: 80 }, // Mid vertical

    // Corner structures
    { x: 160, y: 160, width: 120, height: 40 }, // Top-left
    { x: 1320, y: 160, width: 120, height: 40 }, // Top-right
    { x: 160, y: 1000, width: 120, height: 40 }, // Bottom-left
    { x: 1320, y: 1000, width: 120, height: 40 }, // Bottom-right
  ],

  recommendedPlayerCount: { min: 2, max: 8 },
};
