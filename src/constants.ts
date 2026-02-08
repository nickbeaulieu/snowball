export const GRID_SIZE = 40; // px - grid cell size for background and wall alignment
export const WALL_THICKNESS = 40; // px - standard wall thickness
export const SNOWBALL_SPEED = 500; // px/s
export const SNOWBALL_RADIUS = 7;
export const SNOWBALL_LIFETIME = 1.2; // seconds
// Shared movement/game constants for both client and server

export const PLAYER_RADIUS = 20;

export const ACCELERATION = 1500; // px/s^2
export const FRICTION = 0.3; // velocity decay per second (0.3 = 70% lost per second)
export const MAX_SPEED = 300; // px/s
export const DT = 1 / 30; // seconds per tick
export const CORRECTION_DURATION = 0.12; // seconds (120ms)
export const CORRECTION_THRESHOLD = 50; // pixels
