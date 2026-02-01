// Shared movement/game constants for both client and server

export const ACCELERATION = 1200; // px/s^2
export const FRICTION = 0.3; // velocity decay per second (0.3 = 70% lost per second)
export const MAX_SPEED = 220; // px/s
export const DT = 1 / 30; // seconds per tick
export const CORRECTION_DURATION = 0.12; // seconds (120ms)
export const CORRECTION_THRESHOLD = 50; // pixels
