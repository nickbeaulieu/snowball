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
  carryingFlag?: boolean; // true if carrying the neutral flag
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
  flag: FlagState;
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
