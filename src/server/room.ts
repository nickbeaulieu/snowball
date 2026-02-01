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

  flag: FlagState = {
    x: this.worldWidth / 2,
    y: this.worldHeight / 2,
    atBase: true,
    carriedBy: undefined,
    dropped: false,
  };
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

    // If disconnecting player was carrying the flag, return it to center
    const player = this.players.get(playerId);
    if (player && player.carryingFlag && this.flag.carriedBy === playerId) {
      this.flag.carriedBy = undefined;
      this.flag.atBase = true;
      this.flag.dropped = false;
      this.flag.x = this.worldWidth / 2;
      this.flag.y = this.worldHeight / 2;
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
      if (player.carryingFlag && this.flag.carriedBy === player.id) {
        this.flag.carriedBy = undefined;
        this.flag.atBase = false;
        this.flag.dropped = true;
        this.flag.x = player.x;
        this.flag.y = player.y;
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
        // 1. Pickup flag if colliding with it (not already carrying)
        const dx = player.x - this.flag.x;
        const dy = player.y - this.flag.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (
          dist < PLAYER_RADIUS + 18 &&
          !player.carryingFlag &&
          !this.flag.carriedBy
        ) {
          // Pickup neutral flag
          this.flag.carriedBy = player.id;
          this.flag.atBase = false;
          this.flag.dropped = false;
          player.carryingFlag = true;
        }
        // 2. Pickup dropped flag (anyone)
        if (
          this.flag.dropped &&
          !this.flag.carriedBy &&
          dist < PLAYER_RADIUS + 18 &&
          !player.carryingFlag
        ) {
          this.flag.carriedBy = player.id;
          this.flag.dropped = false;
          player.carryingFlag = true;
        }
        // 3. If carrying flag and at own goal, score
        if (player.carryingFlag && this.flag.carriedBy === player.id) {
          // Define goal zones (2x8 grid squares) for each team
          const gridSize = 40;
          const goalWidth = gridSize * 2;
          const goalHeight = gridSize * 8;
          const redGoal = {
            x: 0,
            y: (this.worldHeight - goalHeight) / 2,
            w: goalWidth,
            h: goalHeight,
          };
          const blueGoal = {
            x: this.worldWidth - goalWidth,
            y: (this.worldHeight - goalHeight) / 2,
            w: goalWidth,
            h: goalHeight,
          };
          const inRedGoal =
            player.team === "red" &&
            player.x >= redGoal.x &&
            player.x <= redGoal.x + redGoal.w &&
            player.y >= redGoal.y &&
            player.y <= redGoal.y + redGoal.h;
          const inBlueGoal =
            player.team === "blue" &&
            player.x >= blueGoal.x &&
            player.x <= blueGoal.x + blueGoal.w &&
            player.y >= blueGoal.y &&
            player.y <= blueGoal.y + blueGoal.h;
          if (inRedGoal || inBlueGoal) {
            this.scores[player.team]++;
            this.flag.atBase = true;
            this.flag.carriedBy = undefined;
            this.flag.dropped = false;
            this.flag.x = this.worldWidth / 2;
            this.flag.y = this.worldHeight / 2;
            player.carryingFlag = undefined;
          }
        }
        // 4. Tag-to-kill and flag steal: if players collide, respawn tagged, and if carrier is tagged, transfer flag
        for (const other of this.players.values()) {
          if (other.id !== player.id && other.team !== player.team) {
            const pdx = player.x - other.x;
            const pdy = player.y - other.y;
            const pdist = Math.sqrt(pdx * pdx + pdy * pdy);
            if (pdist < PLAYER_RADIUS * 2) {
              // Tag! Respawn the tagged player
              // If tagged player is carrying flag, transfer to tagger if not already carrying
              if (
                player.carryingFlag &&
                this.flag.carriedBy === player.id &&
                !other.carryingFlag
              ) {
                this.flag.carriedBy = other.id;
                player.carryingFlag = undefined;
                other.carryingFlag = true;
              }
              // Respawn tagged player
              if (player.team === "red") {
                player.x = 120;
                player.y = this.worldHeight / 2 + (Math.random() - 0.5) * 200;
              } else {
                player.x = this.worldWidth - 120;
                player.y = this.worldHeight / 2 + (Math.random() - 0.5) * 200;
              }
              player.vx = 0;
              player.vy = 0;
              player.carryingFlag = undefined;
              if (this.flag.carriedBy === player.id) {
                this.flag.carriedBy = undefined;
                this.flag.dropped = true;
                this.flag.x = player.x;
                this.flag.y = player.y;
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
          flag: { ...this.flag },
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
