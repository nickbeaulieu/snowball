# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Start local dev server (Vite + Cloudflare Workers)
- `npm run build` — TypeScript compile + Vite build
- `npm run check` — TypeScript check, build, and dry-run deploy (use as CI gate)
- `npm run lint` — ESLint
- `npm run deploy` — Deploy to Cloudflare Workers
- No test framework is configured
- **Always use `npm run check` for validation — never run `tsc` directly**

## Architecture

Real-time multiplayer Capture-the-Flag snowball game. React frontend renders on Canvas 2D; Cloudflare Workers backend runs the authoritative game loop via Durable Objects.

### Client-Server Model

- **Server (src/server/)**: Hono app (`index.ts`) exposes `/api/join` WebSocket endpoint. `Room` Durable Object (`room.ts`) runs a 30 FPS game loop that processes inputs, simulates physics, handles CTF mechanics, and broadcasts state snapshots to all connected clients.
- **Client (src/react-app/)**: React app with `game-canvas.tsx` as the core gameplay file. Uses client-side prediction with snapshot interpolation — the client maintains a predicted player state, buffers server snapshots, and reapplies unacknowledged inputs after corrections.
- **Shared (src/constants.ts, src/types.ts, src/maps/)**: Physics constants, game types, and map definitions used by both client and server.

### Game Flow

HomePage → RoomPage → Lobby (team select, config) → GameCanvas (playing) → GameFinished

Three phases: `"lobby"` → `"playing"` → `"finished"`. Host can configure score/time limits and select maps.

### WebSocket Messages

Type-safe `ClientMessage` / `ServerMessage` unions in `src/types.ts`. Server sends `ServerSnapshot` (game state at 30fps) and `LobbyState` (phase/config changes). Client sends input state, throw/drop actions, and lobby interactions.

### Maps

Map definitions live in `src/maps/`. Each map defines dimensions, wall positions, team spawn zones, and flag bases. Registered in `src/maps/index.ts`.

### Key Physics (src/constants.ts)

Grid-aligned 40px walls, 20px player radius, 30 FPS tick rate. Player movement uses acceleration (1500 px/s²) + friction (0.3) with 300 px/s max speed. Snowballs travel at 500 px/s. Max 4 ammo with 600ms recharge.

### Player Liveness (room.ts)

The game loop disconnects players whose `lastSeen` exceeds 5 seconds (stale-player check). `lastSeen` only updates when the client sends a WebSocket message. Phase transitions (e.g. lobby → playing) must reset `lastSeen` for all players, otherwise idle lobby players get kicked immediately.

### Client-Side Prediction (game-canvas.tsx)

Maintains `predictedPlayerRef` separate from server state. Reapplies unacknowledged inputs on each server snapshot. When server and predicted positions diverge beyond 50px, applies smooth blended correction on both position and velocity.
