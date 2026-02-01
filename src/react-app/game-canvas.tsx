import { useEffect, useRef } from "react";
import {
  ACCELERATION,
  FRICTION,
  MAX_SPEED,
  DT,
  CORRECTION_DURATION,
  CORRECTION_THRESHOLD,
} from "../constants";

type Player = {
  id: string;
  x: number;
  y: number;
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
      // Keep only the last 20 snapshots (tune as needed)
      if (snapshotBufferRef.current.length > 20) {
        snapshotBufferRef.current.shift();
      }

      // Find local player for prediction/reconciliation
      const me = msg.players.find((p) => p.id === playerIdRef.current);
      if (!me) return;

      // Always use interpolation for corrections, even for small errors
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
          // Large error: trigger interpolation
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
          // Small error: still interpolate, but with a shorter duration
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
        // If error is truly negligible, do nothing
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d")!;
    let rafId: number;

    // Interpolation settings
    const INTERP_DELAY = 100; // ms

    function interpolatePlayers(buffer: ServerSnapshot[], renderTime: number) {
      // Find two snapshots to interpolate between
      if (buffer.length < 2) return { players: [], snowballs: [] };
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
        // Not enough data, use latest
        const last = buffer[buffer.length - 1];
        return { players: last.players, snowballs: last.snowballs };
      }
      const t =
        (renderTime - older.timestamp) / (newer.timestamp - older.timestamp);
      // Interpolate all players
      const players: Player[] = older.players.map((op: Player) => {
        const np = newer.players.find((p: Player) => p.id === op.id);
        if (!np) return op;
        return {
          id: op.id,
          x: op.x + (np.x - op.x) * t,
          y: op.y + (np.y - op.y) * t,
        };
      });
      // Interpolate snowballs if needed (simple copy for now)
      return { players, snowballs: newer.snowballs };
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Calculate render time for interpolation
      const now = Date.now();
      const renderTime = now - INTERP_DELAY;

      // Interpolate remote players
      const { players, snowballs } = interpolatePlayers(
        snapshotBufferRef.current,
        renderTime,
      );

      // Draw remote players (excluding local)
      for (const p of players) {
        if (p.id === playerIdRef.current) continue;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
        ctx.fill();
      }

      // Blend both position and velocity for smooth correction
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
        ctx.beginPath();
        ctx.arc(
          predictedPlayerRef.current.x,
          predictedPlayerRef.current.y,
          10,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }

      for (const s of snowballs) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      rafId = requestAnimationFrame(draw);
    };

    draw();

    return () => cancelAnimationFrame(rafId);
  }, []);

  return <canvas ref={canvasRef} width={400} height={400} />;
}
