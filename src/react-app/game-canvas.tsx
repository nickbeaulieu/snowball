import { WALLS } from "../walls";
import { useEffect, useRef } from "react";

import {
  ACCELERATION,
  FRICTION,
  MAX_SPEED,
  DT,
  CORRECTION_DURATION,
  CORRECTION_THRESHOLD,
  SNOWBALL_RADIUS,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  PLAYER_RADIUS,
  GRID_SIZE,
} from "../constants";

import type { Player, ServerSnapshot, Snowball, RoomConfig } from "../types";

import {
  drawGridBackground,
  drawWorldBorder,
  drawWalls,
  drawGoalZones,
  drawFlag,
  drawPlayer,
  drawSnowballs,
  drawScoreDisplay,
} from "./render";

let inputSeq = 0;
type InputMsg = {
  seq: number;
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
};

// ...constants imported from ../constants

type GameCanvasProps = {
  websocket: WebSocket;
  config: RoomConfig;
  clientId: string;
};

export function GameCanvas({ websocket, config, clientId }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Setup canvas for Retina/high-DPI displays
  function setupCanvasForRetina(canvas: HTMLCanvasElement): number {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    // Set backing store size to physical pixels
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    // Get context and scale to compensate for DPR
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
    }

    return dpr;
  }

  const playerIdRef = useRef<string>(clientId);

  // Buffer of recent server snapshots for interpolation
  const snapshotBufferRef = useRef<ServerSnapshot[]>([]);

  const predictedPlayerRef = useRef<Player | null>(null);
  // For robust smoothing corrections (blend both position and velocity)
  const correctionStartRef = useRef<{
    x: number;
    y: number;
    vx: number;
    vy: number;
  } | null>(null);
  const correctionTargetRef = useRef<{
    x: number;
    y: number;
    vx: number;
    vy: number;
  } | null>(null);
  const correctionStartTimeRef = useRef<number>(0);

  const keysRef = useRef<Record<string, boolean>>({});

  // Store pending input messages for client-side prediction
  const pendingInputsRef = useRef<InputMsg[]>([]);

  // Store time remaining for access in render loop (updated from game state)
  const timeRemainingRef = useRef<number | undefined>(undefined);

  // Track when the player last threw a snowball (for cooldown)
  const lastThrowTimeRef = useRef<number>(0);
  // Handle snowball throw input (spacebar or mouse click)
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        const player = predictedPlayerRef.current;
        if (player && player.carryingFlag) {
          websocket.send(JSON.stringify({ type: "drop_flag" }));
        }
      }
    };
    window.addEventListener("keydown", handleKey);

    const handleMouse = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      // Camera follow: get camera offset
      let camX = 0,
        camY = 0;
      if (predictedPlayerRef.current && canvas) {
        const dpr = window.devicePixelRatio || 1;
        const logicalWidth = canvas.width / dpr;
        const logicalHeight = canvas.height / dpr;
        camX = predictedPlayerRef.current.x - logicalWidth / 2;
        camY = predictedPlayerRef.current.y - logicalHeight / 2;
        camX = Math.max(0, Math.min(WORLD_WIDTH - logicalWidth, camX));
        camY = Math.max(0, Math.min(WORLD_HEIGHT - logicalHeight, camY));
      }
      // Mouse position in world coordinates
      const mouseX = e.clientX - rect.left + camX;
      const mouseY = e.clientY - rect.top + camY;
      const player = predictedPlayerRef.current;
      if (!player) return;
      // Player is at (player.x, player.y) in world coordinates
      const dx = mouseX - player.x;
      const dy = mouseY - player.y;
      const len = Math.hypot(dx, dy);
      if (len === 0) return;
      throwSnowball(dx / len, dy / len);
    };
    const canvas = canvasRef.current;
    if (canvas) canvas.addEventListener("mousedown", handleMouse);

    return () => {
      window.removeEventListener("keydown", handleKey);
      if (canvas) canvas.removeEventListener("mousedown", handleMouse);
    };
    // (removed unused eslint-disable)
  }, []);

  // Helper to throw a snowball in a given direction (or current movement if not specified)
  function throwSnowball(dirX?: number, dirY?: number) {
    const now = performance.now() / 1000;
    if (now - lastThrowTimeRef.current < 0.2) return; // 200ms cooldown
    lastThrowTimeRef.current = now;
    const player = predictedPlayerRef.current;
    if (!player) return;
    let dx = dirX;
    let dy = dirY;
    if (dx === undefined || dy === undefined) {
      dx = player.vx ?? 0;
      dy = player.vy ?? 0;
      if (dx === 0 && dy === 0) {
        dy = -1; // default up
      }
      const len = Math.hypot(dx, dy);
      if (len === 0) return;
      dx /= len;
      dy /= len;
    }
    websocket.send(
      JSON.stringify({
        type: "throw",
        dir: { x: dx, y: dy },
      }),
    );
  }

  /* ---------------- WebSocket ---------------- */

  // Setup WebSocket message handler
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      const msg = JSON.parse(e.data);
      if (msg.type !== "state") return;

      // Update time remaining from game state
      timeRemainingRef.current = msg.state.timeRemaining;

      // Buffer the snapshot for interpolation
      snapshotBufferRef.current.push(msg);
      if (snapshotBufferRef.current.length > 20) {
        snapshotBufferRef.current.shift();
      }

      // Use new state structure
      const me = msg.state.players.find(
        (p: Player) => p.id === playerIdRef.current,
      );
      if (!me) return;

      if (!predictedPlayerRef.current) {
        predictedPlayerRef.current = { ...me, vx: me.vx ?? 0, vy: me.vy ?? 0 };
        correctionStartRef.current = null;
        correctionTargetRef.current = null;
      } else {
        // Sync non-predicted state from server (flags, hit state, etc.)
        predictedPlayerRef.current.carryingFlag = me.carryingFlag;
        predictedPlayerRef.current.hit = me.hit;
        predictedPlayerRef.current.hitTime = me.hitTime;
        const dx = me.x - predictedPlayerRef.current.x;
        const dy = me.y - predictedPlayerRef.current.y;
        const dvx = (me.vx ?? 0) - (predictedPlayerRef.current.vx ?? 0);
        const dvy = (me.vy ?? 0) - (predictedPlayerRef.current.vy ?? 0);
        const dist = Math.hypot(dx, dy);
        const vdist = Math.hypot(dvx, dvy);
        if (dist > CORRECTION_THRESHOLD || vdist > CORRECTION_THRESHOLD) {
          correctionStartRef.current = {
            x: predictedPlayerRef.current.x,
            y: predictedPlayerRef.current.y,
            vx: predictedPlayerRef.current.vx ?? 0,
            vy: predictedPlayerRef.current.vy ?? 0,
          };
          correctionTargetRef.current = {
            x: me.x,
            y: me.y,
            vx: me.vx ?? 0,
            vy: me.vy ?? 0,
          };
          correctionStartTimeRef.current = performance.now() / 1000;
        } else if (dist > 0.01 || vdist > 0.01) {
          correctionStartRef.current = {
            x: predictedPlayerRef.current.x,
            y: predictedPlayerRef.current.y,
            vx: predictedPlayerRef.current.vx ?? 0,
            vy: predictedPlayerRef.current.vy ?? 0,
          };
          correctionTargetRef.current = {
            x: me.x,
            y: me.y,
            vx: me.vx ?? 0,
            vy: me.vy ?? 0,
          };
          correctionStartTimeRef.current = performance.now() / 1000;
        }
      }

      // Reapply only the last unacknowledged input (to match server logic)
      // Reapply all unacknowledged inputs in order (to match server simulation)
      const unacked = pendingInputsRef.current.filter(
        (i) => i.seq > me.lastProcessedInput,
      );
      for (const input of unacked) {
        applyInputPrediction(input);
      }

      // Drop acknowledged inputs
      pendingInputsRef.current = pendingInputsRef.current.filter(
        (i) => i.seq > me.lastProcessedInput,
      );
    };

    websocket.addEventListener("message", handleMessage);

    return () => {
      websocket.removeEventListener("message", handleMessage);
    };
  }, [websocket, clientId]);

  /* ---------------- Keyboard input ---------------- */

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      keysRef.current[e.key] = true;
    };

    const up = (e: KeyboardEvent) => {
      keysRef.current[e.key] = false;
    };

    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);

    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  /* ---------------- Send movement input ---------------- */

  function applyInputPrediction(input: InputMsg) {
    if (!predictedPlayerRef.current) return;

    // Initialize velocity if missing
    if (predictedPlayerRef.current.vx === undefined)
      predictedPlayerRef.current.vx = 0;
    if (predictedPlayerRef.current.vy === undefined)
      predictedPlayerRef.current.vy = 0;

    let ax = 0;
    let ay = 0;

    if (input.up) ay -= 1;
    if (input.down) ay += 1;
    if (input.left) ax -= 1;
    if (input.right) ax += 1;

    if (ax !== 0 || ay !== 0) {
      const len = Math.hypot(ax, ay);
      ax /= len;
      ay /= len;
    }

    // Apply acceleration
    predictedPlayerRef.current.vx += ax * ACCELERATION * DT;
    predictedPlayerRef.current.vy += ay * ACCELERATION * DT;

    // Apply friction (exponential decay)
    predictedPlayerRef.current.vx *= Math.pow(FRICTION, DT);
    predictedPlayerRef.current.vy *= Math.pow(FRICTION, DT);

    // Clamp speed
    const speed = Math.hypot(
      predictedPlayerRef.current.vx,
      predictedPlayerRef.current.vy,
    );
    if (speed > MAX_SPEED) {
      predictedPlayerRef.current.vx =
        (predictedPlayerRef.current.vx / speed) * MAX_SPEED;
      predictedPlayerRef.current.vy =
        (predictedPlayerRef.current.vy / speed) * MAX_SPEED;
    }

    predictedPlayerRef.current.x += predictedPlayerRef.current.vx * DT;
    predictedPlayerRef.current.y += predictedPlayerRef.current.vy * DT;
  }

  useEffect(() => {
    const interval = setInterval(() => {
      const keys = keysRef.current;

      const input: InputMsg = {
        seq: inputSeq++,
        up: !!keys["w"],
        down: !!keys["s"],
        left: !!keys["a"],
        right: !!keys["d"],
      };

      websocket.send(JSON.stringify({ type: "input", ...input }));

      // Store input for prediction and reconciliation
      pendingInputsRef.current.push(input);

      // Apply prediction locally
      applyInputPrediction(input);
    }, 33); // Match server tick (30Hz)

    return () => clearInterval(interval);
  }, []);

  /* ---------------- Render loop ---------------- */

  // Resize canvas to fit window
  useEffect(() => {
    function resize() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      setupCanvasForRetina(canvas);
    }
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // Handle DPR changes (external monitor, browser zoom)
  useEffect(() => {
    let lastDpr = window.devicePixelRatio || 1;

    const checkDprChange = () => {
      const currentDpr = window.devicePixelRatio || 1;
      if (currentDpr !== lastDpr) {
        lastDpr = currentDpr;
        const canvas = canvasRef.current;
        if (canvas) setupCanvasForRetina(canvas);
      }
    };

    // Check for DPR changes using matchMedia
    const mediaQuery = window.matchMedia(`(resolution: ${lastDpr}dppx)`);
    mediaQuery.addEventListener('change', checkDprChange);

    return () => mediaQuery.removeEventListener('change', checkDprChange);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d")!;
    let rafId: number;

    // Interpolation settings
    const INTERP_DELAY = 100; // ms

    function interpolateGameState(
      buffer: ServerSnapshot[],
      renderTime: number,
    ) {
      if (buffer.length === 0) {
        return {
          players: [],
          snowballs: [],
          flags: { red: undefined, blue: undefined },
          scores: { red: 0, blue: 0 },
        };
      }

      if (buffer.length === 1) {
        return buffer[0].state;
      }
      let older: ServerSnapshot | null = null,
        newer: ServerSnapshot | null = null;

      for (let i = buffer.length - 2; i >= 0; --i) {
        const curr = buffer[i];
        const next = buffer[i + 1];
        if (
          curr &&
          next &&
          curr.timestamp !== undefined &&
          next.timestamp !== undefined &&
          curr.timestamp <= renderTime &&
          next.timestamp >= renderTime
        ) {
          older = curr;
          newer = next;
          break;
        }
      }
      if (
        !older ||
        !newer ||
        older.timestamp === undefined ||
        newer.timestamp === undefined
      ) {
        const last = buffer[buffer.length - 1];
        return last.state;
      }
      const t =
        (renderTime - older.timestamp) / (newer.timestamp - older.timestamp);
      // Interpolate players (position only, use newer state for other properties)
      const players = newer.state.players.map((np: Player) => {
        const op = older.state.players.find((p: Player) => p.id === np.id);
        if (!op) return { ...np };
        return {
          ...np, // Use newer snapshot for non-interpolated properties
          x: op.x + (np.x - op.x) * t,
          y: op.y + (np.y - op.y) * t,
          vx: (op.vx ?? 0) + ((np.vx ?? 0) - (op.vx ?? 0)) * t,
          vy: (op.vy ?? 0) + ((np.vy ?? 0) - (op.vy ?? 0)) * t,
        };
      });
      // No interpolation for flags/scores
      return {
        players,
        snowballs: newer.state.snowballs,
        flags: newer.state.flags,
        scores: newer.state.scores,
      };
    }

    const draw = () => {
      // Interpolate remote players
      const now = Date.now();
      const renderTime = now - INTERP_DELAY;
      const { players, snowballs, flags, scores } = interpolateGameState(
        snapshotBufferRef.current,
        renderTime,
      );

      const dpr = window.devicePixelRatio || 1;
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

      // Camera follow logic
      const localPlayer = players.find(
        (p: Player) => p.id === playerIdRef.current,
      );
      let camX = 0,
        camY = 0;
      if (localPlayer) {
        const dpr = window.devicePixelRatio || 1;
        const logicalWidth = canvas.width / dpr;
        const logicalHeight = canvas.height / dpr;
        camX = localPlayer.x - logicalWidth / 2;
        camY = localPlayer.y - logicalHeight / 2;
        // Clamp camera to world bounds
        camX = Math.max(0, Math.min(WORLD_WIDTH - logicalWidth, camX));
        camY = Math.max(0, Math.min(WORLD_HEIGHT - logicalHeight, camY));
      }

      ctx.save();
      ctx.translate(-camX, -camY);

      // Draw grid background
      drawGridBackground(ctx, WORLD_WIDTH, WORLD_HEIGHT, GRID_SIZE);

      // Draw world border
      drawWorldBorder(ctx, WORLD_WIDTH, WORLD_HEIGHT);

      // Draw walls
      drawWalls(ctx, WALLS);

      // Draw goal zones
      drawGoalZones(ctx, WORLD_WIDTH, WORLD_HEIGHT, GRID_SIZE);

      // Draw team flags (if not carried)
      if (flags?.red && !flags.red.carriedBy) {
        drawFlag(ctx, flags.red.x, flags.red.y, "red", flags.red.dropped ?? false);
      }
      if (flags?.blue && !flags.blue.carriedBy) {
        drawFlag(ctx, flags.blue.x, flags.blue.y, "blue", flags.blue.dropped ?? false);
      }

      // Draw all players (including local)
      for (const p of players as Player[]) {
        drawPlayer(ctx, p, PLAYER_RADIUS, flags);
      }

      // Blend both position and velocity for smooth correction (local prediction)
      if (predictedPlayerRef.current) {
        if (correctionTargetRef.current && correctionStartRef.current) {
          const nowSec = performance.now() / 1000;
          let t =
            (nowSec - correctionStartTimeRef.current) / CORRECTION_DURATION;
          t = Math.min(Math.max(t, 0), 1);
          // Optionally use ease-in-out for smoother feel
          const easeT = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
          predictedPlayerRef.current.x =
            correctionStartRef.current.x +
            (correctionTargetRef.current.x - correctionStartRef.current.x) *
              easeT;
          predictedPlayerRef.current.y =
            correctionStartRef.current.y +
            (correctionTargetRef.current.y - correctionStartRef.current.y) *
              easeT;
          predictedPlayerRef.current.vx =
            correctionStartRef.current.vx +
            (correctionTargetRef.current.vx - correctionStartRef.current.vx) *
              easeT;
          predictedPlayerRef.current.vy =
            correctionStartRef.current.vy +
            (correctionTargetRef.current.vy - correctionStartRef.current.vy) *
              easeT;
          if (t >= 1) {
            // Snap to target and clear interpolation
            predictedPlayerRef.current.x = correctionTargetRef.current.x;
            predictedPlayerRef.current.y = correctionTargetRef.current.y;
            predictedPlayerRef.current.vx = correctionTargetRef.current.vx;
            predictedPlayerRef.current.vy = correctionTargetRef.current.vy;
            correctionStartRef.current = null;
            correctionTargetRef.current = null;
          }
        }
        // No need to draw local player separately; all players are drawn above
      }

      // Draw snowballs
      drawSnowballs(ctx, snowballs as Snowball[], SNOWBALL_RADIUS, playerIdRef.current);

      // Draw score display (in screen space)
      ctx.restore();
      const dprScore = window.devicePixelRatio || 1;
      drawScoreDisplay(
        ctx,
        canvas.width / dprScore,
        canvas.height / dprScore,
        scores?.red ?? 0,
        scores?.blue ?? 0,
        timeRemainingRef.current
      );

      rafId = requestAnimationFrame(draw);
    };

    draw();

    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        zIndex: 0,
        display: "block",
      }}
      tabIndex={0}
    />
  );
}
