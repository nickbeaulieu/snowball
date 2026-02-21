import { useState } from "react"; 
import type { Team } from "../../types";
import type { MapDefinition } from "../../maps";
import { getAllMaps } from "../../maps";

type LobbyProps = {
  lobbyState: {
    config: {
      scoreLimit: number;
      timeLimit: number;
      mapId?: string;
    };
    readyStates: Array<{
      playerId: string;
      isReady: boolean;
      selectedTeam?: Team;
      nickname?: string;
    }>;
    hostId: string;
    mapData: MapDefinition;
  };
  websocket: WebSocket;
  clientId: string;
  nickname: string;
  onNicknameChange: (nickname: string) => void;
};

export function Lobby({ lobbyState, websocket, clientId, nickname, onNicknameChange }: LobbyProps) {
  const [showOptions, setShowOptions] = useState(false);
  const isHost = lobbyState.hostId === clientId;
  const myReadyState = lobbyState.readyStates.find(
    (rs) => rs.playerId === clientId
  );
  // Check if majority (>50%) of non-host players are ready
  const otherPlayers = lobbyState.readyStates.filter(
    (rs) => rs.playerId !== lobbyState.hostId
  );
  const readyCount = otherPlayers.filter((rs) => rs.isReady).length;
  const majorityReady =
    otherPlayers.length === 0 || readyCount > otherPlayers.length / 2;

  const sendMessage = (msg: unknown) => {
    if (websocket.readyState === WebSocket.OPEN) {
      websocket.send(JSON.stringify(msg));
    }
  };

  const handleToggleReady = () => {
    sendMessage({ type: "ready", ready: !myReadyState?.isReady });
  };

  const handleSelectTeam = (team: Team) => {
    sendMessage({ type: "select_team", team });
  };

  const handleUpdateConfig = (config: unknown) => {
    sendMessage({ type: "update_config", config });
  };

  const handleSelectMap = (mapId: string) => {
    sendMessage({ type: "select_map", mapId });
  };

  const handleStartGame = () => {
    sendMessage({ type: "start_game" });
  };

  const redPlayers = lobbyState.readyStates.filter(
    (rs) => rs.selectedTeam === "red"
  );
  const bluePlayers = lobbyState.readyStates.filter(
    (rs) => rs.selectedTeam === "blue"
  );

  const selectStyle = {
    width: "100%",
    padding: "0.5rem",
    fontSize: "0.875rem",
    border: "2px solid #e2e8f0",
    borderRadius: "0.375rem",
    background: "white",
    color: "#333",
    cursor: "pointer",
  } as const;

  const labelStyle = {
    display: "block",
    marginBottom: "0.25rem",
    fontSize: "0.75rem",
    fontWeight: "600",
    color: "#475569",
  } as const;

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: myReadyState?.selectedTeam === "red"
          ? "linear-gradient(to bottom, #fee2e2, #fecaca)"
          : myReadyState?.selectedTeam === "blue"
            ? "linear-gradient(to bottom, #dbeafe, #bfdbfe)"
            : "linear-gradient(to bottom, #e0f2ff, #bae6fd)",
        transition: "background 0.3s",
        padding: "1rem",
      }}
    >
      <div
        style={{
          maxWidth: "800px",
          width: "100%",
          background: "white",
          borderRadius: "1rem",
          boxShadow: myReadyState?.selectedTeam === "red"
            ? "0 0 20px rgba(239, 68, 68, 0.3), 0 0 40px rgba(239, 68, 68, 0.1)"
            : myReadyState?.selectedTeam === "blue"
              ? "0 0 20px rgba(59, 130, 246, 0.3), 0 0 40px rgba(59, 130, 246, 0.1)"
              : "0 4px 12px rgba(0, 0, 0, 0.1)",
          border: myReadyState?.selectedTeam === "red"
            ? "2px solid rgba(239, 68, 68, 0.3)"
            : myReadyState?.selectedTeam === "blue"
              ? "2px solid rgba(59, 130, 246, 0.3)"
              : "2px solid transparent",
          padding: "1.5rem",
          transition: "box-shadow 0.3s, border-color 0.3s",
        }}
      >
        <h1
          style={{
            fontSize: "1.5rem",
            marginBottom: "0.25rem",
            color: "#0c4a6e",
            textAlign: "center",
          }}
        >
          ❄️ Lobby
        </h1>
        <p
          style={{
            textAlign: "center",
            color: "#64748b",
            marginBottom: "1rem",
            fontSize: "0.875rem",
          }}
        >
          {isHost
            ? "Configure settings and start when ready"
            : "Waiting for host to start the game"}
        </p>

        {/* Nickname */}
        <div
          style={{
            marginBottom: "0.75rem",
            padding: "1rem",
            background: "#f8fafc",
            borderRadius: "0.5rem",
            border: "2px solid #e2e8f0",
          }}
        >
          <label style={labelStyle}>Your Nickname</label>
          <input
            type="text"
            value={nickname}
            onChange={(e) => onNicknameChange(e.target.value)}
            onBlur={(e) => {
              sendMessage({
                type: "set_nickname",
                nickname: e.target.value
              });
            }}
            placeholder="Enter your nickname..."
            maxLength={20}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "0.5rem",
              fontSize: "0.875rem",
              border: "2px solid #e2e8f0",
              borderRadius: "0.375rem",
              background: "white",
              color: "#333",
              outline: "none",
            }}
          />
        </div>

        {/* Team Selection */}
        <div style={{ marginBottom: "1rem" }}>
          <label style={labelStyle}>Select Your Team</label>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button
              onClick={() => handleSelectTeam("red")}
              disabled={myReadyState?.selectedTeam === "red"}
              style={{
                flex: 1,
                padding: "0.625rem",
                fontSize: "0.875rem",
                fontWeight: "600",
                color: "white",
                background:
                  myReadyState?.selectedTeam === "red"
                    ? "linear-gradient(to bottom, #ef4444, #dc2626)"
                    : "#ef4444",
                border: "none",
                borderRadius: "0.5rem",
                cursor:
                  myReadyState?.selectedTeam === "red"
                    ? "default"
                    : "pointer",
                opacity: myReadyState?.selectedTeam === "red" ? 1 : 0.6,
                boxShadow:
                  myReadyState?.selectedTeam === "red"
                    ? "0 4px 12px rgba(220, 38, 38, 0.3)"
                    : "none",
                transition: "all 0.2s",
              }}
            >
              🔴 Red ({redPlayers.length})
            </button>
            <button
              onClick={() => handleSelectTeam("blue")}
              disabled={myReadyState?.selectedTeam === "blue"}
              style={{
                flex: 1,
                padding: "0.625rem",
                fontSize: "0.875rem",
                fontWeight: "600",
                color: "white",
                background:
                  myReadyState?.selectedTeam === "blue"
                    ? "linear-gradient(to bottom, #3b82f6, #2563eb)"
                    : "#3b82f6",
                border: "none",
                borderRadius: "0.5rem",
                cursor:
                  myReadyState?.selectedTeam === "blue"
                    ? "default"
                    : "pointer",
                opacity: myReadyState?.selectedTeam === "blue" ? 1 : 0.6,
                boxShadow:
                  myReadyState?.selectedTeam === "blue"
                    ? "0 4px 12px rgba(37, 99, 235, 0.3)"
                    : "none",
                transition: "all 0.2s",
              }}
            >
              🔵 Blue ({bluePlayers.length})
            </button>
          </div>
        </div>

        {/* Game Settings - Host Only */}
        {isHost && (
          <div
            style={{
              marginBottom: "1rem",
              padding: "1rem",
              background: "#f8fafc",
              borderRadius: "0.5rem",
              border: "2px solid #e2e8f0",
            }}
          >
            <h2
              style={{
                fontSize: "0.875rem",
                fontWeight: "600",
                marginBottom: "0.5rem",
                color: "#334155",
              }}
            >
              Game Settings
            </h2>

            <div style={{ marginBottom: "0.5rem" }}>
              <label style={labelStyle}>Map</label>
              <select
                value={lobbyState.mapData.id}
                onChange={(e) => handleSelectMap(e.target.value)}
                style={selectStyle}
              >
                {getAllMaps().map((map) => (
                  <option key={map.id} value={map.id}>
                    {map.name}
                    {map.description ? ` - ${map.description}` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", gap: "0.75rem" }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Score Limit</label>
                <select
                  value={lobbyState.config.scoreLimit}
                  onChange={(e) =>
                    handleUpdateConfig({
                      scoreLimit: parseInt(e.target.value),
                    })
                  }
                  style={selectStyle}
                >
                  <option value="0">Unlimited</option>
                  <option value="3">First to 3</option>
                  <option value="5">First to 5</option>
                  <option value="10">First to 10</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Time Limit</label>
                <select
                  value={lobbyState.config.timeLimit}
                  onChange={(e) =>
                    handleUpdateConfig({
                      timeLimit: parseInt(e.target.value),
                    })
                  }
                  style={selectStyle}
                >
                  <option value="0">Unlimited</option>
                  <option value="180">3 minutes</option>
                  <option value="300">5 minutes</option>
                  <option value="420">7 minutes</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Player List */}
        <div style={{ marginBottom: "1rem" }}>
          <h2
            style={{
              fontSize: "0.875rem",
              fontWeight: "600",
              marginBottom: "0.5rem",
              color: "#334155",
            }}
          >
            Players ({lobbyState.readyStates.length})
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            {lobbyState.readyStates.map((rs) => (
              <div
                key={rs.playerId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.5rem 0.75rem",
                  background:
                    rs.playerId === clientId ? "#eff6ff" : "#f8fafc",
                  border:
                    rs.playerId === clientId
                      ? "2px solid #3b82f6"
                      : "2px solid #e2e8f0",
                  borderRadius: "0.375rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <div
                    style={{
                      width: "0.625rem",
                      height: "0.625rem",
                      borderRadius: "50%",
                      background:
                        rs.selectedTeam === "red" ? "#ef4444" : "#3b82f6",
                    }}
                  />
                  <span
                    style={{
                      fontSize: "0.875rem",
                      color: "#334155",
                      fontWeight: rs.playerId === clientId ? "600" : "400",
                    }}
                  >
                    {rs.playerId === clientId
                      ? (rs.nickname || "You")
                      : (rs.nickname || rs.playerId.slice(0, 8))}
                  </span>
                  {rs.playerId === lobbyState.hostId && (
                    <span
                      style={{
                        fontSize: "0.625rem",
                        padding: "0.125rem 0.375rem",
                        background: "#fef3c7",
                        color: "#92400e",
                        borderRadius: "0.25rem",
                        fontWeight: "600",
                      }}
                    >
                      HOST
                    </span>
                  )}
                </div>
                <div>
                  {rs.isReady ? (
                    <span
                      style={{
                        fontSize: "0.75rem",
                        color: "#059669",
                        fontWeight: "600",
                      }}
                    >
                      ✓ Ready
                    </span>
                  ) : (
                    <span
                      style={{
                        fontSize: "0.75rem",
                        color: "#94a3b8",
                      }}
                    >
                      Not ready
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Ready/Start Button */}
        <div>
          {isHost ? (
            <button
              onClick={handleStartGame}
              disabled={!majorityReady}
              style={{
                width: "100%",
                padding: "0.75rem",
                fontSize: "1rem",
                fontWeight: "600",
                color: "white",
                background: majorityReady
                  ? "linear-gradient(to bottom, #10b981, #059669)"
                  : "#cbd5e1",
                border: "none",
                borderRadius: "0.5rem",
                cursor: majorityReady ? "pointer" : "not-allowed",
                boxShadow: majorityReady
                  ? "0 4px 12px rgba(5, 150, 105, 0.3)"
                  : "none",
                transition: "all 0.2s",
              }}
            >
              {majorityReady
                ? "Start Game"
                : `Waiting for players to ready up (${readyCount}/${otherPlayers.length})...`}
            </button>
          ) : (
            <button
              onClick={handleToggleReady}
              style={{
                width: "100%",
                padding: "0.75rem",
                fontSize: "1rem",
                fontWeight: "600",
                color: "white",
                background: myReadyState?.isReady
                  ? "linear-gradient(to bottom, #f59e0b, #d97706)"
                  : "linear-gradient(to bottom, #10b981, #059669)",
                border: "none",
                borderRadius: "0.5rem",
                cursor: "pointer",
                boxShadow: myReadyState?.isReady
                  ? "0 4px 12px rgba(217, 119, 6, 0.3)"
                  : "0 4px 12px rgba(5, 150, 105, 0.3)",
                transition: "all 0.2s",
              }}
            >
              {myReadyState?.isReady ? "Not Ready" : "Ready"}
            </button>
          )}
          <button
            onClick={() => setShowOptions(true)}
            style={{
              width: "100%",
              marginTop: "0.75rem",
              padding: "0.65rem 1rem",
              fontFamily: "'Segoe UI', system-ui, sans-serif",
              fontSize: "0.95rem",
              fontWeight: "600",
              color: "#475569",
              background: "white",
              border: "2px solid #94a3b8",
              borderRadius: "0.5rem",
              cursor: "pointer",
              transition: "border-color 0.2s, color 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "#64748b";
              e.currentTarget.style.color = "#0f172a";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "#94a3b8";
              e.currentTarget.style.color = "#475569";
            }}
          >
            Options
          </button>
        </div>
      </div>

      {showOptions && (
        <div
          onClick={() => setShowOptions(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "white",
              borderRadius: "1rem",
              boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
              padding: "1.5rem",
              width: "480px",
              maxWidth: "90vw",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
              <h2 style={{ fontSize: "1rem", fontWeight: "600", color: "#0c4a6e", margin: 0 }}>Options</h2>
              <button
                onClick={() => setShowOptions(false)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "1.25rem",
                  cursor: "pointer",
                  color: "#94a3b8",
                  lineHeight: 1,
                  padding: "0.25rem",
                }}
              >
                ✕
              </button>
            </div>
            <p style={{ color: "#94a3b8", fontSize: "0.875rem", textAlign: "center", margin: 0 }}>
              No options available
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
