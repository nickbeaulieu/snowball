export const WORLD_WIDTH = 2000;
export const WORLD_HEIGHT = 1000;
export const SNOWBALL_SPEED = 400; // px/s
export const SNOWBALL_RADIUS = 4;
export const SNOWBALL_LIFETIME = 1.5; // seconds
// Shared movement/game constants for both client and server

export const PLAYER_RADIUS = 20;

export const ACCELERATION = 1200; // px/s^2
export const FRICTION = 0.3; // velocity decay per second (0.3 = 70% lost per second)
export const MAX_SPEED = 220; // px/s
export const DT = 1 / 30; // seconds per tick
export const CORRECTION_DURATION = 0.12; // seconds (120ms)
export const CORRECTION_THRESHOLD = 50; // pixels
