import type { MapDefinition } from "./types";

export const classicMap: MapDefinition = {
  id: "classic",
  name: "Classic Arena",
  description: "The original snowball battleground with symmetrical layout",
  width: 2000,
  height: 1000,
  gridSize: 40,

  teams: {
    red: {
      flagBase: { x: 80, y: 500 },
      spawnZone: { x: 120, y: 500, radius: 100 },
    },
    blue: {
      flagBase: { x: 1920, y: 500 },
      spawnZone: { x: 1880, y: 500, radius: 100 },
    },
  },

  walls: [
    // Perimeter walls (40px thickness)
    { x: 0, y: 0, width: 2000, height: 40 }, // Top
    { x: 0, y: 960, width: 2000, height: 40 }, // Bottom
    { x: 0, y: 0, width: 40, height: 1000 }, // Left
    { x: 1960, y: 0, width: 40, height: 1000 }, // Right

    // Left side structures (mirrored on right)
    { x: 320, y: 160, width: 320, height: 40 }, // Top horizontal barrier
    { x: 160, y: 280, width: 40, height: 160 }, // Upper vertical barrier
    { x: 560, y: 440, width: 160, height: 120 }, // Center-left box
    { x: 320, y: 640, width: 40, height: 200 }, // Lower vertical barrier
    { x: 200, y: 800, width: 240, height: 40 }, // Bottom horizontal barrier

    // Right side structures (mirror of left)
    { x: 1360, y: 160, width: 320, height: 40 }, // Top horizontal barrier
    { x: 1800, y: 280, width: 40, height: 160 }, // Upper vertical barrier
    { x: 1280, y: 440, width: 160, height: 120 }, // Center-right box
    { x: 1640, y: 640, width: 40, height: 200 }, // Lower vertical barrier
    { x: 1560, y: 800, width: 240, height: 40 }, // Bottom horizontal barrier
  ],

  recommendedPlayerCount: { min: 4, max: 16 },
};
