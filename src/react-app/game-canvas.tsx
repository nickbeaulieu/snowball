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
} from "../constants";

type Player = {
  id: string;
  x: number;
  y: number;
  hit?: boolean;
};

type ServerSnapshot = {
  type: string;
  players: Player[];
  snowballs: Snowball[];
  timestamp: number;
};

type Snowball = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ownerId: string;
  createdAt: number;
};

function getClientId(): string {
  let id = localStorage.getItem("clientId");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("clientId", id);
  }
  return id;
}

let inputSeq = 0;
type InputMsg = {
  seq: number;
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
};

// ...constants imported from ../constants

export function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const playerIdRef = useRef<string>(getClientId());

  // Buffer of recent server snapshots for interpolation
  const snapshotBufferRef = useRef<ServerSnapshot[]>([]);

  const predictedPlayerRef = useRef<
    (Player & { vx?: number; vy?: number }) | null
  >(null);
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

  // Track when the player last threw a snowball (for cooldown)
  const lastThrowTimeRef = useRef<number>(0);
  // Handle snowball throw input (spacebar or mouse click)
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        // Try to drop flag if carrying, else throw snowball
        const player = predictedPlayerRef.current;
        if (player && player.carryingFlag) {
          wsRef.current?.send(JSON.stringify({ type: "drop_flag" }));
        } else {
          throwSnowball();
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
        camX = predictedPlayerRef.current.x - canvas.width / 2;
        camY = predictedPlayerRef.current.y - canvas.height / 2;
        camX = Math.max(0, Math.min(WORLD_WIDTH - canvas.width, camX));
        camY = Math.max(0, Math.min(WORLD_HEIGHT - canvas.height, camY));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    wsRef.current?.send(
      JSON.stringify({
        type: "throw",
        dir: { x: dx, y: dy },
      }),
    );
  }

  /* ---------------- WebSocket ---------------- */

  useEffect(() => {
    if (wsRef.current) return; // StrictMode guard

    const ws = new WebSocket(
      `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/join?room=lobby&clientId=${getClientId()}`,
    );
    wsRef.current = ws;

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type !== "state") return;

      // Buffer the snapshot for interpolation
      snapshotBufferRef.current.push(msg);
      if (snapshotBufferRef.current.length > 20) {
        snapshotBufferRef.current.shift();
      }

      // Use new state structure
      const me = msg.state.players.find(
        (p: any) => p.id === playerIdRef.current,
      );
      if (!me) return;

      if (!predictedPlayerRef.current) {
        predictedPlayerRef.current = { ...me, vx: me.vx ?? 0, vy: me.vy ?? 0 };
        correctionStartRef.current = null;
        correctionTargetRef.current = null;
      } else {
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

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, []);

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

      wsRef.current?.send(JSON.stringify({ type: "input", ...input }));

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
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
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
      if (buffer.length < 2)
        return {
          players: [],
          snowballs: [],
          flags: [],
          scores: { red: 0, blue: 0 },
        };
      let older = null,
        newer = null;
      for (let i = buffer.length - 2; i >= 0; --i) {
        if (
          buffer[i].timestamp <= renderTime &&
          buffer[i + 1].timestamp >= renderTime
        ) {
          older = buffer[i];
          newer = buffer[i + 1];
          break;
        }
      }
      if (!older || !newer) {
        const last = buffer[buffer.length - 1];
        return last.state;
      }
      const t =
        (renderTime - older.timestamp) / (newer.timestamp - older.timestamp);
      // Interpolate players (position only)
      const players = older.state.players.map((op: any) => {
        const np = newer.state.players.find((p: any) => p.id === op.id);
        if (!np) return { ...op };
        return {
          ...op,
          x: op.x + (np.x - op.x) * t,
          y: op.y + (np.y - op.y) * t,
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

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Camera follow logic
      const localPlayer = players.find((p) => p.id === playerIdRef.current);
      let camX = 0,
        camY = 0;
      if (localPlayer) {
        camX = localPlayer.x - canvas.width / 2;
        camY = localPlayer.y - canvas.height / 2;
        // Clamp camera to world bounds
        camX = Math.max(0, Math.min(WORLD_WIDTH - canvas.width, camX));
        camY = Math.max(0, Math.min(WORLD_HEIGHT - canvas.height, camY));
      }

      ctx.save();
      ctx.translate(-camX, -camY);

      // Draw off-white grid background
      ctx.fillStyle = "#f9f9f6"; // off-white
      ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
      const gridSize = 40;
      ctx.beginPath();
      for (let x = 0; x <= WORLD_WIDTH; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, WORLD_HEIGHT);
      }
      for (let y = 0; y <= WORLD_HEIGHT; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(WORLD_WIDTH, y);
      }
      ctx.strokeStyle = "#ececec"; // subtle grid lines
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.7;
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Draw world bounds (border)
      ctx.strokeStyle = "#bbb";
      ctx.lineWidth = 4;
      ctx.strokeRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

      // Draw walls as snow mounds (rounded rectangles)
      for (const wall of WALLS) {
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

      // Draw flags (base, dropped, or carried)
      for (const flag of flags) {
        ctx.save();
        // If carried, draw on carrier (skip here)
        if (flag.carriedBy) {
          ctx.restore();
          continue;
        }
        // Draw flag pole
        ctx.beginPath();
        ctx.moveTo(flag.x, flag.y);
        ctx.lineTo(flag.x, flag.y - 32);
        ctx.strokeStyle = "#888";
        ctx.lineWidth = 4;
        ctx.stroke();
        // Draw flag
        ctx.beginPath();
        ctx.moveTo(flag.x, flag.y - 32);
        ctx.lineTo(flag.x + (flag.team === "red" ? 22 : -22), flag.y - 24);
        ctx.lineTo(flag.x, flag.y - 16);
        ctx.closePath();
        ctx.fillStyle = flag.team === "red" ? "#e53935" : "#1976d2";
        ctx.globalAlpha = flag.dropped ? 0.7 : 1;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = "#333";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }

      // Draw all players (including local) as top-down people with snow hats
      for (const p of players) {
        ctx.save();
        // Draw carried flag if any
        if (p.carryingFlag) {
          const flag = flags.find((f) => f.team === p.carryingFlag);
          if (flag) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y - PLAYER_RADIUS * 1.3);
            ctx.lineTo(p.x, p.y - PLAYER_RADIUS * 1.7);
            ctx.strokeStyle = "#888";
            ctx.lineWidth = 4;
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(p.x, p.y - PLAYER_RADIUS * 1.7);
            ctx.lineTo(
              p.x + (flag.team === "red" ? 18 : -18),
              p.y - PLAYER_RADIUS * 1.55,
            );
            ctx.lineTo(p.x, p.y - PLAYER_RADIUS * 1.4);
            ctx.closePath();
            ctx.fillStyle = flag.team === "red" ? "#e53935" : "#1976d2";
            ctx.globalAlpha = 1;
            ctx.fill();
            ctx.strokeStyle = "#333";
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        }
        // ...existing player rendering code...
        // Shadow
        ctx.beginPath();
        ctx.ellipse(
          p.x,
          p.y + PLAYER_RADIUS * 0.5,
          PLAYER_RADIUS * 0.9,
          PLAYER_RADIUS * 0.4,
          0,
          0,
          Math.PI * 2,
        );
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = "#222";
        ctx.fill();
        ctx.globalAlpha = 1;

        // Body (jacket)
        ctx.beginPath();
        ctx.arc(p.x, p.y, PLAYER_RADIUS * 0.95, 0, Math.PI * 2);
        ctx.fillStyle = p.hit ? "#f88" : "#1976d2";
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#0d47a1";
        ctx.stroke();

        // Head (face)
        ctx.beginPath();
        ctx.arc(
          p.x,
          p.y - PLAYER_RADIUS * 0.55,
          PLAYER_RADIUS * 0.45,
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
          p.x,
          p.y - PLAYER_RADIUS * 0.85,
          PLAYER_RADIUS * 0.32,
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
          p.x,
          p.y - PLAYER_RADIUS * 1.13,
          PLAYER_RADIUS * 0.13,
          0,
          Math.PI * 2,
        );
        ctx.fillStyle = "#fff";
        ctx.fill();
        ctx.strokeStyle = "#b3e5fc";
        ctx.stroke();

        ctx.restore();
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

      for (const s of snowballs) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, SNOWBALL_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = s.ownerId === playerIdRef.current ? "#ff9800" : "#aaa"; // orange for your snowballs
        ctx.fill();
        ctx.fillStyle = "#000";
      }

      // Draw menu bar with scores
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = "#f5f5f5";
      ctx.fillRect(0, 0, canvas.width, 48);
      ctx.globalAlpha = 1;
      ctx.font = "bold 24px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#e53935";
      ctx.fillText(`Red: ${scores?.red ?? 0}`, canvas.width / 2 - 80, 24);
      ctx.fillStyle = "#1976d2";
      ctx.fillText(`Blue: ${scores?.blue ?? 0}`, canvas.width / 2 + 80, 24);
      ctx.restore();

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
