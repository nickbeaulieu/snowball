import { useEffect, useRef } from "react";

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

type GameState = {
  players: Player[];
  snowballs: Snowball[];
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

const SPEED = 220;
const DT = 1 / 30;

export function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const playerIdRef = useRef<string>(getClientId());

  // Buffer of recent server snapshots for interpolation
  const snapshotBufferRef = useRef<ServerSnapshot[]>([]);

  const predictedPlayerRef = useRef<Player | null>(null);
  // For robust smoothing corrections
  const correctionStartRef = useRef<Player | null>(null);
  const correctionTargetRef = useRef<Player | null>(null);
  const correctionStartTimeRef = useRef<number>(0);
  const CORRECTION_DURATION = 0.08; // seconds (80ms)
  const CORRECTION_THRESHOLD = 2; // pixels

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

      // Robust correction: only start a new correction if error is significant
      if (predictedPlayerRef.current) {
        const dx = me.x - predictedPlayerRef.current.x;
        const dy = me.y - predictedPlayerRef.current.y;
        const dist = Math.hypot(dx, dy);
        if (dist > CORRECTION_THRESHOLD) {
          correctionStartRef.current = { ...predictedPlayerRef.current };
          correctionTargetRef.current = { ...me };
          correctionStartTimeRef.current = performance.now() / 1000;
        }
        // If already correcting, let the blend finish
      } else {
        predictedPlayerRef.current = { ...me };
        correctionStartRef.current = null;
        correctionTargetRef.current = null;
      }

      // Reapply only the last unacknowledged input (to match server logic)
      const unacked = pendingInputsRef.current.filter(
        (i) => i.seq > me.lastProcessedInput,
      );
      if (unacked.length > 0) {
        // Only apply the last one
        applyInputPrediction(unacked[unacked.length - 1]);
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

    predictedPlayerRef.current.x += ax * SPEED * DT;
    predictedPlayerRef.current.y += ay * SPEED * DT;
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
      const players: Player[] = older.players.map((op) => {
        const np = newer.players.find((p) => p.id === op.id);
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

      // Robustly blend predicted position toward correction target if needed
      if (predictedPlayerRef.current) {
        if (correctionTargetRef.current && correctionStartRef.current) {
          const nowSec = performance.now() / 1000;
          const t = Math.min(
            (nowSec - correctionStartTimeRef.current) / CORRECTION_DURATION,
            1,
          );
          predictedPlayerRef.current.x =
            correctionStartRef.current.x +
            (correctionTargetRef.current.x - correctionStartRef.current.x) * t;
          predictedPlayerRef.current.y =
            correctionStartRef.current.y +
            (correctionTargetRef.current.y - correctionStartRef.current.y) * t;
          if (t >= 1) {
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
