import { WALLS } from "../walls";
import { DurableObject } from "cloudflare:workers";
import {
  type ServerSnapshot,
  type Player,
  type Team,
  type FlagState,
  type GameState,
} from "../types";
import {
  ACCELERATION,
  FRICTION,
  MAX_SPEED,
  DT,
  SNOWBALL_SPEED,
  SNOWBALL_RADIUS,
  SNOWBALL_LIFETIME,
  PLAYER_RADIUS,
} from "../constants";
type Snowball = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ownerId: string;
  createdAt: number;
};

export class Room extends DurableObject<Env> {
  players: Map<string, Player> = new Map();
  sockets: Map<WebSocket, string> = new Map();
  tickInterval?: number;
  worldWidth = 2000;
  worldHeight = 1000;

  snowballs: Snowball[] = [];

  flags: FlagState[] = [
    {
      team: "red",
      x: 80,
      y: this.worldHeight / 2,
      atBase: true,
    },
    {
      team: "blue",
      x: this.worldWidth - 80,
      y: this.worldHeight / 2,
      atBase: true,
    },
  ];
  scores: Record<Team, number> = { red: 0, blue: 0 };

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
      // Assign team: balance by count
      const redCount = Array.from(this.players.values()).filter(
        (p) => p.team === "red",
      ).length;
      const blueCount = Array.from(this.players.values()).filter(
        (p) => p.team === "blue",
      ).length;
      const team: Team = redCount <= blueCount ? "red" : "blue";
      this.players.set(playerId, {
        id: playerId,
        x: team === "red" ? 120 : this.worldWidth - 120,
        y: this.worldHeight / 2 + (Math.random() - 0.5) * 200,
        vx: 0,
        vy: 0,
        input: { up: false, down: false, left: false, right: false },
        lastProcessedInput: 0,
        lastSeen: Date.now(),
        lastThrowTime: 0,
        hit: false,
        hitTime: 0,
        team,
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

    // If disconnecting player was carrying a flag, return it to base
    const player = this.players.get(playerId);
    if (player && player.carryingFlag) {
      const flag = this.flags.find((f) => f.team === player.carryingFlag);
      if (flag && flag.carriedBy === playerId) {
        flag.carriedBy = undefined;
        flag.atBase = true;
        flag.dropped = false;
        flag.x = flag.team === "red" ? 80 : this.worldWidth - 80;
        flag.y = this.worldHeight / 2;
      }
    }

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
    } else if (msg.type === "throw") {
      // Throw a snowball in the given direction
      if (
        !msg.dir ||
        typeof msg.dir.x !== "number" ||
        typeof msg.dir.y !== "number"
      )
        return;
      // Limit throw rate (simple cooldown)
      if (!player.lastThrowTime || Date.now() - player.lastThrowTime > 200) {
        player.lastThrowTime = Date.now();
        const len = Math.hypot(msg.dir.x, msg.dir.y);
        if (len === 0) return;
        const dx = msg.dir.x / len;
        const dy = msg.dir.y / len;
        this.snowballs.push({
          x: player.x,
          y: player.y,
          vx: dx * SNOWBALL_SPEED,
          vy: dy * SNOWBALL_SPEED,
          ownerId: playerId,
          createdAt: Date.now(),
        });
      }
    } else if (msg.type === "drop_flag") {
      // Drop carried flag at current position
      if (player.carryingFlag) {
        const flag = this.flags.find((f) => f.team === player.carryingFlag);
        if (flag && flag.carriedBy === player.id) {
          flag.carriedBy = undefined;
          flag.atBase = false;
          flag.dropped = true;
          flag.x = player.x;
          flag.y = player.y;
        }
        player.carryingFlag = undefined;
      }
    }
  }

  // ...existing code...

  // TODO: Implement flag pickup, drop, carry, and scoring logic here
  // - Detect player/flag collision
  // - Handle flag pickup, drop (space), and scoring
  // - Allow any player to pick up dropped flag
  // - If carrier is hit and opponent collides, allow steal

  startGameLoop() {
    const TICK = 1000 * DT;
    // Momentum movement constants now imported from ../constants
    this.tickInterval = setInterval(() => {
      const dt = DT;
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

      // Apply momentum-based movement
      for (const player of this.players.values()) {
        if (player.hit) {
          // Freeze movement and input while hit
          player.vx = 0;
          player.vy = 0;
          continue;
        }
        let ax = 0;
        let ay = 0;
        const input = player.input;
        if (input.up) ay -= 1;
        if (input.down) ay += 1;
        if (input.left) ax -= 1;
        if (input.right) ax += 1;

        // Normalize acceleration
        if (ax !== 0 || ay !== 0) {
          const len = Math.hypot(ax, ay);
          ax /= len;
          ay /= len;
        }

        // Apply acceleration
        player.vx += ax * ACCELERATION * dt;
        player.vy += ay * ACCELERATION * dt;

        // Apply friction (exponential decay)
        player.vx *= Math.pow(FRICTION, dt);
        player.vy *= Math.pow(FRICTION, dt);

        // Clamp speed
        const speed = Math.hypot(player.vx, player.vy);
        if (speed > MAX_SPEED) {
          player.vx = (player.vx / speed) * MAX_SPEED;
          player.vy = (player.vy / speed) * MAX_SPEED;
        }

        // Attempt move
        let nextX = player.x + player.vx * dt;
        let nextY = player.y + player.vy * dt;
        // Clamp to world bounds
        nextX = Math.max(0, Math.min(this.worldWidth, nextX));
        nextY = Math.max(0, Math.min(this.worldHeight, nextY));
        // Simple AABB collision with walls
        const radius = PLAYER_RADIUS; // player radius
        function collidesWall(x: number, y: number) {
          for (const wall of WALLS) {
            if (
              x + radius > wall.x &&
              x - radius < wall.x + wall.width &&
              y + radius > wall.y &&
              y - radius < wall.y + wall.height
            ) {
              return true;
            }
          }
          return false;
        }
        // Try X move
        if (!collidesWall(nextX, player.y)) {
          player.x = nextX;
        }
        // Try Y move
        if (!collidesWall(player.x, nextY)) {
          player.y = nextY;
        }

        // --- FLAG LOGIC ---
        // 1. Pickup flag if colliding with a flag (not own, not already carrying)
        for (const flag of this.flags) {
          const dx = player.x - flag.x;
          const dy = player.y - flag.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (
            dist < PLAYER_RADIUS + 18 &&
            !player.carryingFlag &&
            !flag.carriedBy &&
            (flag.atBase === false || flag.atBase === true) &&
            flag.team !== player.team
          ) {
            // Pickup opponent flag
            flag.carriedBy = player.id;
            flag.atBase = false;
            flag.dropped = false;
            player.carryingFlag = flag.team;
          }
        }
        // 2. Pickup dropped flag (anyone)
        for (const flag of this.flags) {
          if (flag.dropped && !flag.carriedBy) {
            const dx = player.x - flag.x;
            const dy = player.y - flag.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < PLAYER_RADIUS + 18 && !player.carryingFlag) {
              flag.carriedBy = player.id;
              flag.dropped = false;
              player.carryingFlag = flag.team;
            }
          }
        }
        // 3. If carrying opponent flag and at own base (and own flag at base), score
        if (player.carryingFlag) {
          const myFlag = this.flags.find((f) => f.team === player.team);
          const oppFlag = this.flags.find(
            (f) => f.team === player.carryingFlag,
          );
          if (
            myFlag &&
            oppFlag &&
            myFlag.atBase &&
            Math.abs(player.x - myFlag.x) < PLAYER_RADIUS + 18 &&
            Math.abs(player.y - myFlag.y) < PLAYER_RADIUS + 18
          ) {
            // Score!
            this.scores[player.team]++;
            oppFlag.atBase = true;
            oppFlag.carriedBy = undefined;
            oppFlag.dropped = false;
            oppFlag.x = oppFlag.team === "red" ? 80 : this.worldWidth - 80;
            oppFlag.y = this.worldHeight / 2;
            player.carryingFlag = undefined;
          }
        }
        // 4. If carrying flag and get hit, allow steal if opponent collides while hit
        if (player.carryingFlag && player.hit) {
          const flag = this.flags.find((f) => f.team === player.carryingFlag);
          if (flag && flag.carriedBy === player.id) {
            // Check for opponent collision
            for (const other of this.players.values()) {
              if (other.team !== player.team && !other.carryingFlag) {
                const dx = other.x - player.x;
                const dy = other.y - player.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < PLAYER_RADIUS * 2) {
                  // Steal!
                  flag.carriedBy = other.id;
                  player.carryingFlag = undefined;
                  other.carryingFlag = flag.team;
                  break;
                }
              }
            }
          }
        }
      }

      // Update snowballs
      this.snowballs = this.snowballs.filter(
        (s) => now - s.createdAt < SNOWBALL_LIFETIME * 1000,
      );
      for (const snowball of this.snowballs) {
        snowball.x += snowball.vx * dt;
        snowball.y += snowball.vy * dt;
      }
      // Remove snowballs out of bounds
      this.snowballs = this.snowballs.filter(
        (s) =>
          s.x >= 0 &&
          s.x <= this.worldWidth &&
          s.y >= 0 &&
          s.y <= this.worldHeight,
      );
      // Collision detection (simple): snowball hits any player except owner
      for (const snowball of this.snowballs) {
        for (const player of this.players.values()) {
          if (player.id === snowball.ownerId) continue;
          // Don't hit if snowball is created inside the player (grace period)
          if (now - snowball.createdAt < 50) continue;
          const dx = player.x - snowball.x;
          const dy = player.y - snowball.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < PLAYER_RADIUS + SNOWBALL_RADIUS) {
            // Remove snowball and handle hit
            snowball.x = -9999; // mark for removal
            player.hit = true;
            player.hitTime = now;
            // Debug: log hit
            console.log(
              `[HIT] Player ${player.id} was hit by snowball from ${snowball.ownerId} at (${player.x.toFixed(1)},${player.y.toFixed(1)})`,
            );
          }
        }
      }
      this.snowballs = this.snowballs.filter((s) => s.x !== -9999);

      // Reset hit after 0.5s
      for (const player of this.players.values()) {
        if (player.hit && now - player.hitTime > 500) {
          player.hit = false;
        }
      }

      // Broadcast state with server timestamp (ms since epoch)
      const snapshot: ServerSnapshot = {
        type: "state",
        state: {
          players: Array.from(this.players.values()),
          snowballs: this.snowballs.map((s) => ({
            x: s.x,
            y: s.y,
            vx: s.vx,
            vy: s.vy,
            owner: s.ownerId,
          })),
          flags: this.flags.map((f) => ({ ...f })),
          scores: { ...this.scores },
        },
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
