import { useEffect, useRef } from "react";

type Player = {
  id: string;
  x: number;
  y: number;
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

  const serverStateRef = useRef<GameState>({
    players: [],
    snowballs: [],
  });

  const predictedPlayerRef = useRef<Player | null>(null);

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

      serverStateRef.current = msg;

      const me = msg.players.find((p) => p.id === playerIdRef.current);
      if (!me) return;

      // Reset prediction to authoritative state
      predictedPlayerRef.current = { ...me };

      // Reapply unacknowledged inputs
      for (const input of pendingInputsRef.current) {
        if (input.seq > me.lastProcessedInput) {
          applyInputPrediction(input);
        }
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
    }, 50);

    return () => clearInterval(interval);
  }, []);

  /* ---------------- Render loop ---------------- */

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d")!;
    let rafId: number;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // ctx.fillStyle = "green";
      // ctx.fillRect(0, 0, canvas.width, canvas.height);

      const { players, snowballs } = serverStateRef.current;

      for (const p of players) {
        const isMe = p.id === playerIdRef.current;
        const renderPlayer =
          isMe && predictedPlayerRef.current ? predictedPlayerRef.current : p;

        ctx.beginPath();
        ctx.arc(renderPlayer.x, renderPlayer.y, 10, 0, Math.PI * 2);
        ctx.fill();
      }

      for (const p of players) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
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
