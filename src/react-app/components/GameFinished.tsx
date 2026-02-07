import { useNavigate } from "react-router-dom";
import type { Team } from "../../types";

type GameFinishedProps = {
  winner?: Team;
  scores?: { red: number; blue: number };
  isHost: boolean;
  websocket: WebSocket;
};

export function GameFinished({
  winner,
  scores,
  isHost,
  websocket,
}: GameFinishedProps) {
  const navigate = useNavigate();

  const handlePlayAgain = () => {
    if (websocket.readyState === WebSocket.OPEN) {
      websocket.send(JSON.stringify({ type: "reset_game" }));
    }
  };

  const handleLeaveRoom = () => {
    navigate("/");
  };

  const redScore = scores?.red ?? 0;
  const blueScore = scores?.blue ?? 0;

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: winner
          ? winner === "red"
            ? "linear-gradient(to bottom, #fee2e2, #fecaca)"
            : "linear-gradient(to bottom, #dbeafe, #bfdbfe)"
          : "linear-gradient(to bottom, #f3f4f6, #e5e7eb)",
        padding: "2rem",
      }}
    >
      <div
        style={{
          maxWidth: "500px",
          width: "100%",
          background: "white",
          borderRadius: "1rem",
          boxShadow: "0 8px 24px rgba(0, 0, 0, 0.15)",
          padding: "3rem 2rem",
          textAlign: "center",
        }}
      >
        {/* Winner Announcement */}
        <div style={{ marginBottom: "2rem" }}>
          {winner ? (
            <>
              <h1
                style={{
                  fontSize: "3rem",
                  marginBottom: "1rem",
                  color: winner === "red" ? "#dc2626" : "#2563eb",
                  textShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
                }}
              >
                {winner === "red" ? "🔴" : "🔵"}
              </h1>
              <h2
                style={{
                  fontSize: "2rem",
                  marginBottom: "0.5rem",
                  color: winner === "red" ? "#dc2626" : "#2563eb",
                  fontWeight: "700",
                }}
              >
                {winner === "red" ? "Red" : "Blue"} Team Wins!
              </h2>
            </>
          ) : (
            <>
              <h1
                style={{
                  fontSize: "3rem",
                  marginBottom: "1rem",
                  color: "#6b7280",
                }}
              >
                🤝
              </h1>
              <h2
                style={{
                  fontSize: "2rem",
                  marginBottom: "0.5rem",
                  color: "#6b7280",
                  fontWeight: "700",
                }}
              >
                It's a Tie!
              </h2>
            </>
          )}
          <p
            style={{
              fontSize: "1rem",
              color: "#64748b",
            }}
          >
            Game Over
          </p>
        </div>

        {/* Final Scores */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "2rem",
            marginBottom: "3rem",
            padding: "1.5rem",
            background: "#f8fafc",
            borderRadius: "0.75rem",
            border: "2px solid #e2e8f0",
          }}
        >
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                fontSize: "3rem",
                fontWeight: "700",
                color: "#dc2626",
                marginBottom: "0.25rem",
              }}
            >
              {redScore}
            </div>
            <div
              style={{
                fontSize: "0.875rem",
                color: "#64748b",
                fontWeight: "600",
              }}
            >
              Red Team
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              fontSize: "2rem",
              color: "#cbd5e1",
              fontWeight: "700",
            }}
          >
            -
          </div>

          <div style={{ textAlign: "center" }}>
            <div
              style={{
                fontSize: "3rem",
                fontWeight: "700",
                color: "#2563eb",
                marginBottom: "0.25rem",
              }}
            >
              {blueScore}
            </div>
            <div
              style={{
                fontSize: "0.875rem",
                color: "#64748b",
                fontWeight: "600",
              }}
            >
              Blue Team
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {isHost && (
            <button
              onClick={handlePlayAgain}
              style={{
                width: "100%",
                padding: "1rem",
                fontSize: "1.125rem",
                fontWeight: "600",
                color: "white",
                background: "linear-gradient(to bottom, #10b981, #059669)",
                border: "none",
                borderRadius: "0.5rem",
                cursor: "pointer",
                boxShadow: "0 4px 12px rgba(5, 150, 105, 0.3)",
                transition: "transform 0.1s, box-shadow 0.1s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow =
                  "0 6px 16px rgba(5, 150, 105, 0.4)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow =
                  "0 4px 12px rgba(5, 150, 105, 0.3)";
              }}
            >
              Play Again
            </button>
          )}

          <button
            onClick={handleLeaveRoom}
            style={{
              width: "100%",
              padding: "1rem",
              fontSize: "1.125rem",
              fontWeight: "600",
              color: "#64748b",
              background: "white",
              border: "2px solid #e2e8f0",
              borderRadius: "0.5rem",
              cursor: "pointer",
              transition: "all 0.1s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#f8fafc";
              e.currentTarget.style.borderColor = "#cbd5e1";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "white";
              e.currentTarget.style.borderColor = "#e2e8f0";
            }}
          >
            Leave Room
          </button>

          {!isHost && (
            <p
              style={{
                fontSize: "0.875rem",
                color: "#94a3b8",
                marginTop: "0.5rem",
              }}
            >
              Waiting for host to start rematch...
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
