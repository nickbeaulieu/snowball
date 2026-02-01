import { Hono } from "hono";

type Env = {
  ROOM: DurableObjectNamespace;
};

const app = new Hono<{ Bindings: Env }>();

app.get("/api/health", (c) => {
  return c.json({ ok: true });
});

/**
 * Matchmaking / join room
 */
app.get("/api/join", async (c) => {
  const room = c.req.query("room") ?? "lobby";
  const id = c.env.ROOM.idFromName(room);
  const stub = c.env.ROOM.get(id);

  console.log("Joining room:", room);

  // Let the DO handle the WebSocket upgrade
  return stub.fetch(c.req.raw);
});

export { Room } from "./room";

export default app;
