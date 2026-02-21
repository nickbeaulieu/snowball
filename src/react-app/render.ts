import type { Player, Snowball, FlagState, Team, Particle } from "../types";

export function drawGridBackground(
  ctx: CanvasRenderingContext2D,
  worldWidth: number,
  worldHeight: number,
  gridSize: number
): void {
  // Draw subtle radial gradient background (lighter center, slightly darker edges)
  const centerX = worldWidth / 2;
  const centerY = worldHeight / 2;
  const radius = Math.sqrt(worldWidth * worldWidth + worldHeight * worldHeight) / 2;

  const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
  gradient.addColorStop(0, '#ffffff');    // Bright white center
  gradient.addColorStop(0.5, '#f9f9f6');  // Off-white mid
  gradient.addColorStop(1, '#f0f0ed');    // Slightly darker edges

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, worldWidth, worldHeight);

  // Draw grid with reduced opacity
  ctx.beginPath();
  for (let x = 0; x <= worldWidth; x += gridSize) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, worldHeight);
  }
  for (let y = 0; y <= worldHeight; y += gridSize) {
    ctx.moveTo(0, y);
    ctx.lineTo(worldWidth, y);
  }
  ctx.strokeStyle = "#ececec"; // subtle grid lines
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.7; // Restored visibility
  ctx.stroke();
  ctx.globalAlpha = 1;
}

export function drawVoidBackground(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number
): void {
  // Fill entire canvas with dark gray void
  ctx.fillStyle = "#2a2a2a";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
}

export function drawWorldBorder(
  ctx: CanvasRenderingContext2D,
  worldWidth: number,
  worldHeight: number
): void {
  // Draw world bounds (border)
  ctx.strokeStyle = "#bbb";
  ctx.lineWidth = 4;
  ctx.strokeRect(0, 0, worldWidth, worldHeight);
}

// Helper: Check if two walls are connected (adjacent or overlapping)
function areWallsConnected(
  w1: { x: number; y: number; width: number; height: number },
  w2: { x: number; y: number; width: number; height: number },
  threshold: number = 3
): boolean {
  const w1Right = w1.x + w1.width;
  const w1Bottom = w1.y + w1.height;
  const w2Right = w2.x + w2.width;
  const w2Bottom = w2.y + w2.height;

  // Check for overlap or adjacency in both dimensions
  const xOverlap = !(w1Right < w2.x - threshold || w2Right < w1.x - threshold);
  const yOverlap = !(w1Bottom < w2.y - threshold || w2Bottom < w1.y - threshold);

  return xOverlap && yOverlap;
}

// Group connected walls using Union-Find algorithm (export for caching)
export function groupConnectedWalls(
  walls: Array<{ x: number; y: number; width: number; height: number }>
): Array<Array<{ x: number; y: number; width: number; height: number }>> {
  if (walls.length === 0) return [];

  // Union-Find data structure
  const parent: number[] = walls.map((_, i) => i);

  function find(i: number): number {
    if (parent[i] !== i) {
      parent[i] = find(parent[i]); // Path compression
    }
    return parent[i];
  }

  function union(i: number, j: number): void {
    const pi = find(i);
    const pj = find(j);
    if (pi !== pj) {
      parent[pi] = pj;
    }
  }

  // Check all pairs for connectivity
  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      if (areWallsConnected(walls[i], walls[j])) {
        union(i, j);
      }
    }
  }

  // Group walls by their root parent
  const groups = new Map<number, typeof walls>();
  walls.forEach((wall, i) => {
    const root = find(i);
    if (!groups.has(root)) {
      groups.set(root, []);
    }
    groups.get(root)!.push(wall);
  });

  return Array.from(groups.values());
}

// Helper: Create a rounded rectangle path for a group of walls
function createUnifiedPath(
  ctx: CanvasRenderingContext2D,
  group: Array<{ x: number; y: number; width: number; height: number }>,
  cornerRadius: number = 16
): void {
  // Find bounding box
  const minX = Math.min(...group.map(w => w.x));
  const minY = Math.min(...group.map(w => w.y));
  const maxX = Math.max(...group.map(w => w.x + w.width));
  const maxY = Math.max(...group.map(w => w.y + w.height));

  // Create unified blob by drawing rounded rect around bounding box
  // (Simplified from full marching squares for better performance)
  ctx.beginPath();

  // Draw rounded rect around entire bounding box with smart corners
  const r = cornerRadius;
  const padding = 0;

  ctx.moveTo(minX + r, minY - padding);
  ctx.lineTo(maxX - r, minY - padding);
  ctx.quadraticCurveTo(maxX + padding, minY - padding, maxX + padding, minY + r);
  ctx.lineTo(maxX + padding, maxY - r);
  ctx.quadraticCurveTo(maxX + padding, maxY + padding, maxX - r, maxY + padding);
  ctx.lineTo(minX + r, maxY + padding);
  ctx.quadraticCurveTo(minX - padding, maxY + padding, minX - padding, maxY - r);
  ctx.lineTo(minX - padding, minY + r);
  ctx.quadraticCurveTo(minX - padding, minY - padding, minX + r, minY - padding);
  ctx.closePath();
}

// --- Grid-based contour system for seamless wall rendering ---

type ContourPoint = { x: number; y: number };
type ContourLoop = ContourPoint[];

// Compute the outer contour of a group of wall rectangles using grid occupancy
export function computeContour(
  group: Array<{ x: number; y: number; width: number; height: number }>,
  cellSize: number = 40
): ContourLoop[] {
  // Step 1: Build grid occupancy
  const grid = new Set<string>();
  for (const wall of group) {
    const startGX = Math.round(wall.x / cellSize);
    const startGY = Math.round(wall.y / cellSize);
    const endGX = Math.round((wall.x + wall.width) / cellSize);
    const endGY = Math.round((wall.y + wall.height) / cellSize);
    for (let gx = startGX; gx < endGX; gx++) {
      for (let gy = startGY; gy < endGY; gy++) {
        grid.add(`${gx},${gy}`);
      }
    }
  }

  // Step 2: Extract exterior edges
  type Edge = { x1: number; y1: number; x2: number; y2: number; dir: string };
  const edges: Edge[] = [];

  for (const key of grid) {
    const [gx, gy] = key.split(',').map(Number);
    const wx = gx * cellSize;
    const wy = gy * cellSize;

    if (!grid.has(`${gx},${gy - 1}`)) {
      edges.push({ x1: wx, y1: wy, x2: wx + cellSize, y2: wy, dir: 'right' });
    }
    if (!grid.has(`${gx + 1},${gy}`)) {
      edges.push({ x1: wx + cellSize, y1: wy, x2: wx + cellSize, y2: wy + cellSize, dir: 'down' });
    }
    if (!grid.has(`${gx},${gy + 1}`)) {
      edges.push({ x1: wx + cellSize, y1: wy + cellSize, x2: wx, y2: wy + cellSize, dir: 'left' });
    }
    if (!grid.has(`${gx - 1},${gy}`)) {
      edges.push({ x1: wx, y1: wy + cellSize, x2: wx, y2: wy, dir: 'up' });
    }
  }

  // Step 3: Chain edges into loops
  const edgesByStart = new Map<string, Edge[]>();
  for (const e of edges) {
    const key = `${e.x1},${e.y1}`;
    if (!edgesByStart.has(key)) edgesByStart.set(key, []);
    edgesByStart.get(key)!.push(e);
  }

  // "Turn right" priority for CW traversal at junctions
  const turnPriority: Record<string, string[]> = {
    'right': ['down', 'right', 'up'],
    'down': ['left', 'down', 'right'],
    'left': ['up', 'left', 'down'],
    'up': ['right', 'up', 'left'],
  };

  const used = new Set<Edge>();
  const loops: ContourLoop[] = [];

  for (const edge of edges) {
    if (used.has(edge)) continue;

    const loop: ContourLoop = [];
    let current = edge;

    while (!used.has(current)) {
      used.add(current);
      loop.push({ x: current.x1, y: current.y1 });

      const nextKey = `${current.x2},${current.y2}`;
      const candidates = edgesByStart.get(nextKey)?.filter(e => !used.has(e));
      if (!candidates || candidates.length === 0) break;

      if (candidates.length === 1) {
        current = candidates[0];
      } else {
        const priority = turnPriority[current.dir];
        let found = false;
        for (const dir of priority) {
          const match = candidates.find(c => c.dir === dir);
          if (match) {
            current = match;
            found = true;
            break;
          }
        }
        if (!found) current = candidates[0];
      }
    }

    if (loop.length >= 3) {
      loops.push(loop);
    }
  }

  // Step 4: Simplify - remove collinear midpoints
  return loops.map(loop => {
    const n = loop.length;
    if (n < 3) return loop;

    const simplified: ContourPoint[] = [];
    for (let i = 0; i < n; i++) {
      const prev = loop[(i - 1 + n) % n];
      const curr = loop[i];
      const next = loop[(i + 1) % n];

      const dx1 = Math.sign(curr.x - prev.x);
      const dy1 = Math.sign(curr.y - prev.y);
      const dx2 = Math.sign(next.x - curr.x);
      const dy2 = Math.sign(next.y - curr.y);

      if (dx1 !== dx2 || dy1 !== dy2) {
        simplified.push(curr);
      }
    }

    return simplified.length >= 3 ? simplified : loop;
  });
}

// Build a canvas path from contour loops with rounded convex corners
function buildContourPath(
  ctx: CanvasRenderingContext2D,
  loops: ContourLoop[],
  cornerRadius: number = 16
): void {
  ctx.beginPath();

  for (const loop of loops) {
    const n = loop.length;
    if (n < 3) continue;

    for (let i = 0; i < n; i++) {
      const prev = loop[(i - 1 + n) % n];
      const curr = loop[i];
      const next = loop[(i + 1) % n];

      // Cross product: positive = right turn = convex for CW loop
      const cross = (curr.x - prev.x) * (next.y - curr.y) - (curr.y - prev.y) * (next.x - curr.x);
      const isConvex = cross > 0;

      if (isConvex && cornerRadius > 0) {
        const dx1 = Math.sign(curr.x - prev.x);
        const dy1 = Math.sign(curr.y - prev.y);
        const dx2 = Math.sign(next.x - curr.x);
        const dy2 = Math.sign(next.y - curr.y);

        const t1x = curr.x - dx1 * cornerRadius;
        const t1y = curr.y - dy1 * cornerRadius;
        const t2x = curr.x + dx2 * cornerRadius;
        const t2y = curr.y + dy2 * cornerRadius;

        if (i === 0) {
          ctx.moveTo(t1x, t1y);
        } else {
          ctx.lineTo(t1x, t1y);
        }
        ctx.quadraticCurveTo(curr.x, curr.y, t2x, t2y);
      } else {
        if (i === 0) {
          ctx.moveTo(curr.x, curr.y);
        } else {
          ctx.lineTo(curr.x, curr.y);
        }
      }
    }

    ctx.closePath();
  }
}

// Draw white highlights on top edges of the contour
function drawContourTopHighlights(
  ctx: CanvasRenderingContext2D,
  loops: ContourLoop[],
  cornerRadius: number
): void {
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.lineWidth = 2.5;

  for (const loop of loops) {
    const n = loop.length;
    for (let i = 0; i < n; i++) {
      const prev = loop[(i - 1 + n) % n];
      const curr = loop[i];
      const next = loop[(i + 1) % n];
      const nextNext = loop[(i + 2) % n];

      // Top edge: horizontal segment going right (solid region is below)
      if (next.x > curr.x && next.y === curr.y) {
        const crossStart = (curr.x - prev.x) * (next.y - curr.y) - (curr.y - prev.y) * (next.x - curr.x);
        const startRounded = crossStart > 0;

        const crossEnd = (next.x - curr.x) * (nextNext.y - next.y) - (next.y - curr.y) * (nextNext.x - next.x);
        const endRounded = crossEnd > 0;

        const startX = curr.x + (startRounded ? cornerRadius : 0);
        const endX = next.x - (endRounded ? cornerRadius : 0);

        if (endX > startX) {
          ctx.beginPath();
          ctx.moveTo(startX, curr.y + 2);
          ctx.lineTo(endX, curr.y + 2);
          ctx.stroke();
        }
      }
    }
  }
}

// Helper: Add frost gloss effect to top of wall group
function addFrostGloss(
  ctx: CanvasRenderingContext2D,
  minX: number,
  minY: number,
  maxX: number
): void {
  const centerX = (minX + maxX) / 2;
  const width = maxX - minX;

  // Create radial gradient for frost shine
  const gloss = ctx.createRadialGradient(
    centerX, minY, 0,
    centerX, minY, width * 0.8
  );
  gloss.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
  gloss.addColorStop(0.4, 'rgba(255, 255, 255, 0.06)');
  gloss.addColorStop(1, 'rgba(255, 255, 255, 0)');

  ctx.fillStyle = gloss;
  ctx.fillRect(minX - 10, minY - 10, maxX - minX + 20, 40);
}

// Helper: Check if a wall group is "simple" (can use unified blob rendering)
export function isSimpleGroup(
  group: Array<{ x: number; y: number; width: number; height: number }>
): boolean {
  if (group.length === 1) return true;

  // Check if all walls are collinear (all horizontal OR all vertical)
  const allHorizontal = group.every(w => w.width > w.height);
  const allVertical = group.every(w => w.height > w.width);

  if (allHorizontal || allVertical) return true;

  // Check if group is solid (fills >80% of bounding box)
  const minX = Math.min(...group.map(w => w.x));
  const minY = Math.min(...group.map(w => w.y));
  const maxX = Math.max(...group.map(w => w.x + w.width));
  const maxY = Math.max(...group.map(w => w.y + w.height));

  const boundingArea = (maxX - minX) * (maxY - minY);
  const totalWallArea = group.reduce((sum, w) => sum + w.width * w.height, 0);

  return totalWallArea / boundingArea > 0.8;
}

// Render complex wall groups using unified contour path (no internal seams)
function renderComplexGroup(
  ctx: CanvasRenderingContext2D,
  group: Array<{ x: number; y: number; width: number; height: number }>,
  precomputedContour?: ContourLoop[]
): void {
  const contour = precomputedContour ?? computeContour(group);

  // Build unified path from contour
  buildContourPath(ctx, contour, 16);

  // Compute bounding box for gradient
  const minX = Math.min(...group.map(w => w.x));
  const minY = Math.min(...group.map(w => w.y));
  const maxX = Math.max(...group.map(w => w.x + w.width));
  const maxY = Math.max(...group.map(w => w.y + w.height));

  // Single gradient fill for entire shape
  const gradient = ctx.createLinearGradient(0, minY, 0, maxY);
  gradient.addColorStop(0, '#f0f9ff');
  gradient.addColorStop(0.4, '#d4ebf7');
  gradient.addColorStop(1, '#b8dff0');
  ctx.fillStyle = gradient;

  // Single shadow (no doubling at overlaps)
  ctx.shadowColor = 'rgba(100, 150, 200, 0.35)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 3;
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Single outline stroke (no internal seams)
  ctx.strokeStyle = '#90caf9';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Top edge highlights from contour
  drawContourTopHighlights(ctx, contour, 16);

  // Frost gloss and crystal stipple
  addFrostGloss(ctx, minX, minY, maxX);
  addCrystalStipple(ctx, group);
}

// Helper: Add stippled crystal dots texture
function addCrystalStipple(
  ctx: CanvasRenderingContext2D,
  group: Array<{ x: number; y: number; width: number; height: number }>
): void {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)'; // Increased from 0.18 for better visibility

  for (const wall of group) {
    // Seeded random for consistent pattern
    let seed = (wall.x * 73856093 + wall.y * 19349663) % 1000000;
    const random = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };

    // Calculate dot count based on area
    const area = wall.width * wall.height;
    const dotCount = Math.floor(area / 250); // Increased from 500 (2x density)

    for (let i = 0; i < dotCount; i++) {
      const x = wall.x + random() * wall.width;
      const y = wall.y + random() * wall.height * 0.85; // Bias toward top
      const size = 1 + random() * 1.5; // 1-2.5px

      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function drawWalls(
  ctx: CanvasRenderingContext2D,
  walls: Array<{ x: number; y: number; width: number; height: number }>,
  cachedGroups?: Array<Array<{ x: number; y: number; width: number; height: number }>>,
  cachedContours?: Array<ContourLoop[] | null>
): void {
  // Use cached groups if provided, otherwise compute (expensive O(n^2))
  const groups = cachedGroups ?? groupConnectedWalls(walls);

  for (let gi = 0; gi < groups.length; gi++) {
    const group = groups[gi];
    ctx.save();

    // Check if this is a simple or complex group
    if (isSimpleGroup(group)) {
      // Simple group: use unified blob rendering
      const minX = Math.min(...group.map(w => w.x));
      const minY = Math.min(...group.map(w => w.y));
      const maxX = Math.max(...group.map(w => w.x + w.width));
      const maxY = Math.max(...group.map(w => w.y + w.height));

      // Create unified path for the group
      createUnifiedPath(ctx, group, 16);

      // Vertical gradient for depth (top-down lighting)
      const gradient = ctx.createLinearGradient(0, minY, 0, maxY);
      gradient.addColorStop(0, '#f0f9ff');   // Lighter at top
      gradient.addColorStop(0.4, '#d4ebf7'); // Mid tone
      gradient.addColorStop(1, '#b8dff0');   // Darker at bottom
      ctx.fillStyle = gradient;

      // Shadow for depth
      ctx.shadowColor = 'rgba(100, 150, 200, 0.35)';
      ctx.shadowBlur = 12;
      ctx.shadowOffsetY = 3;
      ctx.fill();

      // Reset shadow
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;

      // Stroke outline
      ctx.strokeStyle = '#90caf9';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Visual Enhancement 1: Frost gloss layer
      addFrostGloss(ctx, minX, minY, maxX);

      // Visual Enhancement 2: Stippled crystal dots
      addCrystalStipple(ctx, group);

      // Add top edge highlight
      ctx.beginPath();
      ctx.moveTo(minX + 16, minY + 2);
      ctx.lineTo(maxX - 16, minY + 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    } else {
      // Complex group: use contour-based rendering (no internal seams)
      const contour = cachedContours?.[gi] ?? undefined;
      renderComplexGroup(ctx, group, contour);
    }

    ctx.restore();
  }
}

// Helper: draw animated flag fabric shape
function drawFlagFabric(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  time: number
): void {
  const w1 = Math.sin(time * 4) * 3;
  const w2 = Math.sin(time * 4 + 1.2) * 2.5;
  const w3 = Math.sin(time * 4 + 2.4) * 2;

  ctx.beginPath();
  ctx.moveTo(x, y - 32);
  ctx.quadraticCurveTo(x + 24 + w1, y - 30, x + 22 + w2, y - 26);
  ctx.quadraticCurveTo(x + 20 - w1, y - 24, x + 22 + w3, y - 22);
  ctx.quadraticCurveTo(x + 24 + w2, y - 18, x, y - 16);
  ctx.closePath();
}

export function drawFlag(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  team: Team,
  dropped: boolean,
  time: number = 0
): void {
  ctx.save();

  // Draw pole
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - 32);
  ctx.strokeStyle = "#888";
  ctx.lineWidth = 4;
  ctx.stroke();

  // Draw pole tip sparkle
  ctx.beginPath();
  ctx.arc(x, y - 32, 2.5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.fill();

  // Draw flag fabric with animated wave pattern
  drawFlagFabric(ctx, x, y, time);

  // Add vertical gradient (lighter at top, darker at bottom)
  const baseColor = team === "red" ? "#e53935" : "#1976d2";
  const darkColor = team === "red" ? "#c62828" : "#0d47a1";
  const gradient = ctx.createLinearGradient(x, y - 32, x, y - 16);
  gradient.addColorStop(0, baseColor);
  gradient.addColorStop(1, darkColor);

  ctx.fillStyle = gradient;
  ctx.globalAlpha = dropped ? 0.7 : 1;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.restore();
}

export function drawGhostFlag(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  team: Team,
  time: number = 0
): void {
  ctx.save();

  // Draw pole (semi-transparent)
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - 32);
  ctx.strokeStyle = "#888";
  ctx.lineWidth = 4;
  ctx.globalAlpha = 0.2;
  ctx.stroke();

  // Draw flag fabric with animated wave pattern (very transparent)
  drawFlagFabric(ctx, x, y, time);

  // Fill with team color at very low opacity
  ctx.fillStyle = team === "red" ? "#e53935" : "#1976d2";
  ctx.globalAlpha = 0.2;
  ctx.fill();

  // Outline at low opacity
  ctx.strokeStyle = team === "red" ? "#e53935" : "#1976d2";
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.3;
  ctx.stroke();

  ctx.restore();
}

export function drawCarriedFlag(
  ctx: CanvasRenderingContext2D,
  playerX: number,
  playerY: number,
  playerRadius: number,
  team: Team,
  time: number = 0
): void {
  // Position flag on right shoulder (full size, not scaled)
  const flagX = playerX + 12; // Offset to right shoulder
  const flagBaseY = playerY - playerRadius / 2;

  // Draw pole (same size as regular flag: 32px)
  ctx.beginPath();
  ctx.moveTo(flagX, flagBaseY);
  ctx.lineTo(flagX, flagBaseY - 32);
  ctx.strokeStyle = "#888";
  ctx.lineWidth = 4;
  ctx.stroke();

  // Draw flag fabric with animated wave pattern
  drawFlagFabric(ctx, flagX, flagBaseY, time);
  ctx.fillStyle = team === "red" ? "#e53935" : "#1976d2";
  ctx.globalAlpha = 1;
  ctx.fill();
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 2;
  ctx.stroke();
}

export function drawPlayer(
  ctx: CanvasRenderingContext2D,
  player: Player,
  playerRadius: number,
  flags?: { red?: FlagState; blue?: FlagState },
  time: number = 0
): void {
  ctx.save();

  // Calculate movement for animations
  const speed = Math.sqrt((player.vx ?? 0) ** 2 + (player.vy ?? 0) ** 2);
  const moveAngle = Math.atan2(player.vy ?? 0, player.vx ?? 0);
  const isMoving = speed > 50; // Threshold for showing movement effects

  // Draw movement trail (like snowballs) if moving fast
  if (speed > 150) {
    const normalizedVx = (player.vx ?? 0) / speed;
    const normalizedVy = (player.vy ?? 0) / speed;

    for (let i = 1; i <= 2; i++) {
      const trailX = player.x - normalizedVx * i * 5;
      const trailY = player.y - normalizedVy * i * 5;
      const trailOpacity = 0.15 - (i * 0.05);

      ctx.globalAlpha = trailOpacity;
      ctx.beginPath();
      ctx.arc(trailX, trailY, playerRadius * 0.8, 0, Math.PI * 2);
      ctx.fillStyle = player.team === "red" ? "#e53935" : "#1976d2";
      ctx.fill();
    }
    ctx.globalAlpha = 1.0;
  }

  // Add glow for flag carriers
  if (player.carryingFlag) {
    ctx.save();
    ctx.shadowColor = player.team === "red" ? "#e53935" : "#1976d2";
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.arc(player.x, player.y, playerRadius * 1.1, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.01)'; // Nearly transparent
    ctx.fill();
    ctx.restore();
  }

  // Draw carried flag if any (in flag's team color)
  if (player.carryingFlag && flags) {
    const carriedFlag = flags[player.carryingFlag];
    if (carriedFlag && carriedFlag.carriedBy === player.id) {
      drawCarriedFlag(ctx, player.x, player.y, playerRadius, player.carryingFlag, time);
    }
  }

  // Shadow
  ctx.beginPath();
  ctx.ellipse(
    player.x,
    player.y + playerRadius * 0.5,
    playerRadius * 0.9,
    playerRadius * 0.4,
    0,
    0,
    Math.PI * 2,
  );
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = "#222";
  ctx.fill();
  ctx.globalAlpha = 1;

  // Apply body lean based on movement direction
  if (isMoving) {
    ctx.translate(player.x, player.y);
    // Combine both horizontal and vertical movement for full directional lean
    ctx.rotate((Math.sin(moveAngle) * 0.08 + Math.cos(moveAngle) * 0.08)); // Slight lean in movement direction
    ctx.translate(-player.x, -player.y);
  }

  // Body (jacket) - team color
  ctx.beginPath();
  ctx.arc(player.x, player.y, playerRadius * 0.95, 0, Math.PI * 2);
  let bodyColor = "#1976d2";
  let bodyStroke = "#0d47a1";
  if (player.team === "red") {
    bodyColor = "#e53935";
    bodyStroke = "#b71c1c";
  }
  ctx.fillStyle = player.hit
    ? player.team === "red"
      ? "#ffb3b3"
      : "#90caf9"
    : bodyColor;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = bodyStroke;
  ctx.stroke();

  // Head (face)
  const headX = player.x;
  const headY = player.y - playerRadius * 0.55;
  const headRadius = playerRadius * 0.45;

  ctx.beginPath();
  ctx.arc(headX, headY, headRadius, 0, Math.PI * 2);
  ctx.fillStyle = "#fffde7";
  ctx.fill();
  ctx.strokeStyle = "#bdbdbd";
  ctx.stroke();

  // Snow hat (main part) - tilts opposite to body lean (draw BEFORE eyes so eyes appear on top)
  // Combine both horizontal (cos) and vertical (sin) movement for full directional tilt
  const hatTilt = isMoving ? -(Math.sin(moveAngle) * 0.08 + Math.cos(moveAngle) * 0.08) : 0;
  ctx.save();
  ctx.translate(player.x, player.y - playerRadius * 0.85);
  ctx.rotate(hatTilt);
  ctx.translate(-player.x, -(player.y - playerRadius * 0.85));

  ctx.beginPath();
  ctx.arc(
    player.x,
    player.y - playerRadius * 0.85,
    playerRadius * 0.32,
    0,
    Math.PI * 2,
  );
  ctx.fillStyle = "#e3f2fd";
  ctx.fill();
  ctx.strokeStyle = "#90caf9";
  ctx.stroke();

  // Snow hat pom-pom
  ctx.beginPath();
  ctx.arc(
    player.x,
    player.y - playerRadius * 1.13,
    playerRadius * 0.13,
    0,
    Math.PI * 2,
  );
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.strokeStyle = "#b3e5fc";
  ctx.stroke();

  ctx.restore(); // Restore from hat tilt

  // Eyes - change expression based on state (draw AFTER hat so they appear on top)
  const eyeOffsetX = headRadius * 0.35;
  const eyeY = headY - headRadius * 0.1;

  if (player.hit) {
    // Stunned: X eyes
    const drawX = (cx: number, cy: number, size: number) => {
      ctx.strokeStyle = "#333";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - size, cy - size);
      ctx.lineTo(cx + size, cy + size);
      ctx.moveTo(cx + size, cy - size);
      ctx.lineTo(cx - size, cy + size);
      ctx.stroke();
    };
    drawX(headX - eyeOffsetX, eyeY, 3);
    drawX(headX + eyeOffsetX, eyeY, 3);
  } else if (speed > 200) {
    // Moving fast: squinted eyes (effort)
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(headX - eyeOffsetX - 3, eyeY);
    ctx.lineTo(headX - eyeOffsetX + 3, eyeY);
    ctx.moveTo(headX + eyeOffsetX - 3, eyeY);
    ctx.lineTo(headX + eyeOffsetX + 3, eyeY);
    ctx.stroke();
  } else if (player.carryingFlag) {
    // Carrying flag: determined eyes (filled circles, slightly larger)
    ctx.fillStyle = "#333";
    ctx.beginPath();
    ctx.arc(headX - eyeOffsetX, eyeY, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(headX + eyeOffsetX, eyeY, 3.5, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Normal: round eyes with highlights
    ctx.fillStyle = "#333";
    ctx.beginPath();
    ctx.arc(headX - eyeOffsetX, eyeY, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(headX + eyeOffsetX, eyeY, 3, 0, Math.PI * 2);
    ctx.fill();

    // Eye highlights
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(headX - eyeOffsetX + 1, eyeY - 1, 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(headX + eyeOffsetX + 1, eyeY - 1, 1.2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore(); // Restore from body lean
}

export function drawPlayerNickname(
  ctx: CanvasRenderingContext2D,
  player: Player,
  playerRadius: number
): void {
  const nickname = player.nickname?.trim();
  if (!nickname) return; // Don't render if no nickname

  ctx.save();

  // Position below player (closer than before)
  const textY = player.y + playerRadius + 4;

  // Text styling
  ctx.font = "bold 14px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  // Draw text
  ctx.fillStyle = "#1e293b";
  ctx.fillText(nickname, player.x, textY);

  ctx.restore();
}

export function drawCorpse(
  ctx: CanvasRenderingContext2D,
  deathX: number,
  deathY: number,
  team: Team,
  playerRadius: number,
  deadTime: number,
): void {
  const elapsed = Date.now() - deadTime;
  const fadeProgress = Math.min(elapsed / 3000, 1);

  ctx.save();
  ctx.globalAlpha = 0.6 - fadeProgress * 0.4; // Fade from 0.6 to 0.2

  // Body circle (same shape as alive player, desaturated color)
  const corpseColor = team === "red" ? "#d4a0a0" : "#a0b8d4";
  const corpseStroke = team === "red" ? "#b08080" : "#8098b0";
  ctx.beginPath();
  ctx.arc(deathX, deathY, playerRadius * 0.95, 0, Math.PI * 2);
  ctx.fillStyle = corpseColor;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = corpseStroke;
  ctx.stroke();

  // Head
  const headY = deathY - playerRadius * 0.55;
  const headRadius = playerRadius * 0.45;
  ctx.beginPath();
  ctx.arc(deathX, headY, headRadius, 0, Math.PI * 2);
  ctx.fillStyle = "#f5f0d0";
  ctx.fill();
  ctx.strokeStyle = "#bdbdbd";
  ctx.stroke();

  // Hollow circle eyes (stroked, not filled — distinguishes from stun X-eyes)
  const eyeOffsetX = headRadius * 0.35;
  const eyeY = headY - headRadius * 0.1;
  const eyeRadius = 3;
  ctx.strokeStyle = "#555";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(deathX - eyeOffsetX, eyeY, eyeRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(deathX + eyeOffsetX, eyeY, eyeRadius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

export function drawSnowballs(
  ctx: CanvasRenderingContext2D,
  snowballs: Snowball[],
  snowballRadius: number
): void {
  for (const s of snowballs) {
    ctx.save();

    // All snowballs use same snow colors
    const midColor = '#e3f2fd';   // light blue tint
    const darkColor = '#b3e5fc';  // darker blue for edge

    // Draw motion trail (3 fading circles behind the snowball)
    const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
    if (speed > 10) {  // Only show trail if moving
      const normalizedVx = s.vx / speed;
      const normalizedVy = s.vy / speed;

      for (let i = 1; i <= 3; i++) {
        const trailX = s.x - normalizedVx * i * 3.5;
        const trailY = s.y - normalizedVy * i * 3.5;
        const trailOpacity = 0.6 - (i * 0.15);  // Increased from 0.3 - (i * 0.08) for better visibility
        const trailRadius = snowballRadius * (1 - i * 0.15);

        ctx.globalAlpha = trailOpacity;
        ctx.beginPath();
        ctx.arc(trailX, trailY, trailRadius, 0, Math.PI * 2);
        ctx.fillStyle = midColor;  // Use light blue tint instead of pure white for better visibility
        ctx.fill();
      }
      ctx.globalAlpha = 1.0;
    }

    // Add subtle shadow beneath snowball
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;

    // Draw snowball body
    ctx.beginPath();
    ctx.arc(s.x, s.y, snowballRadius, 0, Math.PI * 2);
    ctx.fillStyle = midColor;
    ctx.fill();
    ctx.strokeStyle = darkColor;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Add highlight for 3D effect (small white arc at top-left)
    ctx.beginPath();
    ctx.arc(s.x - snowballRadius * 0.25, s.y - snowballRadius * 0.25, snowballRadius * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fill();

    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Add sparkle/shine effect (small white dots for icy appearance)
    const sparkles = [
      { angle: 0.5, distance: 0.4, size: 1.5 },
      { angle: 2.1, distance: 0.6, size: 1 },
      { angle: 3.8, distance: 0.5, size: 1.2 },
    ];

    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    sparkles.forEach(sparkle => {
      const sx = s.x + Math.cos(sparkle.angle) * snowballRadius * sparkle.distance;
      const sy = s.y + Math.sin(sparkle.angle) * snowballRadius * sparkle.distance;
      ctx.beginPath();
      ctx.arc(sx, sy, sparkle.size, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.restore();
  }
}

export function drawScoreDisplay(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  redScore: number,
  blueScore: number,
  timeRemaining?: number
): void {
  ctx.save();

  // Position at bottom (30px from bottom edge for larger text)
  const bottomY = canvasHeight - 30;

  // Format timer as M:SS
  let clockText = "";
  if (timeRemaining !== undefined) {
    const minutes = Math.floor(timeRemaining / 60);
    const seconds = Math.floor(timeRemaining % 60);
    clockText = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  // Calculate positions with fixed clock width
  const centerX = canvasWidth / 2;
  ctx.font = "bold 24px monospace";
  const clockWidth = ctx.measureText(clockText || "00:00").width;
  const spacing = 50;

  const leftScoreX = centerX - clockWidth / 2 - spacing;
  const clockX = centerX;
  const rightScoreX = centerX + clockWidth / 2 + spacing;

  ctx.textBaseline = "middle";

  // Draw red score (left) with team-colored glow
  ctx.font = "bold 36px sans-serif";
  ctx.textAlign = "right";
  // Draw glow first
  ctx.shadowColor = "#e53935";
  ctx.shadowBlur = 15;
  ctx.fillStyle = "#e53935";
  ctx.fillText(`${redScore}`, leftScoreX, bottomY);
  // Reset shadow
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  // Draw outline
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 4;
  ctx.strokeText(`${redScore}`, leftScoreX, bottomY);
  // Draw fill on top
  ctx.fillStyle = "#e53935";
  ctx.fillText(`${redScore}`, leftScoreX, bottomY);

  // Draw clock (center)
  if (clockText) {
    ctx.font = "bold 24px monospace";
    ctx.textAlign = "center";
    // Draw outline first
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 3;
    ctx.strokeText(clockText, clockX, bottomY + 2);
    // Draw fill on top
    ctx.fillStyle = "#fff";
    ctx.fillText(clockText, clockX, bottomY + 2);
  }

  // Draw blue score (right) with team-colored glow
  ctx.font = "bold 36px sans-serif";
  ctx.textAlign = "left";
  // Draw glow first
  ctx.shadowColor = "#1976d2";
  ctx.shadowBlur = 15;
  ctx.fillStyle = "#1976d2";
  ctx.fillText(`${blueScore}`, rightScoreX, bottomY);
  // Reset shadow
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  // Draw outline
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 4;
  ctx.strokeText(`${blueScore}`, rightScoreX, bottomY);
  // Draw fill on top
  ctx.fillStyle = "#1976d2";
  ctx.fillText(`${blueScore}`, rightScoreX, bottomY);

  ctx.restore();
}

export function drawAmmoBar(
  ctx: CanvasRenderingContext2D,
  _canvasWidth: number,
  canvasHeight: number,
  ammo: number,
  lastAmmoRechargeTime: number,
  maxAmmo: number,
  rechargeTime: number,
): void {
  if (ammo >= maxAmmo) return;

  ctx.save();

  // Smooth fill: interpolate partial recharge progress
  const now = Date.now();
  const partial = lastAmmoRechargeTime
    ? Math.min((now - lastAmmoRechargeTime) / rechargeTime, 1)
    : 0;
  const fillFraction = (ammo + partial) / maxAmmo;

  const barWidth = 120;
  const barHeight = 8;
  const x = 20;
  const y = canvasHeight - 50;
  const radius = 4;

  // Drop shadow for contrast against any background
  ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;

  // Background
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.beginPath();
  ctx.roundRect(x, y, barWidth, barHeight, radius);
  ctx.fill();

  // Reset shadow before fill/outline
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Fill
  const fillWidth = barWidth * fillFraction;
  if (fillWidth > 0) {
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.roundRect(x, y, fillWidth, barHeight, radius);
    ctx.fill();
  }

  // Outline
  ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, barWidth, barHeight, radius);
  ctx.stroke();

  ctx.restore();
}

// Particle system rendering
export function drawParticles(
  ctx: CanvasRenderingContext2D,
  particles: Particle[]
): void {
  ctx.save();

  for (const p of particles) {
    const alpha = p.life; // life goes from 1 to 0
    if (alpha <= 0) continue;

    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
  }

  ctx.globalAlpha = 1.0;
  ctx.restore();
}

// Helper to create impact particles when snowball hits something
export function createImpactParticles(
  x: number,
  y: number,
  vx: number,
  vy: number
): Particle[] {
  const particles: Particle[] = [];
  const count = 10;
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const speed = 100 + Math.random() * 100;

    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed - vx * 0.3, // Deflect based on incoming velocity
      vy: Math.sin(angle) * speed - vy * 0.3,
      life: 1.0,
      maxLife: 400, // 400ms lifetime
      size: 2 + Math.random() * 2,
      color: '#e3f2fd',
      type: 'impact',
      createdAt: now
    });
  }

  return particles;
}

// Helper to create celebration particles when flag is captured
export function createCelebrationParticles(
  x: number,
  y: number,
  team: Team
): Particle[] {
  const particles: Particle[] = [];
  const count = 30;
  const now = Date.now();
  const color = team === "red" ? "#e53935" : "#1976d2";

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 150 + Math.random() * 150;

    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 200, // Upward bias
      life: 1.0,
      maxLife: 800, // 800ms lifetime
      size: 3 + Math.random() * 3,
      color,
      type: 'celebration',
      createdAt: now
    });
  }

  return particles;
}

// Update particles (call this every frame)
export function updateParticles(
  particles: Particle[],
  dt: number
): Particle[] {
  const now = Date.now();
  const gravity = 600; // pixels per second squared

  return particles
    .map(p => {
      const age = now - p.createdAt;
      const newLife = 1 - (age / p.maxLife);

      if (newLife <= 0) return null; // Mark for removal

      return {
        ...p,
        x: p.x + p.vx * dt,
        y: p.y + p.vy * dt,
        vy: p.vy + gravity * dt, // Apply gravity
        life: newLife
      };
    })
    .filter((p): p is Particle => p !== null); // Remove dead particles
}
