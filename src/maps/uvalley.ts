import type { MapDefinition } from "./types";

export const uValleyMap: MapDefinition = {
  id: "uvalley",
  name: "U-Valley",
  description: "U-shaped map with flags at the top corners",
  width: 2000,
  height: 1400,
  gridSize: 40,

  teams: {
    red: {
      flagBase: { x: 120, y: 180 },
      spawnZone: { x: 200, y: 240, radius: 100 },
    },
    blue: {
      flagBase: { x: 1880, y: 180 },
      spawnZone: { x: 1800, y: 240, radius: 100 },
    },
  },

  walls: [
    // Perimeter walls (40px thickness)
    { x: 0, y: 0, width: 2000, height: 40 }, // Top
    { x: 0, y: 1360, width: 2000, height: 40 }, // Bottom
    { x: 0, y: 0, width: 40, height: 1400 }, // Left
    { x: 1960, y: 0, width: 40, height: 1400 }, // Right

    // Center blocking walls (creates U shape)
    { x: 520, y: 40, width: 40, height: 600 }, // Left wall of center block
    { x: 1440, y: 40, width: 40, height: 600 }, // Right wall of center block
    { x: 520, y: 600, width: 960, height: 40 }, // Bottom of center block

    // Interior obstacles for gameplay
    { x: 240, y: 480, width: 160, height: 40 }, // Left arm obstacle
    { x: 1600, y: 480, width: 160, height: 40 }, // Right arm obstacle
    { x: 880, y: 1000, width: 240, height: 40 }, // Bottom center cover
    { x: 360, y: 1120, width: 120, height: 40 }, // Left bottom
    { x: 1520, y: 1120, width: 120, height: 40 }, // Right bottom
  ],

  recommendedPlayerCount: { min: 4, max: 12 },
};
