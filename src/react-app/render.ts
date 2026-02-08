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

  // Draw flag fabric with wave pattern
  ctx.beginPath();
  ctx.moveTo(x, y - 32);
  // Wave pattern on right edge
  ctx.quadraticCurveTo(x + 24, y - 30, x + 22, y - 26);
  ctx.quadraticCurveTo(x + 20, y - 24, x + 22, y - 22);
  ctx.quadraticCurveTo(x + 24, y - 18, x, y - 16);
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

export function drawGhostFlag(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  team: Team
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

  // Draw flag fabric with wave pattern (very transparent)
  ctx.beginPath();
  ctx.moveTo(x, y - 32);
  // Wave pattern on right edge (same as regular flag)
  ctx.quadraticCurveTo(x + 24, y - 30, x + 22, y - 26);
  ctx.quadraticCurveTo(x + 20, y - 24, x + 22, y - 22);
  ctx.quadraticCurveTo(x + 24, y - 18, x, y - 16);
  ctx.closePath();

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
  team: Team
): void {
  // Draw pole
  ctx.beginPath();
  ctx.moveTo(playerX, playerY - playerRadius * 1.3);
  ctx.lineTo(playerX, playerY - playerRadius * 1.7);
  ctx.strokeStyle = "#888";
  ctx.lineWidth = 4;
  ctx.stroke();

  // Draw flag fabric with wave pattern (scaled to player)
  ctx.beginPath();
  const top = playerY - playerRadius * 1.7;
  const bottom = playerY - playerRadius * 1.4;
  const mid = (top + bottom) / 2;
  ctx.moveTo(playerX, top);
  // Wave pattern on right edge
  ctx.quadraticCurveTo(playerX + 20, top + 2, playerX + 18, mid - 2);
  ctx.quadraticCurveTo(playerX + 16, mid, playerX + 18, mid + 2);
  ctx.quadraticCurveTo(playerX + 20, bottom - 2, playerX, bottom);
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

  // Draw red score (left)
  ctx.fillStyle = "#e53935";
  ctx.font = "bold 36px sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(`${redScore}`, leftScoreX, bottomY);

  // Draw clock (center) - original size
  if (clockText) {
    ctx.fillStyle = "#333";
    ctx.font = "bold 24px monospace";
    ctx.textAlign = "center";
    ctx.fillText(clockText, clockX, bottomY + 2);
  }

  // Draw blue score (right)
  ctx.fillStyle = "#1976d2";
  ctx.font = "bold 36px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`${blueScore}`, rightScoreX, bottomY);

  ctx.restore();
}
