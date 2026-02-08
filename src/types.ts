import type { MapDefinition } from "./maps";

export type Team = "red" | "blue";

export type Player = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  input: { up: boolean; down: boolean; left: boolean; right: boolean };
  lastProcessedInput: number;
  lastThrowTime: number;
  lastSeen: number;
  nickname?: string;
  hit: boolean;
  hitTime: number;
  team: Team;
  carryingFlag?: Team; // which flag (red or blue) is being carried
  lastDropTime?: number; // timestamp of last flag drop (for cooldown)
};

export type FlagState = {
  x: number;
  y: number;
  atBase: boolean;
  carriedBy?: string; // player id if being carried
  dropped?: boolean; // true if dropped on the ground
};

export type GameState = {
  players: Player[];
  snowballs: Snowball[];
  flags: Record<Team, FlagState>; // each team has their own flag
  scores: Record<Team, number>;
  timeRemaining?: number; // seconds remaining in game (if time limit set)
};

export type ServerSnapshot = {
  type: "state";
  state: GameState;
  timestamp?: number;
};
export type Snowball = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  owner: string;
};

// Particle for visual effects
export type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // 0 to 1, decreases over time
  maxLife: number; // starting life in ms
  size: number;
  color: string;
  type: 'impact' | 'celebration' | 'trail';
  createdAt: number; // timestamp
};

// Room phase management
export type RoomPhase = "lobby" | "playing" | "finished";

// Room configuration for game settings
export type RoomConfig = {
  scoreLimit: number; // 0 = unlimited, otherwise first to X points wins
  timeLimit: number; // 0 = unlimited, otherwise game duration in seconds
  mapId?: string; // Optional map ID, defaults to 'classic'
};

// Player ready state for lobby
export type PlayerReadyState = {
  playerId: string;
  isReady: boolean;
  selectedTeam?: Team;
  nickname?: string;
};

// Client to server messages
export type ClientMessage =
  | { type: "input"; seq: number; up: boolean; down: boolean; left: boolean; right: boolean }
  | { type: "throw"; dir: { x: number; y: number } }
  | { type: "drop_flag" }
  | { type: "ready"; ready: boolean }
  | { type: "select_team"; team: Team }
  | { type: "update_config"; config: Partial<RoomConfig> }
  | { type: "select_map"; mapId: string }
  | { type: "start_game" }
  | { type: "reset_game" }
  | { type: "set_nickname"; nickname: string };

// Server to client messages
export type ServerMessage =
  | ServerSnapshot
  | {
      type: "lobby_state";
      phase: RoomPhase;
      config: RoomConfig;
      readyStates: PlayerReadyState[];
      hostId: string;
      timeRemaining?: number; // seconds remaining in game (if time limit set)
      winner?: Team; // set when phase is "finished"
      mapData: MapDefinition; // Current map definition
    };
