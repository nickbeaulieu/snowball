import { DurableObject } from "cloudflare:workers";
import {
  type ServerSnapshot,
  type Player,
  type Team,
  type FlagState,
  type RoomPhase,
  type RoomConfig,
  type PlayerReadyState,
  type ClientMessage,
} from "../types";
import { getMap, DEFAULT_MAP_ID, type MapDefinition, type SpawnZone } from "../maps";
import {
  ACCELERATION,
  FRICTION,
  MAX_SPEED,
  DT,
  SNOWBALL_SPEED,
  SNOWBALL_RADIUS,
  SNOWBALL_LIFETIME,
  PLAYER_RADIUS,
  MAX_AMMO,
  AMMO_RECHARGE_TIME,
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
  disconnectedPlayers: Map<string, { player: Player; disconnectTime: number }> = new Map();
  sockets: Map<WebSocket, string> = new Map();
  tickInterval?: number;

  // Map system
  private currentMap: MapDefinition;

  get worldWidth() {
    return this.currentMap.width;
  }

  get worldHeight() {
    return this.currentMap.height;
  }

  snowballs: Snowball[] = [];

  flags: Record<Team, FlagState>;
  scores: Record<Team, number> = { red: 0, blue: 0 };

  // Lobby and game phase management
  phase: RoomPhase = "lobby";
  config: RoomConfig = {
    scoreLimit: 0,
    timeLimit: 300, // 5 minutes in seconds
  };
  readyStates: Map<string, PlayerReadyState> = new Map();
  hostId?: string;
  originalHostId?: string; // Track first-ever host for priority reconnection
  gameStartTime?: number;
  winner?: Team;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);

    // Initialize map
    this.currentMap = getMap(DEFAULT_MAP_ID);

    // Initialize flags based on map
    this.flags = {
      red: {
        x: this.currentMap.teams.red.flagBase.x,
        y: this.currentMap.teams.red.flagBase.y,
        atBase: true,
        carriedBy: undefined,
        dropped: false,
      },
      blue: {
        x: this.currentMap.teams.blue.flagBase.x,
        y: this.currentMap.teams.blue.flagBase.y,
        atBase: true,
        carriedBy: undefined,
        dropped: false,
      },
    };
  }

  // Helper method to get random spawn position within a team's spawn zone
  private getRandomSpawnPosition(spawnZone: SpawnZone): { x: number; y: number } {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * spawnZone.radius;
    return {
      x: spawnZone.x + Math.cos(angle) * distance,
      y: spawnZone.y + Math.sin(angle) * distance,
    };
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

    // Send immediate lobby state to connecting client to prevent race condition
    const timeRemaining = this.phase === "playing" && this.gameStartTime && this.config.timeLimit > 0
      ? Math.max(0, this.config.timeLimit - (Date.now() - this.gameStartTime) / 1000)
      : undefined;

    const immediateState = {
      type: "lobby_state" as const,
      phase: this.phase,
      config: this.config,
      readyStates: Array.from(this.readyStates.values()),
      hostId: this.hostId || "",
      timeRemaining,
      winner: this.winner,
      mapData: this.currentMap,
    };

    try {
      ws.send(JSON.stringify(immediateState));
    } catch (err) {
      console.error("Failed to send initial lobby state:", err);
    }

    // Set host to first player, and remember original host
    if (!this.hostId) {
      this.hostId = playerId;
      this.originalHostId = playerId; // Remember first host
    } else if (this.originalHostId === playerId) {
      // Original host reconnecting - restore their host status
      this.hostId = playerId;
    }

    if (!this.players.has(playerId)) {
      // Check if player recently disconnected
      const disconnectedData = this.disconnectedPlayers.get(playerId);
      const RECONNECT_GRACE_PERIOD = 30000; // 30 seconds

      if (disconnectedData && (Date.now() - disconnectedData.disconnectTime) < RECONNECT_GRACE_PERIOD) {
        // Restore disconnected player with preserved state
        const restoredPlayer = {
          ...disconnectedData.player,
          lastSeen: Date.now(),
          // Clear any temporary states that shouldn't persist
          hit: false,
          carryingFlag: undefined, // Flag already returned in onDisconnect
          ammo: MAX_AMMO,
          lastAmmoRechargeTime: 0,
        };
        this.players.set(playerId, restoredPlayer);
        this.disconnectedPlayers.delete(playerId);

        // Restore ready state if in lobby
        if (this.phase === "lobby" && !this.readyStates.has(playerId)) {
          this.readyStates.set(playerId, {
            playerId,
            isReady: false,
            selectedTeam: restoredPlayer.team,
            nickname: restoredPlayer.nickname,
          });
        }
      } else {
        // New player or grace period expired - create fresh player
        let team: Team = "red";
        if (this.phase === "playing") {
          const redCount = Array.from(this.players.values()).filter(
            (p) => p.team === "red",
          ).length;
          const blueCount = Array.from(this.players.values()).filter(
            (p) => p.team === "blue",
          ).length;
          team = redCount <= blueCount ? "red" : "blue";
        }

        const spawnPos = this.getRandomSpawnPosition(this.currentMap.teams[team].spawnZone);

        this.players.set(playerId, {
          id: playerId,
          x: spawnPos.x,
          y: spawnPos.y,
          vx: 0,
          vy: 0,
          input: { up: false, down: false, left: false, right: false },
          lastProcessedInput: 0,
          lastSeen: Date.now(),
          lastThrowTime: 0,
          nickname: undefined,
          hit: false,
          hitTime: 0,
          team,
          ammo: MAX_AMMO,
          lastAmmoRechargeTime: 0,
        });

        // Initialize ready state for new player
        if (!this.readyStates.has(playerId)) {
          this.readyStates.set(playerId, {
            playerId,
            isReady: false,
            selectedTeam: team,
            nickname: undefined,
          });
        }
      }
    } else {
      // Update lastSeen for reconnecting player
      const player = this.players.get(playerId);
      if (player) {
        player.lastSeen = Date.now();
      }
    }

    ws.addEventListener("message", (e) => this.onMessage(ws, e));
    ws.addEventListener("close", () => this.onDisconnect(ws));
    ws.addEventListener("error", () => this.onDisconnect(ws));

    // Broadcast lobby state to all clients
    this.broadcastLobbyState();

    if (!this.tickInterval) this.startGameLoop();
  }

  onDisconnect(ws: WebSocket) {
    const playerId = this.sockets.get(ws);
    if (!playerId) return;

    // If disconnecting player was carrying a flag, return it to its base
    const player = this.players.get(playerId);
    if (player && player.carryingFlag) {
      const flagTeam = player.carryingFlag;
      this.flags[flagTeam].carriedBy = undefined;
      this.flags[flagTeam].atBase = true;
      this.flags[flagTeam].dropped = false;
      this.flags[flagTeam].x = this.currentMap.teams[flagTeam].flagBase.x;
      this.flags[flagTeam].y = this.currentMap.teams[flagTeam].flagBase.y;
      // Clear flag from player but keep player data
      if (player) {
        player.carryingFlag = undefined;
      }
    }

    this.sockets.delete(ws);

    // Instead of deleting immediately, move to disconnected state
    if (player) {
      this.disconnectedPlayers.set(playerId, {
        player: { ...player }, // Clone player state
        disconnectTime: Date.now()
      });
    }

    this.players.delete(playerId);
    this.readyStates.delete(playerId);

    // Handle host migration if host disconnected
    if (playerId === this.hostId) {
      // Assign new host (oldest remaining player)
      const remainingPlayers = Array.from(this.players.keys());
      if (remainingPlayers.length > 0) {
        this.hostId = remainingPlayers[0];
      } else {
        this.hostId = undefined;
      }
    }

    // Broadcast updated lobby state
    if (this.players.size > 0) {
      this.broadcastLobbyState();
    }

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

    const msg = JSON.parse(e.data) as ClientMessage;

    if (msg.type === "input") {
      // Only process input during playing phase
      if (this.phase !== "playing") return;
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
      // Only allow throwing during playing phase
      if (this.phase !== "playing") return;
      if (player.hit) return;
      if (player.ammo <= 0) return;
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
        player.ammo--;
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
      // Only allow dropping flag during playing phase
      if (this.phase !== "playing") return;
      // Drop carried flag at current position
      if (player.carryingFlag) {
        const flagTeam = player.carryingFlag;
        if (this.flags[flagTeam].carriedBy === player.id) {
          this.flags[flagTeam].carriedBy = undefined;
          this.flags[flagTeam].atBase = false;
          this.flags[flagTeam].dropped = true;
          this.flags[flagTeam].x = player.x;
          this.flags[flagTeam].y = player.y;
          player.carryingFlag = undefined;
          player.lastDropTime = Date.now(); // Set cooldown
        }
      }
    } else if (msg.type === "ready") {
      // Toggle ready state in lobby
      if (this.phase !== "lobby") return;
      const readyState = this.readyStates.get(playerId);
      if (readyState) {
        readyState.isReady = msg.ready;
        this.broadcastLobbyState();
      }
    } else if (msg.type === "select_team") {
      // Change team selection in lobby (only if manual teams enabled)
      if (this.phase !== "lobby") return;
      const readyState = this.readyStates.get(playerId);
      if (readyState && player) {
        readyState.selectedTeam = msg.team;
        player.team = msg.team;
        // Update spawn position based on team
        const spawnPos = this.getRandomSpawnPosition(this.currentMap.teams[msg.team].spawnZone);
        player.x = spawnPos.x;
        player.y = spawnPos.y;
        this.broadcastLobbyState();
      }
    } else if (msg.type === "set_nickname") {
      // Update player nickname
      const readyState = this.readyStates.get(playerId);
      if (readyState && player) {
        // Sanitize: trim whitespace, limit to 20 chars
        const sanitized = msg.nickname.trim().slice(0, 20);
        readyState.nickname = sanitized || undefined;
        player.nickname = sanitized || undefined;
        this.broadcastLobbyState();
      }
    } else if (msg.type === "update_config") {
      // Update game config (host only)
      if (this.phase !== "lobby" || playerId !== this.hostId) return;
      if (msg.config.scoreLimit !== undefined) {
        this.config.scoreLimit = Math.max(0, msg.config.scoreLimit);
      }
      if (msg.config.timeLimit !== undefined) {
        this.config.timeLimit = Math.max(0, msg.config.timeLimit);
      }
      this.broadcastLobbyState();
    } else if (msg.type === "select_map") {
      // Update map selection (host only)
      if (this.phase !== "lobby" || playerId !== this.hostId) return;
      this.currentMap = getMap(msg.mapId);
      this.config.mapId = msg.mapId;
      // Reset flag positions for new map
      this.flags.red.x = this.currentMap.teams.red.flagBase.x;
      this.flags.red.y = this.currentMap.teams.red.flagBase.y;
      this.flags.red.atBase = true;
      this.flags.red.carriedBy = undefined;
      this.flags.red.dropped = false;
      this.flags.blue.x = this.currentMap.teams.blue.flagBase.x;
      this.flags.blue.y = this.currentMap.teams.blue.flagBase.y;
      this.flags.blue.atBase = true;
      this.flags.blue.carriedBy = undefined;
      this.flags.blue.dropped = false;
      // Respawn all players to new spawn positions
      for (const p of this.players.values()) {
        const spawnPos = this.getRandomSpawnPosition(this.currentMap.teams[p.team].spawnZone);
        p.x = spawnPos.x;
        p.y = spawnPos.y;
        p.vx = 0;
        p.vy = 0;
      }
      this.broadcastLobbyState();
    } else if (msg.type === "start_game") {
      // Start the game (host only)
      if (this.phase !== "lobby" || playerId !== this.hostId) return;
      this.startGame();
    } else if (msg.type === "reset_game") {
      // Reset game back to lobby (host only)
      if (this.phase !== "finished" || playerId !== this.hostId) return;
      this.resetGame();
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

      // Always broadcast lobby state to keep clients updated
      if (this.phase === "lobby" || this.phase === "finished") {
        this.broadcastLobbyState();
      }

      // Only run game physics during playing phase
      if (this.phase !== "playing") {
        return;
      }

      // Check time limit win condition
      if (
        this.config.timeLimit > 0 &&
        this.gameStartTime &&
        now - this.gameStartTime >= this.config.timeLimit * 1000
      ) {
        this.endGame();
        return;
      }

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

      // Clean up expired disconnected player states
      const CLEANUP_AFTER = 60000; // Remove after 1 minute
      for (const [id, data] of this.disconnectedPlayers) {
        if (now - data.disconnectTime > CLEANUP_AFTER) {
          this.disconnectedPlayers.delete(id);
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
        const walls = this.currentMap.walls;
        function collidesWall(x: number, y: number) {
          for (const wall of walls) {
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

        // --- TWO-FLAG CTF LOGIC ---
        const FLAG_PICKUP_RADIUS = PLAYER_RADIUS + 18;
        const FLAG_PICKUP_COOLDOWN = 500; // ms after dropping before can pick up again

        // 1. Try to pick up ENEMY flag (can only carry one flag at a time)
        if (!player.carryingFlag) {
          const enemyTeam = player.team === "red" ? "blue" : "red";
          const enemyFlag = this.flags[enemyTeam];

          const dx = player.x - enemyFlag.x;
          const dy = player.y - enemyFlag.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          // Check if cooldown has expired (prevent immediate re-pickup after drop)
          const cooldownExpired = !player.lastDropTime || (now - player.lastDropTime) > FLAG_PICKUP_COOLDOWN;

          // Can pick up if: not already carried AND close enough AND cooldown expired
          if (dist < FLAG_PICKUP_RADIUS && !enemyFlag.carriedBy && cooldownExpired) {
            enemyFlag.carriedBy = player.id;
            enemyFlag.atBase = false;
            enemyFlag.dropped = false;
            player.carryingFlag = enemyTeam;
          }
        }

        // 1.5 Return own flag if it's dropped and player walks over it
        const ownFlag = this.flags[player.team];
        if (ownFlag.dropped && !ownFlag.carriedBy) {
          const dx = player.x - ownFlag.x;
          const dy = player.y - ownFlag.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < FLAG_PICKUP_RADIUS) {
            const ownFlagBase = this.currentMap.teams[player.team].flagBase;
            ownFlag.x = ownFlagBase.x;
            ownFlag.y = ownFlagBase.y;
            ownFlag.atBase = true;
            ownFlag.dropped = false;
          }
        }

        // 2. Check scoring: must be near own flag base while carrying enemy flag
        if (player.carryingFlag) {
          const ownFlag = this.flags[player.team];
          const carriedFlag = this.flags[player.carryingFlag];

          // Calculate distance to own flag base position
          const ownFlagBase = this.currentMap.teams[player.team].flagBase;
          const ownFlagBaseX = ownFlagBase.x;
          const ownFlagBaseY = ownFlagBase.y;

          const dx = player.x - ownFlagBaseX;
          const dy = player.y - ownFlagBaseY;
          const distToBase = Math.sqrt(dx * dx + dy * dy);

          // Use same radius as flag pickup for consistency
          const SCORING_RADIUS = PLAYER_RADIUS + 18; // ~38px

          // Score if: near own flag base AND own flag is at home AND carrying enemy flag
          if (distToBase < SCORING_RADIUS && ownFlag.atBase && carriedFlag.carriedBy === player.id) {
            this.scores[player.team]++;

            // Check win condition
            if (this.config.scoreLimit > 0 && this.scores[player.team] >= this.config.scoreLimit) {
              this.endGame(player.team);
              return;
            }

            // Return enemy flag to their base
            carriedFlag.atBase = true;
            carriedFlag.carriedBy = undefined;
            carriedFlag.dropped = false;
            const enemyFlagBase = this.currentMap.teams[player.carryingFlag].flagBase;
            carriedFlag.x = enemyFlagBase.x;
            carriedFlag.y = enemyFlagBase.y;

            player.carryingFlag = undefined;
          }
        }

        // 3. Player collision: Flag carrier "pops" and flag returns to base
        for (const other of this.players.values()) {
          if (other.id !== player.id && other.team !== player.team) {
            const pdx = player.x - other.x;
            const pdy = player.y - other.y;
            const pdist = Math.sqrt(pdx * pdx + pdy * pdy);

            if (pdist < PLAYER_RADIUS * 2) {
              // If both players have flags, both "pop" and flags return to base
              if (player.carryingFlag && other.carryingFlag) {
                const playerFlagTeam = player.carryingFlag;
                const otherFlagTeam = other.carryingFlag;

                // Return player's flag to base
                this.flags[playerFlagTeam].carriedBy = undefined;
                this.flags[playerFlagTeam].atBase = true;
                this.flags[playerFlagTeam].dropped = false;
                this.flags[playerFlagTeam].x =
                  playerFlagTeam === "red" ? 80 : this.worldWidth - 80;
                this.flags[playerFlagTeam].y = this.worldHeight / 2;

                // Return other's flag to base
                this.flags[otherFlagTeam].carriedBy = undefined;
                this.flags[otherFlagTeam].atBase = true;
                this.flags[otherFlagTeam].dropped = false;
                this.flags[otherFlagTeam].x = this.currentMap.teams[otherFlagTeam].flagBase.x;
                this.flags[otherFlagTeam].y = this.currentMap.teams[otherFlagTeam].flagBase.y;

                // Respawn both players
                const playerSpawn = this.getRandomSpawnPosition(this.currentMap.teams[player.team].spawnZone);
                player.x = playerSpawn.x;
                player.y = playerSpawn.y;
                player.vx = 0;
                player.vy = 0;
                player.carryingFlag = undefined;

                const otherSpawn = this.getRandomSpawnPosition(this.currentMap.teams[other.team].spawnZone);
                other.x = otherSpawn.x;
                other.y = otherSpawn.y;
                other.vx = 0;
                other.vy = 0;
                other.carryingFlag = undefined;
              } else if (other.carryingFlag) {
                // If opponent has a flag, they "pop" and flag returns to base
                const flagTeam = other.carryingFlag;
                this.flags[flagTeam].carriedBy = undefined;
                this.flags[flagTeam].atBase = true;
                this.flags[flagTeam].dropped = false;
                this.flags[flagTeam].x = this.currentMap.teams[flagTeam].flagBase.x;
                this.flags[flagTeam].y = this.currentMap.teams[flagTeam].flagBase.y;

                // Respawn the opponent
                const otherSpawn = this.getRandomSpawnPosition(this.currentMap.teams[other.team].spawnZone);
                other.x = otherSpawn.x;
                other.y = otherSpawn.y;
                other.vx = 0;
                other.vy = 0;
                other.carryingFlag = undefined;
              } else if (player.carryingFlag) {
                // If current player has a flag, they "pop" and flag returns to base
                const flagTeam = player.carryingFlag;
                this.flags[flagTeam].carriedBy = undefined;
                this.flags[flagTeam].atBase = true;
                this.flags[flagTeam].dropped = false;
                this.flags[flagTeam].x = this.currentMap.teams[flagTeam].flagBase.x;
                this.flags[flagTeam].y = this.currentMap.teams[flagTeam].flagBase.y;

                // Respawn the current player
                const playerSpawn = this.getRandomSpawnPosition(this.currentMap.teams[player.team].spawnZone);
                player.x = playerSpawn.x;
                player.y = playerSpawn.y;
                player.vx = 0;
                player.vy = 0;
                player.carryingFlag = undefined;
              } else {
                // Neither player has a flag - apply collision physics to make them bounce
                // Calculate collision normal (from other to player)
                const nx = pdx / pdist;
                const ny = pdy / pdist;

                // Calculate overlap distance
                const overlap = PLAYER_RADIUS * 2 - pdist;

                // Push both players apart by half the overlap distance
                const separation = overlap / 2;
                player.x += nx * separation;
                player.y += ny * separation;
                other.x -= nx * separation;
                other.y -= ny * separation;
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
      // Remove snowballs that hit walls
      this.snowballs = this.snowballs.filter((s) => {
        for (const wall of this.currentMap.walls) {
          if (
            s.x + SNOWBALL_RADIUS > wall.x &&
            s.x - SNOWBALL_RADIUS < wall.x + wall.width &&
            s.y + SNOWBALL_RADIUS > wall.y &&
            s.y - SNOWBALL_RADIUS < wall.y + wall.height
          ) {
            return false; // Remove snowball if it hits a wall
          }
        }
        return true; // Keep snowball if no collision
      });
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

      // Recharge ammo
      for (const player of this.players.values()) {
        if (player.ammo < MAX_AMMO) {
          if (!player.lastAmmoRechargeTime) player.lastAmmoRechargeTime = now;
          if (now - player.lastAmmoRechargeTime >= AMMO_RECHARGE_TIME) {
            player.ammo++;
            player.lastAmmoRechargeTime = now;
          }
        } else {
          player.lastAmmoRechargeTime = now;
        }
      }

      // Calculate time remaining
      const timeRemaining =
        this.config.timeLimit > 0 && this.gameStartTime
          ? Math.max(0, this.config.timeLimit - (now - this.gameStartTime) / 1000)
          : undefined;

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
          flags: { ...this.flags },
          scores: { ...this.scores },
          timeRemaining,
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

  broadcastLobbyState() {
    const timeRemaining =
      this.phase === "playing" && this.gameStartTime && this.config.timeLimit > 0
        ? Math.max(0, this.config.timeLimit - (Date.now() - this.gameStartTime) / 1000)
        : undefined;

    const lobbyState = {
      type: "lobby_state" as const,
      phase: this.phase,
      config: this.config,
      readyStates: Array.from(this.readyStates.values()),
      hostId: this.hostId || "",
      timeRemaining,
      winner: this.winner,
      mapData: this.currentMap,
    };

    for (const ws of this.sockets.keys()) {
      try {
        ws.send(JSON.stringify(lobbyState));
      } catch (err) {
        console.error("Failed to send lobby state:", err);
      }
    }
  }

  startGame() {
    // Transition from lobby to playing phase
    this.phase = "playing";
    this.gameStartTime = Date.now();
    this.winner = undefined;

    // Reset game state
    this.scores = { red: 0, blue: 0 };
    this.snowballs = [];

    // Reset flags to base
    this.flags = {
      red: {
        x: this.currentMap.teams.red.flagBase.x,
        y: this.currentMap.teams.red.flagBase.y,
        atBase: true,
        carriedBy: undefined,
        dropped: false,
      },
      blue: {
        x: this.currentMap.teams.blue.flagBase.x,
        y: this.currentMap.teams.blue.flagBase.y,
        atBase: true,
        carriedBy: undefined,
        dropped: false,
      },
    };

    // Apply team selections and reset player positions
    for (const [playerId, readyState] of this.readyStates) {
      const player = this.players.get(playerId);
      if (player && readyState.selectedTeam) {
        player.team = readyState.selectedTeam;
        const spawnPos = this.getRandomSpawnPosition(this.currentMap.teams[player.team].spawnZone);
        player.x = spawnPos.x;
        player.y = spawnPos.y;
        player.vx = 0;
        player.vy = 0;
        player.hit = false;
        player.carryingFlag = undefined;
      }
    }

    // Broadcast lobby state to notify clients of phase change
    this.broadcastLobbyState();
  }

  endGame(winningTeam?: Team) {
    // Transition to finished phase
    this.phase = "finished";

    // Determine winner if not provided
    if (!winningTeam) {
      if (this.scores.red > this.scores.blue) {
        this.winner = "red";
      } else if (this.scores.blue > this.scores.red) {
        this.winner = "blue";
      }
      // If tied, winner remains undefined
    } else {
      this.winner = winningTeam;
    }

    // Broadcast final state
    this.broadcastLobbyState();
  }

  resetGame() {
    // Transition back to lobby phase
    this.phase = "lobby";
    this.gameStartTime = undefined;
    this.winner = undefined;

    // Reset all ready states
    for (const readyState of this.readyStates.values()) {
      readyState.isReady = false;
    }

    // Reset scores
    this.scores = { red: 0, blue: 0 };

    // Broadcast lobby state
    this.broadcastLobbyState();
  }
}
