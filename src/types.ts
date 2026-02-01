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
};

export type ServerSnapshot = {
  type: "state";
  players: Player[];
  snowballs: { x: number; y: number }[];
};
export type Snowball = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  owner: string;
};
