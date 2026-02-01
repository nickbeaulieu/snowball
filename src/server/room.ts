import { DurableObject } from "cloudflare:workers";
import { type ServerSnapshot, type Player } from "../types";

export class Room extends DurableObject<Env> {
  players: Map<string, Player> = new Map();
  sockets: Map<WebSocket, string> = new Map();
  tickInterval?: number;
  worldSize = 400;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
  }

  async fetch(req: Request) {
    const url = new URL(req.url);
    const clientId = url.searchParams.get("clientId");
    if (!clientId) return new Response("Missing clientId", { status: 400 });

    // Accept WebSocket
    if (req.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected websocket", { status: 400 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();

    this.onConnect(server, clientId);

    return new Response(null, { status: 101, webSocket: client });
  }

  onConnect(ws: WebSocket, playerId: string) {
    // Replace existing socket if reconnecting
    for (const [existingWs, id] of this.sockets) {
      if (id === playerId) {
        try {
          existingWs.close();
        } catch (err) {
          console.error("Failed to close existing WebSocket:", err);
        }
        this.sockets.delete(existingWs);
        break;
      }
    }

    this.sockets.set(ws, playerId);

    if (!this.players.has(playerId)) {
      this.players.set(playerId, {
        id: playerId,
        x: Math.random() * 800 + 100,
        y: Math.random() * 800 + 100,
        vx: 0,
        vy: 0,
        input: { up: false, down: false, left: false, right: false },
        lastProcessedInput: 0,
        lastSeen: Date.now(),
      });
    }

    ws.addEventListener("message", (e) => this.onMessage(ws, e));
    ws.addEventListener("close", () => this.onDisconnect(ws));
    ws.addEventListener("error", () => this.onDisconnect(ws));

    if (!this.tickInterval) this.startGameLoop();
  }

  onDisconnect(ws: WebSocket) {
    const playerId = this.sockets.get(ws);
    if (!playerId) return;

    this.sockets.delete(ws);
    this.players.delete(playerId);

    if (this.players.size === 0 && this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = undefined;
    }
  }

  onMessage(ws: WebSocket, e: MessageEvent) {
    const playerId = this.sockets.get(ws);
    if (!playerId) return;
    const player = this.players.get(playerId);
    if (!player) return;

    player.lastSeen = Date.now();

    const msg = JSON.parse(e.data);
    if (msg.type === "input") {
      // Validate sequence
      if (typeof msg.seq !== "number") return;
      player.input = {
        up: !!msg.up,
        down: !!msg.down,
        left: !!msg.left,
        right: !!msg.right,
      };
      player.lastProcessedInput = msg.seq;
    }
  }

  startGameLoop() {
    const TICK = 1000 / 30;
    const SPEED = 220;
    this.tickInterval = setInterval(() => {
      const dt = 1 / 30;
      const now = Date.now();

      // Remove stale players
      for (const [id, player] of this.players) {
        if (now - player.lastSeen > 5000) {
          this.players.delete(id);
          for (const [ws, pid] of this.sockets) {
            if (pid === id) {
              try {
                ws.close();
              } catch (err) {
                console.error("Failed to close WebSocket:", err);
              }
              this.sockets.delete(ws);
              break;
            }
          }
        }
      }

      // Apply movement
      for (const player of this.players.values()) {
        let ax = 0;
        let ay = 0;
        const input = player.input;
        if (input.up) ay -= 1;
        if (input.down) ay += 1;
        if (input.left) ax -= 1;
        if (input.right) ax += 1;

        if (ax !== 0 || ay !== 0) {
          const len = Math.hypot(ax, ay);
          ax /= len;
          ay /= len;
        }

        player.vx = ax * SPEED;
        player.vy = ay * SPEED;

        player.x += player.vx * dt;
        player.y += player.vy * dt;

        // Clamp to world bounds
        player.x = Math.max(0, Math.min(this.worldSize, player.x));
        player.y = Math.max(0, Math.min(this.worldSize, player.y));
      }

      // Broadcast state with server timestamp (ms since epoch)
      const snapshot: ServerSnapshot & { timestamp: number } = {
        type: "state",
        players: Array.from(this.players.values()),
        snowballs: [], // add later
        timestamp: Date.now(),
      };

      for (const ws of this.sockets.keys()) {
        try {
          ws.send(JSON.stringify(snapshot));
        } catch (err) {
          console.error("Failed to send snapshot:", err);
        }
      }
    }, TICK);
  }
}
