import { useEffect, useRef } from "react";
import { classicMap } from "../maps/classic";
import {
  PLAYER_RADIUS,
  SNOWBALL_RADIUS,
  GRID_SIZE,
  ACCELERATION,
  FRICTION,
  MAX_SPEED,
  SNOWBALL_SPEED,
  SNOWBALL_LIFETIME,
  MAX_AMMO,
  AMMO_RECHARGE_TIME,
} from "../constants";
import type { Player, FlagState, Snowball, Team } from "../types";
import {
  drawGridBackground,
  drawVoidBackground,
  drawWalls,
  groupConnectedWalls,
  drawFlag,
  drawGhostFlag,
  drawPlayer,
  drawPlayerNickname,
  drawSnowballs,
} from "./render";

// --- Types ---

type BotState = "WANDER" | "CHASE_FLAG" | "RETURN_FLAG" | "ENGAGE";
type BotRole = "attacker" | "defender" | "roamer";

type SimBot = {
  id: string;
  team: Team;
  x: number;
  y: number;
  vx: number;
  vy: number;
  aimAngle: number;
  ammo: number;
  lastThrowTime: number;
  lastAmmoRechargeTime: number;
  carryingFlag?: Team;
  hit: boolean;
  hitTime: number;
  nickname: string;
  // AI fields
  role: BotRole;
  state: BotState;
  stateTimer: number;
  stateCooldown: number; // min time before state can change
  wanderTarget: { x: number; y: number } | null;
  intermediateTarget: { x: number; y: number } | null; // temporary reroute point
  stuckTimer: number; // how long bot hasn't made progress
  lastDistToTarget: number; // for stuck detection
  isDead: boolean;
  respawnTimer: number;
  deathX: number;
  deathY: number;
};

type SimFlag = {
  x: number;
  y: number;
  atBase: boolean;
  carriedBy: string | null;
  dropped: boolean;
};

type Camera = {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  holdTimer: number;
};

// --- Constants ---

const MAP = classicMap;
const BOT_NAMES = [
  "Frosty", "Blizzard", "IceKing", "Snowflake",
  "Chilly", "Glacier", "Arctic", "Tundra",
  "Icicle", "Powder", "Slushie", "Hailstorm",
];
const BOT_COUNT = 10;
const MAX_SNOWBALLS = 15;
const FLAG_PICKUP_DIST = 30;
const BOT_THROW_COOLDOWN = 700; // ms
const ENGAGE_RANGE = 200;
const AIM_SPREAD = 0.2; // radians
const AI_EVAL_INTERVAL = 300; // ms — slower eval so states are stickier
const SEPARATION_DIST = 60; // bots push apart when closer than this
const SEPARATION_FORCE = 800; // px/s^2
const WALL_AVOID_DIST = 50; // start avoiding walls within this distance
const WALL_AVOID_FORCE = 2000; // px/s^2
const STUCK_THRESHOLD = 0.5; // seconds before rerouting
const ROLES: BotRole[] = ["attacker", "defender", "roamer"];

// --- Helpers ---

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function collidesWall(
  x: number,
  y: number,
  radius: number,
  walls: Array<{ x: number; y: number; width: number; height: number }>,
): boolean {
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

function dist(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

function randomInSpawn(team: Team): { x: number; y: number } {
  const spawn = MAP.teams[team].spawnZone;
  for (let attempt = 0; attempt < 10; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.random() * spawn.radius;
    const x = spawn.x + Math.cos(angle) * r;
    const y = spawn.y + Math.sin(angle) * r;
    if (!collidesWall(x, y, PLAYER_RADIUS, MAP.walls)) {
      return { x, y };
    }
  }
  // Fallback to spawn center
  return { x: spawn.x, y: spawn.y };
}

function randomWaypoint(): { x: number; y: number } {
  const margin = 80;
  for (let attempt = 0; attempt < 5; attempt++) {
    const x = margin + Math.random() * (MAP.width - margin * 2);
    const y = margin + Math.random() * (MAP.height - margin * 2);
    if (!collidesWall(x, y, PLAYER_RADIUS, MAP.walls)) {
      return { x, y };
    }
  }
  return { x: MAP.width / 2, y: MAP.height / 2 };
}

function randomWaypointNear(cx: number, cy: number, radius: number): { x: number; y: number } {
  // Try a few times to find a waypoint not inside a wall
  for (let attempt = 0; attempt < 5; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const r = 40 + Math.random() * radius;
    const x = Math.max(PLAYER_RADIUS + 40, Math.min(MAP.width - PLAYER_RADIUS - 40, cx + Math.cos(angle) * r));
    const y = Math.max(PLAYER_RADIUS + 40, Math.min(MAP.height - PLAYER_RADIUS - 40, cy + Math.sin(angle) * r));
    if (!collidesWall(x, y, PLAYER_RADIUS, MAP.walls)) {
      return { x, y };
    }
  }
  return { x: cx, y: cy }; // fallback to center
}

// Get wall avoidance force — pushes bot away from nearby walls
function getWallAvoidance(
  px: number,
  py: number,
  walls: Array<{ x: number; y: number; width: number; height: number }>,
): { ax: number; ay: number } {
  let ax = 0;
  let ay = 0;
  for (const wall of walls) {
    // Find nearest point on wall to the bot
    const nearX = Math.max(wall.x, Math.min(wall.x + wall.width, px));
    const nearY = Math.max(wall.y, Math.min(wall.y + wall.height, py));
    const dx = px - nearX;
    const dy = py - nearY;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < WALL_AVOID_DIST && d > 0.1) {
      const strength = WALL_AVOID_FORCE * (1 - d / WALL_AVOID_DIST);
      ax += (dx / d) * strength;
      ay += (dy / d) * strength;
    }
  }
  return { ax, ay };
}

function toPlayer(bot: SimBot): Player {
  return {
    id: bot.id,
    team: bot.team,
    x: bot.x,
    y: bot.y,
    vx: bot.vx,
    vy: bot.vy,
    hit: bot.hit,
    hitTime: bot.hitTime,
    dead: bot.isDead,
    deadTime: bot.isDead ? bot.hitTime : 0,
    deathX: bot.deathX,
    deathY: bot.deathY,
    carryingFlag: bot.carryingFlag,
    nickname: bot.nickname,
    input: { up: false, down: false, left: false, right: false },
    lastProcessedInput: 0,
    lastSeen: 0,
    lastThrowTime: bot.lastThrowTime,
    ammo: bot.ammo,
    lastAmmoRechargeTime: bot.lastAmmoRechargeTime,
  };
}

function toFlagState(flag: SimFlag): FlagState {
  return {
    x: flag.x,
    y: flag.y,
    atBase: flag.atBase,
    carriedBy: flag.carriedBy ?? undefined,
    dropped: flag.dropped,
  };
}

// --- Component ---

export function HomepageBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // --- Init ---
    const wallGroups = groupConnectedWalls(MAP.walls);
    const names = shuffle(BOT_NAMES);

    const bots: SimBot[] = [];
    for (let i = 0; i < BOT_COUNT; i++) {
      const team: Team = i < BOT_COUNT / 2 ? "red" : "blue";
      const teamIdx = i < BOT_COUNT / 2 ? i : i - BOT_COUNT / 2;
      const role = ROLES[teamIdx % ROLES.length];
      const pos = randomInSpawn(team);
      bots.push({
        id: `bot-${i}`,
        team,
        x: pos.x,
        y: pos.y,
        vx: 0,
        vy: 0,
        aimAngle: 0,
        ammo: MAX_AMMO,
        lastThrowTime: 0,
        lastAmmoRechargeTime: Date.now(),
        hit: false,
        hitTime: 0,
        nickname: names[i],
        role,
        state: "WANDER",
        stateTimer: 0,
        stateCooldown: 0,
        wanderTarget: role === "defender"
          ? randomWaypointNear(MAP.teams[team].flagBase.x, MAP.teams[team].flagBase.y, 150)
          : randomWaypoint(),
        intermediateTarget: null,
        stuckTimer: 0,
        lastDistToTarget: Infinity,
        isDead: false,
        respawnTimer: 0,
        deathX: 0,
        deathY: 0,
      });
    }

    const flags: Record<Team, SimFlag> = {
      red: { x: MAP.teams.red.flagBase.x, y: MAP.teams.red.flagBase.y, atBase: true, carriedBy: null, dropped: false },
      blue: { x: MAP.teams.blue.flagBase.x, y: MAP.teams.blue.flagBase.y, atBase: true, carriedBy: null, dropped: false },
    };

    const snowballs: Snowball[] = [];

    const camera: Camera = {
      x: MAP.width / 2 - window.innerWidth / 2,
      y: MAP.height / 2 - window.innerHeight / 2,
      targetX: MAP.width / 2 - window.innerWidth / 2,
      targetY: MAP.height / 2 - window.innerHeight / 2,
      holdTimer: 5 + Math.random() * 5,
    };

    let lastTime = 0;
    let lastAITime = 0;

    // --- Canvas sizing ---
    function resize() {
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);

    // --- Bot AI ---
    function evaluateAI(bot: SimBot, dt: number) {
      if (bot.hit) return; // Don't re-evaluate while stunned

      bot.stateCooldown -= dt;

      // Carrying flag always overrides — return to base
      if (bot.carryingFlag) {
        bot.state = "RETURN_FLAG";
        return;
      }

      // Don't change state if cooldown hasn't expired (makes behavior stickier)
      if (bot.stateCooldown > 0) return;

      const enemyTeam: Team = bot.team === "red" ? "blue" : "red";
      const enemyFlag = flags[enemyTeam];
      const ownBase = MAP.teams[bot.team].flagBase;

      // Find nearest enemy
      let nearestEnemy: SimBot | null = null;
      let nearestDist = Infinity;
      for (const other of bots) {
        if (other.team === bot.team) continue;
        const d = dist(bot.x, bot.y, other.x, other.y);
        if (d < nearestDist) {
          nearestDist = d;
          nearestEnemy = other;
        }
      }

      switch (bot.role) {
        case "attacker": {
          // Primary goal: get the enemy flag
          if (!enemyFlag.carriedBy || enemyFlag.dropped) {
            bot.state = "CHASE_FLAG";
            bot.stateCooldown = 2;
          } else {
            // Flag is being carried by someone else — wander toward mid-map
            bot.state = "WANDER";
            bot.wanderTarget = randomWaypoint();
            bot.stateCooldown = 2 + Math.random() * 2;
          }
          // Engage only if enemy is very close
          if (nearestEnemy && nearestDist < ENGAGE_RANGE * 0.7 && bot.ammo > 0) {
            bot.state = "ENGAGE";
            bot.stateTimer = 1.2;
            bot.stateCooldown = 1.2;
            bot.aimAngle = Math.atan2(nearestEnemy.y - bot.y, nearestEnemy.x - bot.x);
          }
          break;
        }
        case "defender": {
          // Patrol near own flag base
          if (nearestEnemy && nearestDist < ENGAGE_RANGE && bot.ammo > 0) {
            // Defend! Engage nearby enemies
            bot.state = "ENGAGE";
            bot.stateTimer = 1.5;
            bot.stateCooldown = 1.5;
            bot.aimAngle = Math.atan2(nearestEnemy.y - bot.y, nearestEnemy.x - bot.x);
          } else {
            bot.state = "WANDER";
            bot.wanderTarget = randomWaypointNear(ownBase.x, ownBase.y, 200);
            bot.stateCooldown = 2 + Math.random() * 3;
          }
          break;
        }
        case "roamer": {
          // Wander around mid-map, engage enemies when spotted
          if (nearestEnemy && nearestDist < ENGAGE_RANGE && bot.ammo > 0) {
            bot.state = "ENGAGE";
            bot.stateTimer = 1.5;
            bot.stateCooldown = 1.5;
            bot.aimAngle = Math.atan2(nearestEnemy.y - bot.y, nearestEnemy.x - bot.x);
          } else if (bot.state !== "WANDER" || !bot.wanderTarget) {
            bot.state = "WANDER";
            bot.wanderTarget = randomWaypoint();
            bot.stateCooldown = 3 + Math.random() * 3;
          }
          break;
        }
      }
    }

    // --- Physics & simulation update ---
    function update(dt: number, now: number) {
      // AI evaluation
      if (now - lastAITime > AI_EVAL_INTERVAL) {
        const aiDt = (now - lastAITime) / 1000;
        lastAITime = now;
        for (const bot of bots) {
          evaluateAI(bot, aiDt);
        }
      }

      for (const bot of bots) {
        // Clear hit after 0.5s
        if (bot.hit && now - bot.hitTime > 500) {
          bot.hit = false;
        }

        // Freeze movement while stunned (matches real game)
        if (bot.hit) {
          bot.vx = 0;
          bot.vy = 0;
          continue;
        }

        // Ammo recharge
        if (bot.ammo < MAX_AMMO && now - bot.lastAmmoRechargeTime >= AMMO_RECHARGE_TIME) {
          bot.ammo++;
          bot.lastAmmoRechargeTime = now;
        }

        // Determine desired direction based on state
        let targetX = bot.x;
        let targetY = bot.y;

        const enemyTeam: Team = bot.team === "red" ? "blue" : "red";

        switch (bot.state) {
          case "WANDER": {
            if (bot.wanderTarget) {
              targetX = bot.wanderTarget.x;
              targetY = bot.wanderTarget.y;
              // Pick new waypoint when close
              if (dist(bot.x, bot.y, targetX, targetY) < 40) {
                bot.wanderTarget = bot.role === "defender"
                  ? randomWaypointNear(MAP.teams[bot.team].flagBase.x, MAP.teams[bot.team].flagBase.y, 200)
                  : randomWaypoint();
              }
            }
            break;
          }
          case "CHASE_FLAG": {
            const flag = flags[enemyTeam];
            targetX = flag.x;
            targetY = flag.y;
            break;
          }
          case "RETURN_FLAG": {
            const base = MAP.teams[bot.team].flagBase;
            targetX = base.x;
            targetY = base.y;
            break;
          }
          case "ENGAGE": {
            // Find nearest enemy specifically
            let nearest: SimBot | null = null;
            let nearDist = Infinity;
            for (const b of bots) {
              if (b.team === bot.team) continue;
              const d2 = dist(bot.x, bot.y, b.x, b.y);
              if (d2 < nearDist) { nearDist = d2; nearest = b; }
            }
            if (nearest) {
              // Don't run straight at them — keep some distance
              const enemyDist = dist(bot.x, bot.y, nearest.x, nearest.y);
              if (enemyDist > 120) {
                targetX = nearest.x;
                targetY = nearest.y;
              } else {
                // Strafe: move perpendicular to the enemy
                const toEnemyX = nearest.x - bot.x;
                const toEnemyY = nearest.y - bot.y;
                // Pick a consistent strafe direction based on bot id
                const strafeDir = bot.id.charCodeAt(bot.id.length - 1) % 2 === 0 ? 1 : -1;
                targetX = bot.x + (-toEnemyY * strafeDir);
                targetY = bot.y + (toEnemyX * strafeDir);
              }
              bot.aimAngle = Math.atan2(nearest.y - bot.y, nearest.x - bot.x);

              // Throw snowball
              if (
                bot.ammo > 0 &&
                now - bot.lastThrowTime > BOT_THROW_COOLDOWN &&
                snowballs.length < MAX_SNOWBALLS
              ) {
                const spread = (Math.random() - 0.5) * AIM_SPREAD * 2;
                const angle = bot.aimAngle + spread;
                snowballs.push({
                  x: bot.x + Math.cos(angle) * (PLAYER_RADIUS + SNOWBALL_RADIUS + 2),
                  y: bot.y + Math.sin(angle) * (PLAYER_RADIUS + SNOWBALL_RADIUS + 2),
                  vx: Math.cos(angle) * SNOWBALL_SPEED,
                  vy: Math.sin(angle) * SNOWBALL_SPEED,
                  owner: bot.id,
                });
                bot.ammo--;
                bot.lastThrowTime = now;
                if (bot.ammo < MAX_AMMO) {
                  bot.lastAmmoRechargeTime = now;
                }
              }
            }

            bot.stateTimer -= dt;
            if (bot.stateTimer <= 0) {
              bot.state = "WANDER";
              bot.stateCooldown = 0; // allow immediate re-eval
              bot.wanderTarget = bot.role === "defender"
                ? randomWaypointNear(MAP.teams[bot.team].flagBase.x, MAP.teams[bot.team].flagBase.y, 200)
                : randomWaypoint();
            }
            break;
          }
        }

        // Stuck detection: if bot isn't making progress toward target, reroute
        const distToTarget = dist(bot.x, bot.y, targetX, targetY);
        if (distToTarget > 30) {
          if (distToTarget >= bot.lastDistToTarget - 1) {
            // Not making progress
            bot.stuckTimer += dt;
          } else {
            bot.stuckTimer = 0;
            bot.intermediateTarget = null; // clear reroute if making progress
          }
          bot.lastDistToTarget = distToTarget;

          // If stuck, pick an intermediate waypoint perpendicular to the path
          if (bot.stuckTimer > STUCK_THRESHOLD) {
            bot.stuckTimer = 0;
            const toTargetX = targetX - bot.x;
            const toTargetY = targetY - bot.y;
            const toTargetD = Math.sqrt(toTargetX * toTargetX + toTargetY * toTargetY);
            if (toTargetD > 1) {
              // Pick perpendicular direction (alternate sides based on attempts)
              const perpDir = Math.random() < 0.5 ? 1 : -1;
              const perpX = (-toTargetY / toTargetD) * perpDir;
              const perpY = (toTargetX / toTargetD) * perpDir;
              // Offset 100-200px perpendicular + 50px forward
              const offset = 100 + Math.random() * 100;
              const intX = bot.x + perpX * offset + (toTargetX / toTargetD) * 50;
              const intY = bot.y + perpY * offset + (toTargetY / toTargetD) * 50;
              // Clamp to map bounds
              bot.intermediateTarget = {
                x: Math.max(PLAYER_RADIUS + 40, Math.min(MAP.width - PLAYER_RADIUS - 40, intX)),
                y: Math.max(PLAYER_RADIUS + 40, Math.min(MAP.height - PLAYER_RADIUS - 40, intY)),
              };
            }
          }
        } else {
          bot.stuckTimer = 0;
          bot.intermediateTarget = null;
          bot.lastDistToTarget = Infinity;
        }

        // Use intermediate target if we have one, otherwise go to real target
        let steerX = targetX;
        let steerY = targetY;
        if (bot.intermediateTarget) {
          steerX = bot.intermediateTarget.x;
          steerY = bot.intermediateTarget.y;
          // Clear intermediate target once we reach it
          if (dist(bot.x, bot.y, steerX, steerY) < 40) {
            bot.intermediateTarget = null;
          }
        }

        // Steering: accelerate toward steer target
        const dx = steerX - bot.x;
        const dy = steerY - bot.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        let ax = 0;
        let ay = 0;
        if (d > 5) {
          ax = (dx / d) * ACCELERATION;
          ay = (dy / d) * ACCELERATION;
        }

        // Wall avoidance force
        const wallAvoid = getWallAvoidance(bot.x, bot.y, MAP.walls);
        ax += wallAvoid.ax;
        ay += wallAvoid.ay;

        // Separation force: push apart from nearby bots
        for (const other of bots) {
          if (other === bot) continue;
          const sepDist = dist(bot.x, bot.y, other.x, other.y);
          if (sepDist < SEPARATION_DIST && sepDist > 0.1) {
            const pushX = (bot.x - other.x) / sepDist;
            const pushY = (bot.y - other.y) / sepDist;
            const strength = SEPARATION_FORCE * (1 - sepDist / SEPARATION_DIST);
            ax += pushX * strength;
            ay += pushY * strength;
          }
        }

        // Apply physics
        bot.vx += ax * dt;
        bot.vy += ay * dt;
        bot.vx *= Math.pow(FRICTION, dt);
        bot.vy *= Math.pow(FRICTION, dt);

        // Clamp speed
        const speed = Math.sqrt(bot.vx * bot.vx + bot.vy * bot.vy);
        if (speed > MAX_SPEED) {
          bot.vx = (bot.vx / speed) * MAX_SPEED;
          bot.vy = (bot.vy / speed) * MAX_SPEED;
        }

        // Move with wall collision (axis-separated)
        const newX = bot.x + bot.vx * dt;
        if (!collidesWall(newX, bot.y, PLAYER_RADIUS, MAP.walls)) {
          bot.x = newX;
        } else {
          bot.vx = 0;
        }

        const newY = bot.y + bot.vy * dt;
        if (!collidesWall(bot.x, newY, PLAYER_RADIUS, MAP.walls)) {
          bot.y = newY;
        } else {
          bot.vy = 0;
        }

        // Clamp to world bounds
        bot.x = Math.max(PLAYER_RADIUS, Math.min(MAP.width - PLAYER_RADIUS, bot.x));
        bot.y = Math.max(PLAYER_RADIUS, Math.min(MAP.height - PLAYER_RADIUS, bot.y));

        // Flag pickup: enemy flag
        const eFlag = flags[enemyTeam];
        if (!bot.carryingFlag && !eFlag.carriedBy && dist(bot.x, bot.y, eFlag.x, eFlag.y) < FLAG_PICKUP_DIST) {
          eFlag.carriedBy = bot.id;
          eFlag.atBase = false;
          eFlag.dropped = false;
          bot.carryingFlag = enemyTeam;
          bot.state = "RETURN_FLAG";
        }

        // Flag recovery: own team's dropped flag
        const ownFlag = flags[bot.team];
        if (ownFlag.dropped && !ownFlag.carriedBy && dist(bot.x, bot.y, ownFlag.x, ownFlag.y) < FLAG_PICKUP_DIST) {
          // Return to base
          ownFlag.x = MAP.teams[bot.team].flagBase.x;
          ownFlag.y = MAP.teams[bot.team].flagBase.y;
          ownFlag.atBase = true;
          ownFlag.dropped = false;
        }

        // Score: carrying flag and reaching own base
        if (bot.carryingFlag) {
          const base = MAP.teams[bot.team].flagBase;
          if (dist(bot.x, bot.y, base.x, base.y) < FLAG_PICKUP_DIST) {
            // Reset captured flag
            const capturedTeam = bot.carryingFlag;
            flags[capturedTeam].x = MAP.teams[capturedTeam].flagBase.x;
            flags[capturedTeam].y = MAP.teams[capturedTeam].flagBase.y;
            flags[capturedTeam].atBase = true;
            flags[capturedTeam].carriedBy = null;
            flags[capturedTeam].dropped = false;
            bot.carryingFlag = undefined;
            bot.state = "WANDER";
            bot.wanderTarget = randomWaypoint();
          }

          // Update carried flag position
          const cf = flags[bot.carryingFlag!];
          if (cf) {
            cf.x = bot.x;
            cf.y = bot.y;
          }
        }
      }

      // Update snowballs
      for (let i = snowballs.length - 1; i >= 0; i--) {
        const s = snowballs[i];
        s.x += s.vx * dt;
        s.y += s.vy * dt;

        // Remove if out of bounds or hits wall
        if (
          s.x < 0 || s.x > MAP.width || s.y < 0 || s.y > MAP.height ||
          collidesWall(s.x, s.y, SNOWBALL_RADIUS, MAP.walls)
        ) {
          snowballs.splice(i, 1);
          continue;
        }

        // Check hit on bots — stun only (matches real game)
        let hit = false;
        for (const bot of bots) {
          if (bot.hit || bot.id === s.owner) continue;
          // Only hit enemies
          const ownerBot = bots.find((b) => b.id === s.owner);
          if (ownerBot && ownerBot.team === bot.team) continue;

          if (dist(s.x, s.y, bot.x, bot.y) < PLAYER_RADIUS + SNOWBALL_RADIUS) {
            // Stun: freeze for 0.5s with X-eyes
            bot.hit = true;
            bot.hitTime = now;
            bot.vx = 0;
            bot.vy = 0;
            hit = true;
            break;
          }
        }
        if (hit) {
          snowballs.splice(i, 1);
        }
      }

      // Camera drift
      camera.holdTimer -= dt;
      if (camera.holdTimer <= 0) {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        camera.targetX = Math.random() * Math.max(0, MAP.width - vw);
        camera.targetY = Math.random() * Math.max(0, MAP.height - vh);
        camera.holdTimer = 8 + Math.random() * 7;
      }
      camera.x += (camera.targetX - camera.x) * 0.015;
      camera.y += (camera.targetY - camera.y) * 0.015;
    }

    // --- Render loop ---
    let rafId: number;

    function draw(timestamp: number) {
      rafId = requestAnimationFrame(draw);

      if (!lastTime) {
        lastTime = timestamp;
        lastAITime = timestamp;
      }
      const dt = Math.min((timestamp - lastTime) / 1000, 0.1);
      lastTime = timestamp;

      update(dt, timestamp);

      const w = window.innerWidth;
      const h = window.innerHeight;

      ctx!.clearRect(0, 0, w, h);
      drawVoidBackground(ctx!, w, h);

      ctx!.save();
      ctx!.translate(-camera.x, -camera.y);

      drawGridBackground(ctx!, MAP.width, MAP.height, GRID_SIZE);
      drawWalls(ctx!, MAP.walls, wallGroups);

      // Draw flags
      const renderFlags = {
        red: toFlagState(flags.red),
        blue: toFlagState(flags.blue),
      };

      // Ghost flags (when flag not at base)
      if (!flags.red.atBase) {
        drawGhostFlag(ctx!, MAP.teams.red.flagBase.x, MAP.teams.red.flagBase.y, "red");
      }
      if (!flags.blue.atBase) {
        drawGhostFlag(ctx!, MAP.teams.blue.flagBase.x, MAP.teams.blue.flagBase.y, "blue");
      }

      // Actual flags (only draw if not carried — carried flags are drawn by drawPlayer)
      if (!flags.red.carriedBy) {
        drawFlag(ctx!, flags.red.x, flags.red.y, "red", flags.red.dropped);
      }
      if (!flags.blue.carriedBy) {
        drawFlag(ctx!, flags.blue.x, flags.blue.y, "blue", flags.blue.dropped);
      }

      // Draw bots
      for (const bot of bots) {
        const p = toPlayer(bot);
        drawPlayer(ctx!, p, PLAYER_RADIUS, renderFlags);
        drawPlayerNickname(ctx!, p, PLAYER_RADIUS);
      }

      // Draw snowballs
      drawSnowballs(ctx!, snowballs, SNOWBALL_RADIUS);

      ctx!.restore();

      rafId = rafId; // keep reference
    }

    rafId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
    };
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
        pointerEvents: "none",
      }}
    />
  );
}
