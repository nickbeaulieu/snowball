// Shared wall definitions for the snowball game world
// Each wall is a rectangle: { x, y, width, height }

export const WALLS = [
  // Perimeter walls (optional, for visual reference)
  { x: 0, y: 0, width: 2000, height: 20 }, // Top
  { x: 0, y: 980, width: 2000, height: 20 }, // Bottom
  { x: 0, y: 0, width: 20, height: 1000 }, // Left
  { x: 1980, y: 0, width: 20, height: 1000 }, // Right

  // Some interior walls
  { x: 400, y: 200, width: 300, height: 30 },
  { x: 900, y: 500, width: 200, height: 30 },
  { x: 1400, y: 700, width: 30, height: 200 },
  { x: 600, y: 700, width: 400, height: 30 },
  { x: 1200, y: 300, width: 30, height: 300 },
  { x: 1600, y: 100, width: 200, height: 30 },
  { x: 300, y: 600, width: 30, height: 200 },
];
