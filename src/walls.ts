// Shared wall definitions for the snowball game world
// Each wall is a rectangle: { x, y, width, height }
// Symmetrical layout aligned to 40px grid (50x25 cells)

export const WALLS = [
  // Perimeter walls (40px thickness)
  { x: 0, y: 0, width: 2000, height: 40 }, // Top
  { x: 0, y: 960, width: 2000, height: 40 }, // Bottom
  { x: 0, y: 0, width: 40, height: 1000 }, // Left
  { x: 1960, y: 0, width: 40, height: 1000 }, // Right

  // Left side structures (mirrored on right)
  // { x: 120, y: 80, width: 160, height: 40 }, // Near-goal upper barrier (80px clearance)
  { x: 320, y: 160, width: 320, height: 40 }, // Top horizontal barrier
  { x: 160, y: 280, width: 40, height: 160 }, // Upper vertical barrier
  { x: 560, y: 440, width: 160, height: 120 }, // Center-left box
  { x: 320, y: 640, width: 40, height: 200 }, // Lower vertical barrier
  { x: 200, y: 800, width: 240, height: 40 }, // Bottom horizontal barrier

  // Right side structures (mirror of left)
  // { x: 1720, y: 80, width: 160, height: 40 }, // Near-goal upper barrier (80px clearance)
  { x: 1360, y: 160, width: 320, height: 40 }, // Top horizontal barrier
  { x: 1800, y: 280, width: 40, height: 160 }, // Upper vertical barrier
  { x: 1280, y: 440, width: 160, height: 120 }, // Center-right box
  { x: 1640, y: 640, width: 40, height: 200 }, // Lower vertical barrier
  { x: 1560, y: 800, width: 240, height: 40 }, // Bottom horizontal barrier
];
