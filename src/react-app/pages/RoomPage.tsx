import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import type {
  RoomPhase,
  RoomConfig,
  PlayerReadyState,
  PlayerStatsEntry,
  Team,
  GameState,
  ServerSnapshot,
} from "../../types";
import type { MapDefinition } from "../../maps";
import { Lobby } from "../components/Lobby";
import { GameCanvas } from "../game-canvas";
import { GameFinished } from "../components/GameFinished";
import { initAudio, playGameStartSound, playGameOverSound, setMasterVolume } from "../sounds";

type LobbyState = {
  phase: RoomPhase;
  config: RoomConfig;
  readyStates: PlayerReadyState[];
  hostId: string;
  timeRemaining?: number;
  winner?: Team;
  mapData: MapDefinition;
  playerStats?: PlayerStatsEntry[];
};

export function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const [lobbyState, setLobbyState] = useState<LobbyState | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [connected, setConnected] = useState(false);
  const [clientId] = useState<string>(() => {
    let id = localStorage.getItem("clientId");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("clientId", id);
    }
    return id;
  });
  const [muted, setMuted] = useState(false);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [nickname, setNickname] = useState<string>(() => {
    return localStorage.getItem("playerNickname") || "";
  });

  // Buffer for game state messages received during phase transition
  // This captures messages that arrive between lobby→playing phase change
  // and GameCanvas mounting its listener
  const gameStateBufferRef = useRef<ServerSnapshot[]>([]);

  // Track previous phase to detect transitions
  const prevPhaseRef = useRef<RoomPhase | null>(null);

  // State to pass initial snapshots to GameCanvas (snapshot of buffer at mount time)
  const [initialSnapshots, setInitialSnapshots] = useState<ServerSnapshot[]>([]);

  // Persist nickname to localStorage
  useEffect(() => {
    if (nickname) {
      localStorage.setItem("playerNickname", nickname);
    }
  }, [nickname]);

  // Send nickname to server when connected
  useEffect(() => {
    if (ws && ws.readyState === WebSocket.OPEN && nickname) {
      ws.send(JSON.stringify({ type: "set_nickname", nickname }));
    }
  }, [ws, nickname]);

  // Get phase from lobbyState to avoid duplication
  const phase = lobbyState?.phase || "lobby";

  // WebSocket effect
  useEffect(() => {
    if (!roomId || !clientId) return;

    const host = window.location.host;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${host}/api/join?room=${roomId}&clientId=${clientId}`;

    const websocket = new WebSocket(wsUrl);

    const handleOpen = () => {
      setWs(websocket);
      setConnected(true);
    };

    const handleMessage = (e: MessageEvent) => {
      const msg = JSON.parse(e.data);

      if (msg.type === "lobby_state") {
        const prevPhase = prevPhaseRef.current;
        const newPhase = msg.phase;

        // Detect lobby → playing transition
        if (prevPhase === "lobby" && newPhase === "playing") {
          // Clear any stale buffered messages from previous game
          gameStateBufferRef.current = [];
          // Snapshot buffer for GameCanvas mount
          setInitialSnapshots([]);
          initAudio();
          playGameStartSound();
        }

        // Detect playing → finished transition
        if (prevPhase === "playing" && newPhase === "finished") {
          const myReady = msg.readyStates?.find(
            (rs: PlayerReadyState) => rs.playerId === clientId,
          );
          const won = myReady?.selectedTeam === msg.winner;
          playGameOverSound(won);
        }

        setLobbyState(msg);
        prevPhaseRef.current = newPhase;

      } else if (msg.type === "state") {
        setGameState(msg.state);

        // Buffer game state messages during transition window
        // GameCanvas will consume this buffer on mount
        if (lobbyState?.phase === "playing") {
          gameStateBufferRef.current.push(msg);
          // Update state with buffered messages for GameCanvas
          setInitialSnapshots([...gameStateBufferRef.current]);
          // Limit buffer size to prevent memory issues (50 messages ≈ 1.6 seconds at 30Hz)
          if (gameStateBufferRef.current.length > 50) {
            gameStateBufferRef.current.shift();
          }
        }
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const handleClose = (_: CloseEvent) => {
      setConnected(false);
      setWs(null);
    };

    const handleError = (err: Event) => {
      console.error("WebSocket error:", err);
    };

    websocket.addEventListener("open", handleOpen);
    websocket.addEventListener("message", handleMessage);
    websocket.addEventListener("close", handleClose);
    websocket.addEventListener("error", handleError);

    return () => {
      websocket.removeEventListener("open", handleOpen);
      websocket.removeEventListener("message", handleMessage);
      websocket.removeEventListener("close", handleClose);
      websocket.removeEventListener("error", handleError);
      if (websocket.readyState === WebSocket.OPEN || websocket.readyState === WebSocket.CONNECTING) {
        websocket.close();
      }
    };
  }, [roomId, clientId]);

  const copyRoomLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    alert("Room link copied to clipboard!");
  };

  if (!roomId) {
    return (
      <div style={{ padding: "2rem", textAlign: "center" }}>
        <h2>Invalid room ID</h2>
      </div>
    );
  }

  if (!connected) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(to bottom, #e0f2ff, #bae6fd)",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <h2 style={{ color: "#0c4a6e", marginBottom: "1rem" }}>
            Connecting to room...
          </h2>
          <p style={{ color: "#64748b" }}>Room: {roomId}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh" }}>
      {/* Room header */}
      
      {lobbyState?.phase === 'lobby' && (
        <div
        style={{
          position: "absolute",
          top: "1rem",
          right: "1rem",
          zIndex: 100,
          background: "rgba(255, 255, 255, 0.9)",
          padding: "0.75rem 1rem",
          borderRadius: "0.5rem",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
        }}
      >
        <span style={{ fontSize: "0.875rem", color: "#64748b" }}>
          Room: <strong style={{ color: "#0c4a6e" }}>{roomId}</strong>
        </span>
        <button
          onClick={copyRoomLink}
          style={{
            padding: "0.5rem 0.75rem",
            fontSize: "0.875rem",
            background: "#3b82f6",
            color: "white",
            border: "none",
            borderRadius: "0.375rem",
            cursor: "pointer",
            fontWeight: "500",
          }}
        >
          Copy Link
        </button>
      </div>
      )}

      {/* Render based on phase */}
      {!lobbyState && (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "linear-gradient(to bottom, #e0f2ff, #bae6fd)",
          }}
        >
          <div style={{ textAlign: "center" }}>
            <h2 style={{ color: "#0c4a6e", marginBottom: "1rem" }}>
              Waiting for lobby state...
            </h2>
            <p style={{ color: "#64748b" }}>
              Check browser console for connection details
            </p>
          </div>
        </div>
      )}

      {phase === "lobby" && lobbyState && ws && (
        <Lobby
          lobbyState={lobbyState}
          websocket={ws}
          clientId={clientId}
          nickname={nickname}
          onNicknameChange={setNickname}
        />
      )}

      {(phase === "playing" || phase === "finished") && (
        <button
          onClick={() => {
            const newMuted = !muted;
            setMuted(newMuted);
            setMasterVolume(newMuted ? 0 : 0.7);
          }}
          style={{
            position: "fixed",
            top: "1rem",
            left: "1rem",
            zIndex: 100,
            background: "rgba(0, 0, 0, 0.4)",
            color: "white",
            border: "none",
            borderRadius: "50%",
            width: "36px",
            height: "36px",
            cursor: "pointer",
            fontSize: "1.1rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          title={muted ? "Unmute" : "Mute"}
        >
          {muted ? "\u{1F507}" : "\u{1F50A}"}
        </button>
      )}

      {phase === "playing" && lobbyState && ws && (
        <GameCanvas
          websocket={ws}
          clientId={clientId}
          mapData={lobbyState.mapData}
          initialSnapshots={initialSnapshots}
        />
      )}

      {phase === "finished" && lobbyState && ws && (
        <GameFinished
          winner={lobbyState.winner}
          scores={gameState?.scores}
          isHost={lobbyState.hostId === clientId}
          websocket={ws}
          playerStats={lobbyState.playerStats}
          clientId={clientId}
        />
      )}
    </div>
  );
}
