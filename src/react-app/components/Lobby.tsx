import type { Team } from "../../types";

type LobbyProps = {
  lobbyState: {
    config: {
      scoreLimit: number;
      timeLimit: number;
      allowManualTeams: boolean;
    };
    readyStates: Array<{
      playerId: string;
      isReady: boolean;
      selectedTeam?: Team;
    }>;
    hostId: string;
  };
  websocket: WebSocket;
  clientId: string;
};

export function Lobby({ lobbyState, websocket, clientId }: LobbyProps) {
  const isHost = lobbyState.hostId === clientId;
  const myReadyState = lobbyState.readyStates.find(
    (rs) => rs.playerId === clientId
  );
  // Check if all non-host players are ready (host doesn't need to be ready)
  const allOthersReady = lobbyState.readyStates
    .filter((rs) => rs.playerId !== lobbyState.hostId)
    .every((rs) => rs.isReady);

  const sendMessage = (msg: any) => {
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

  const handleUpdateConfig = (config: any) => {
    sendMessage({ type: "update_config", config });
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

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(to bottom, #e0f2ff, #bae6fd)",
        padding: "2rem",
      }}
    >
      <div
        style={{
          maxWidth: "800px",
          width: "100%",
          background: "white",
          borderRadius: "1rem",
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
          padding: "2rem",
        }}
      >
        <h1
          style={{
            fontSize: "2rem",
            marginBottom: "0.5rem",
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
            marginBottom: "2rem",
          }}
        >
          {isHost
            ? "Configure settings and start when ready"
            : "Waiting for host to start the game"}
        </p>

        {/* Game Settings - Host Only */}
        {isHost && (
          <div
            style={{
              marginBottom: "2rem",
              padding: "1.5rem",
              background: "#f8fafc",
              borderRadius: "0.5rem",
              border: "2px solid #e2e8f0",
            }}
          >
            <h2
              style={{
                fontSize: "1.25rem",
                marginBottom: "1rem",
                color: "#334155",
              }}
            >
              Game Settings
            </h2>

            <div style={{ marginBottom: "1rem" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "0.5rem",
                  fontSize: "0.875rem",
                  fontWeight: "600",
                  color: "#475569",
                }}
              >
                Score Limit
              </label>
              <select
                value={lobbyState.config.scoreLimit}
                onChange={(e) =>
                  handleUpdateConfig({
                    scoreLimit: parseInt(e.target.value),
                  })
                }
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  fontSize: "1rem",
                  border: "2px solid #e2e8f0",
                  borderRadius: "0.375rem",
                  background: "white",
                  cursor: "pointer",
                }}
              >
                <option value="0">Unlimited</option>
                <option value="3">First to 3 points</option>
                <option value="5">First to 5 points</option>
                <option value="10">First to 10 points</option>
              </select>
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "0.5rem",
                  fontSize: "0.875rem",
                  fontWeight: "600",
                  color: "#475569",
                }}
              >
                Time Limit
              </label>
              <select
                value={lobbyState.config.timeLimit}
                onChange={(e) =>
                  handleUpdateConfig({
                    timeLimit: parseInt(e.target.value),
                  })
                }
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  fontSize: "1rem",
                  border: "2px solid #e2e8f0",
                  borderRadius: "0.375rem",
                  background: "white",
                  cursor: "pointer",
                }}
              >
                <option value="0">Unlimited</option>
                <option value="300">5 minutes</option>
                <option value="600">10 minutes</option>
                <option value="900">15 minutes</option>
              </select>
            </div>

            <div>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  cursor: "pointer",
                  fontSize: "0.875rem",
                  fontWeight: "600",
                  color: "#475569",
                }}
              >
                <input
                  type="checkbox"
                  checked={lobbyState.config.allowManualTeams}
                  onChange={(e) =>
                    handleUpdateConfig({
                      allowManualTeams: e.target.checked,
                    })
                  }
                  style={{
                    marginRight: "0.5rem",
                    width: "1.125rem",
                    height: "1.125rem",
                    cursor: "pointer",
                  }}
                />
                Allow manual team selection
              </label>
            </div>
          </div>
        )}

        {/* Team Selection */}
        {lobbyState.config.allowManualTeams && (
          <div style={{ marginBottom: "2rem" }}>
            <h2
              style={{
                fontSize: "1.25rem",
                marginBottom: "1rem",
                color: "#334155",
              }}
            >
              Select Your Team
            </h2>
            <div style={{ display: "flex", gap: "1rem" }}>
              <button
                onClick={() => handleSelectTeam("red")}
                disabled={myReadyState?.selectedTeam === "red"}
                style={{
                  flex: 1,
                  padding: "1rem",
                  fontSize: "1.125rem",
                  fontWeight: "600",
                  color: "white",
                  background:
                    myReadyState?.selectedTeam === "red"
                      ? "linear-gradient(to bottom, #ef4444, #dc2626)"
                      : "#fca5a5",
                  border: "none",
                  borderRadius: "0.5rem",
                  cursor:
                    myReadyState?.selectedTeam === "red"
                      ? "default"
                      : "pointer",
                  boxShadow:
                    myReadyState?.selectedTeam === "red"
                      ? "0 4px 12px rgba(220, 38, 38, 0.3)"
                      : "none",
                  transform:
                    myReadyState?.selectedTeam === "red"
                      ? "scale(1.05)"
                      : "scale(1)",
                  transition: "all 0.2s",
                }}
              >
                🔴 Red Team ({redPlayers.length})
              </button>
              <button
                onClick={() => handleSelectTeam("blue")}
                disabled={myReadyState?.selectedTeam === "blue"}
                style={{
                  flex: 1,
                  padding: "1rem",
                  fontSize: "1.125rem",
                  fontWeight: "600",
                  color: "white",
                  background:
                    myReadyState?.selectedTeam === "blue"
                      ? "linear-gradient(to bottom, #3b82f6, #2563eb)"
                      : "#93c5fd",
                  border: "none",
                  borderRadius: "0.5rem",
                  cursor:
                    myReadyState?.selectedTeam === "blue"
                      ? "default"
                      : "pointer",
                  boxShadow:
                    myReadyState?.selectedTeam === "blue"
                      ? "0 4px 12px rgba(37, 99, 235, 0.3)"
                      : "none",
                  transform:
                    myReadyState?.selectedTeam === "blue"
                      ? "scale(1.05)"
                      : "scale(1)",
                  transition: "all 0.2s",
                }}
              >
                🔵 Blue Team ({bluePlayers.length})
              </button>
            </div>
          </div>
        )}

        {/* Player List */}
        <div style={{ marginBottom: "2rem" }}>
          <h2
            style={{
              fontSize: "1.25rem",
              marginBottom: "1rem",
              color: "#334155",
            }}
          >
            Players ({lobbyState.readyStates.length})
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {lobbyState.readyStates.map((rs) => (
              <div
                key={rs.playerId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.75rem 1rem",
                  background:
                    rs.playerId === clientId ? "#eff6ff" : "#f8fafc",
                  border:
                    rs.playerId === clientId
                      ? "2px solid #3b82f6"
                      : "2px solid #e2e8f0",
                  borderRadius: "0.5rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <div
                    style={{
                      width: "0.75rem",
                      height: "0.75rem",
                      borderRadius: "50%",
                      background:
                        rs.selectedTeam === "red" ? "#ef4444" : "#3b82f6",
                    }}
                  />
                  <span
                    style={{
                      fontSize: "1rem",
                      color: "#334155",
                      fontWeight: rs.playerId === clientId ? "600" : "400",
                    }}
                  >
                    {rs.playerId === clientId ? "You" : rs.playerId.slice(0, 8)}
                  </span>
                  {rs.playerId === lobbyState.hostId && (
                    <span
                      style={{
                        fontSize: "0.75rem",
                        padding: "0.25rem 0.5rem",
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
                        fontSize: "0.875rem",
                        color: "#059669",
                        fontWeight: "600",
                      }}
                    >
                      ✓ Ready
                    </span>
                  ) : (
                    <span
                      style={{
                        fontSize: "0.875rem",
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
              disabled={!allOthersReady && lobbyState.readyStates.length > 1}
              style={{
                width: "100%",
                padding: "1rem",
                fontSize: "1.25rem",
                fontWeight: "600",
                color: "white",
                background:
                  allOthersReady || lobbyState.readyStates.length === 1
                    ? "linear-gradient(to bottom, #10b981, #059669)"
                    : "#cbd5e1",
                border: "none",
                borderRadius: "0.5rem",
                cursor:
                  allOthersReady || lobbyState.readyStates.length === 1
                    ? "pointer"
                    : "not-allowed",
                boxShadow:
                  allOthersReady || lobbyState.readyStates.length === 1
                    ? "0 4px 12px rgba(5, 150, 105, 0.3)"
                    : "none",
                transition: "all 0.2s",
              }}
            >
              {allOthersReady || lobbyState.readyStates.length === 1
                ? "Start Game"
                : "Waiting for players to ready up..."}
            </button>
          ) : (
            <button
              onClick={handleToggleReady}
              style={{
                width: "100%",
                padding: "1rem",
                fontSize: "1.25rem",
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
        </div>
      </div>
    </div>
  );
}
