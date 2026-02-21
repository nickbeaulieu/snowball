import { useNavigate } from "react-router-dom";
import type { Team, PlayerStatsEntry } from "../../types";

type MvpAward = {
  label: string;
  icon: string;
  playerName: string;
  team: Team;
  value: string;
};

function computeMvpAwards(stats: PlayerStatsEntry[]): MvpAward[] {
  if (stats.length === 0) return [];
  const awards: MvpAward[] = [];
  const getName = (e: PlayerStatsEntry) => e.nickname || e.playerId.slice(0, 6);

  // Most Hits
  const topHitter = [...stats].sort((a, b) => b.hits - a.hits)[0];
  if (topHitter && topHitter.hits > 0) {
    awards.push({
      label: "Most Hits",
      icon: "\u{1F3AF}",
      playerName: getName(topHitter),
      team: topHitter.team,
      value: `${topHitter.hits} hits`,
    });
  }

  // Sharpshooter (best accuracy, min 5 throws)
  const withAccuracy = stats
    .filter((s) => s.throws >= 5)
    .map((s) => ({ ...s, accuracy: s.hits / s.throws }));
  const topAccuracy = [...withAccuracy].sort((a, b) => b.accuracy - a.accuracy)[0];
  if (topAccuracy && topAccuracy.accuracy > 0) {
    awards.push({
      label: "Sharpshooter",
      icon: "\u{1F52B}",
      playerName: getName(topAccuracy),
      team: topAccuracy.team,
      value: `${Math.round(topAccuracy.accuracy * 100)}%`,
    });
  }

  // Flag Runner (most captures)
  const topCapper = [...stats].sort((a, b) => b.flagCaptures - a.flagCaptures)[0];
  if (topCapper && topCapper.flagCaptures > 0) {
    awards.push({
      label: "Flag Runner",
      icon: "\u{1F6A9}",
      playerName: getName(topCapper),
      team: topCapper.team,
      value: `${topCapper.flagCaptures} caps`,
    });
  }

  // Iron Wall (most flag returns)
  const topReturner = [...stats].sort((a, b) => b.flagReturns - a.flagReturns)[0];
  if (topReturner && topReturner.flagReturns > 0) {
    awards.push({
      label: "Iron Wall",
      icon: "\u{1F6E1}\u{FE0F}",
      playerName: getName(topReturner),
      team: topReturner.team,
      value: `${topReturner.flagReturns} returns`,
    });
  }

  // Survivor (longest life)
  const topSurvivor = [...stats].sort((a, b) => b.longestLife - a.longestLife)[0];
  if (topSurvivor && topSurvivor.longestLife > 2000) {
    awards.push({
      label: "Survivor",
      icon: "\u{2764}\u{FE0F}",
      playerName: getName(topSurvivor),
      team: topSurvivor.team,
      value: `${(topSurvivor.longestLife / 1000).toFixed(1)}s`,
    });
  }

  return awards;
}

const teamColor = (team: Team) => (team === "red" ? "#dc2626" : "#2563eb");

type GameFinishedProps = {
  winner?: Team;
  scores?: { red: number; blue: number };
  isHost: boolean;
  websocket: WebSocket;
  playerStats?: PlayerStatsEntry[];
  clientId: string;
};

export function GameFinished({
  winner,
  scores,
  isHost,
  websocket,
  playerStats,
  clientId,
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
  const awards = playerStats ? computeMvpAwards(playerStats) : [];

  // Sort players: by team, then by hits descending
  const sortedStats = playerStats
    ? [...playerStats].sort((a, b) => {
        if (a.team !== b.team) return a.team === "red" ? -1 : 1;
        return b.hits - a.hits;
      })
    : [];

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
          maxWidth: "800px",
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
                {winner === "red" ? "\u{1F534}" : "\u{1F535}"}
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
                {"\u{1F91D}"}
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
            marginBottom: "2rem",
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

        {/* MVP Awards */}
        {awards.length > 0 && (
          <div style={{ marginBottom: "2rem" }}>
            <h3
              style={{
                fontSize: "1rem",
                fontWeight: "700",
                color: "#374151",
                marginBottom: "0.75rem",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              MVP Awards
            </h3>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.5rem",
                justifyContent: "center",
              }}
            >
              {awards.map((award) => (
                <div
                  key={award.label}
                  style={{
                    background: "#f8fafc",
                    border: "2px solid #e2e8f0",
                    borderRadius: "0.75rem",
                    padding: "0.75rem 1rem",
                    minWidth: "130px",
                    flex: "0 1 auto",
                  }}
                >
                  <div style={{ fontSize: "1.5rem", marginBottom: "0.25rem" }}>
                    {award.icon}
                  </div>
                  <div
                    style={{
                      fontSize: "0.7rem",
                      fontWeight: "700",
                      color: "#64748b",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      marginBottom: "0.25rem",
                    }}
                  >
                    {award.label}
                  </div>
                  <div
                    style={{
                      fontSize: "0.875rem",
                      fontWeight: "600",
                      color: teamColor(award.team),
                    }}
                  >
                    {award.playerName}
                  </div>
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "#94a3b8",
                    }}
                  >
                    {award.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Scoreboard */}
        {sortedStats.length > 0 && (
          <div style={{ marginBottom: "2rem" }}>
            <h3
              style={{
                fontSize: "1rem",
                fontWeight: "700",
                color: "#374151",
                marginBottom: "0.75rem",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Scoreboard
            </h3>
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "0.8rem",
                }}
              >
                <thead>
                  <tr
                    style={{
                      borderBottom: "2px solid #e2e8f0",
                    }}
                  >
                    {["Player", "Hits", "Deaths", "Acc%", "Thrown", "Caps", "Returns", "Dist"].map(
                      (h) => (
                        <th
                          key={h}
                          style={{
                            padding: "0.5rem 0.4rem",
                            textAlign: h === "Player" ? "left" : "center",
                            color: "#64748b",
                            fontWeight: "600",
                            fontSize: "0.7rem",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                          }}
                        >
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {sortedStats.map((p) => {
                    const isMe = p.playerId === clientId;
                    const acc =
                      p.throws > 0
                        ? `${Math.round((p.hits / p.throws) * 100)}%`
                        : "--";
                    const dist =
                      p.distanceTraveled >= 1000
                        ? `${(p.distanceTraveled / 1000).toFixed(1)}k`
                        : Math.round(p.distanceTraveled).toString();
                    return (
                      <tr
                        key={p.playerId}
                        style={{
                          borderBottom: "1px solid #f1f5f9",
                          background: isMe ? "#eff6ff" : undefined,
                        }}
                      >
                        <td
                          style={{
                            padding: "0.5rem 0.4rem",
                            textAlign: "left",
                            fontWeight: isMe ? "700" : "500",
                            color: teamColor(p.team),
                            whiteSpace: "nowrap",
                          }}
                        >
                          {p.nickname || p.playerId.slice(0, 6)}
                          {isMe && (
                            <span style={{ color: "#94a3b8", fontWeight: "400", marginLeft: "0.25rem" }}>
                              (you)
                            </span>
                          )}
                        </td>
                        {[p.hits, p.timesHit, acc, p.throws, p.flagCaptures, p.flagReturns, dist].map(
                          (val, i) => (
                            <td
                              key={i}
                              style={{
                                padding: "0.5rem 0.4rem",
                                textAlign: "center",
                                color: "#374151",
                                fontVariantNumeric: "tabular-nums",
                              }}
                            >
                              {val}
                            </td>
                          ),
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

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
