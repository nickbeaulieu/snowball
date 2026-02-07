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

// Room phase management
export type RoomPhase = "lobby" | "playing" | "finished";

// Room configuration for game settings
export type RoomConfig = {
  scoreLimit: number; // 0 = unlimited, otherwise first to X points wins
  timeLimit: number; // 0 = unlimited, otherwise game duration in seconds
  allowManualTeams: boolean; // true = players choose teams, false = auto-balance
};

// Player ready state for lobby
export type PlayerReadyState = {
  playerId: string;
  isReady: boolean;
  selectedTeam?: Team;
};

// Client to server messages
export type ClientMessage =
  | { type: "input"; seq: number; up: boolean; down: boolean; left: boolean; right: boolean }
  | { type: "throw"; dir: { x: number; y: number } }
  | { type: "drop_flag" }
  | { type: "ready"; ready: boolean }
  | { type: "select_team"; team: Team }
  | { type: "update_config"; config: Partial<RoomConfig> }
  | { type: "start_game" }
  | { type: "reset_game" };

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
    };
