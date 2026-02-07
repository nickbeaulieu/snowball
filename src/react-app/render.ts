import type { Player, Snowball, FlagState, Team } from "../types";

export function drawGridBackground(
  ctx: CanvasRenderingContext2D,
  worldWidth: number,
  worldHeight: number,
  gridSize: number
): void {
  // Draw off-white grid background
  ctx.fillStyle = "#f9f9f6"; // off-white
  ctx.fillRect(0, 0, worldWidth, worldHeight);

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
  ctx.globalAlpha = 0.7;
  ctx.stroke();
  ctx.globalAlpha = 1;
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

export function drawWalls(
  ctx: CanvasRenderingContext2D,
  walls: Array<{ x: number; y: number; width: number; height: number }>
): void {
  // Draw walls as snow mounds (rounded rectangles)
  for (const wall of walls) {
    ctx.save();
    ctx.beginPath();
    const r = 16; // corner radius for snow mounds
    ctx.moveTo(wall.x + r, wall.y);
    ctx.lineTo(wall.x + wall.width - r, wall.y);
    ctx.quadraticCurveTo(
      wall.x + wall.width,
      wall.y,
      wall.x + wall.width,
      wall.y + r,
    );
    ctx.lineTo(wall.x + wall.width, wall.y + wall.height - r);
    ctx.quadraticCurveTo(
      wall.x + wall.width,
      wall.y + wall.height,
      wall.x + wall.width - r,
      wall.y + wall.height,
    );
    ctx.lineTo(wall.x + r, wall.y + wall.height);
    ctx.quadraticCurveTo(
      wall.x,
      wall.y + wall.height,
      wall.x,
      wall.y + wall.height - r,
    );
    ctx.lineTo(wall.x, wall.y + r);
    ctx.quadraticCurveTo(wall.x, wall.y, wall.x + r, wall.y);
    ctx.closePath();
    ctx.fillStyle = "#e0f7fa";
    ctx.shadowColor = "#b3e5fc";
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#90caf9";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
}

export function drawGoalZones(
  ctx: CanvasRenderingContext2D,
  worldWidth: number,
  worldHeight: number,
  gridSize: number
): void {
  // Draw goal zones (dotted border, grid-aligned, 2x8)
  const goalWidth = gridSize * 2;
  const goalHeight = gridSize * 8;

  ctx.save();
  ctx.setLineDash([8, 8]);

  // Red goal (left)
  ctx.strokeStyle = "#e53935";
  ctx.lineWidth = 4;
  ctx.strokeRect(0, (worldHeight - goalHeight) / 2, goalWidth, goalHeight);

  // Blue goal (right)
  ctx.strokeStyle = "#1976d2";
  ctx.strokeRect(
    worldWidth - goalWidth,
    (worldHeight - goalHeight) / 2,
    goalWidth,
    goalHeight,
  );

  ctx.setLineDash([]);
  ctx.restore();
}

export function drawFlag(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  team: Team,
  dropped: boolean
): void {
  ctx.save();

  // Draw pole
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - 32);
  ctx.strokeStyle = "#888";
  ctx.lineWidth = 4;
  ctx.stroke();

  // Draw flag fabric
  ctx.beginPath();
  ctx.moveTo(x, y - 32);
  ctx.lineTo(x + 22, y - 24);
  ctx.lineTo(x, y - 16);
  ctx.closePath();
  ctx.fillStyle = team === "red" ? "#e53935" : "#1976d2";
  ctx.globalAlpha = dropped ? 0.7 : 1;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.restore();
}

export function drawCarriedFlag(
  ctx: CanvasRenderingContext2D,
  playerX: number,
  playerY: number,
  playerRadius: number,
  team: Team
): void {
  // Draw pole
  ctx.beginPath();
  ctx.moveTo(playerX, playerY - playerRadius * 1.3);
  ctx.lineTo(playerX, playerY - playerRadius * 1.7);
  ctx.strokeStyle = "#888";
  ctx.lineWidth = 4;
  ctx.stroke();

  // Draw flag fabric
  ctx.beginPath();
  ctx.moveTo(playerX, playerY - playerRadius * 1.7);
  ctx.lineTo(playerX + 18, playerY - playerRadius * 1.55);
  ctx.lineTo(playerX, playerY - playerRadius * 1.4);
  ctx.closePath();
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
  flags?: { red?: FlagState; blue?: FlagState }
): void {
  ctx.save();

  // Draw carried flag if any (in flag's team color)
  if (player.carryingFlag && flags) {
    const carriedFlag = flags[player.carryingFlag];
    if (carriedFlag && carriedFlag.carriedBy === player.id) {
      drawCarriedFlag(ctx, player.x, player.y, playerRadius, player.carryingFlag);
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
  ctx.beginPath();
  ctx.arc(
    player.x,
    player.y - playerRadius * 0.55,
    playerRadius * 0.45,
    0,
    Math.PI * 2,
  );
  ctx.fillStyle = "#fffde7";
  ctx.fill();
  ctx.strokeStyle = "#bdbdbd";
  ctx.stroke();

  // Snow hat (main part)
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

  ctx.restore();
}

export function drawSnowballs(
  ctx: CanvasRenderingContext2D,
  snowballs: Snowball[],
  snowballRadius: number,
  localPlayerId: string
): void {
  for (const s of snowballs) {
    ctx.beginPath();
    ctx.arc(s.x, s.y, snowballRadius, 0, Math.PI * 2);
    ctx.fillStyle = s.owner === localPlayerId ? "#ff9800" : "#aaa"; // orange for your snowballs
    ctx.fill();
  }
}

export function drawScoreDisplay(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  redScore: number,
  blueScore: number
): void {
  ctx.save();

  // Draw menu bar background
  ctx.globalAlpha = 0.95;
  ctx.fillStyle = "#f5f5f5";
  ctx.fillRect(0, 0, canvasWidth, 48);
  ctx.globalAlpha = 1;

  // Draw scores
  ctx.font = "bold 24px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.fillStyle = "#e53935";
  ctx.fillText(`Red: ${redScore}`, canvasWidth / 2 - 80, 24);

  ctx.fillStyle = "#1976d2";
  ctx.fillText(`Blue: ${blueScore}`, canvasWidth / 2 + 80, 24);

  ctx.restore();
}
