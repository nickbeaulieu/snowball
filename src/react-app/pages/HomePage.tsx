import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { HomepageBackground } from "../homepage-background";

export function HomePage() {
  const navigate = useNavigate();
  const [roomId, setRoomId] = useState("");

  const generateRoomId = () => {
    // Generate a 6-character alphanumeric room ID
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let id = "";
    for (let i = 0; i < 6; i++) {
      id += chars[Math.floor(Math.random() * chars.length)];
    }
    return id;
  };

  const handleCreateRoom = () => {
    const newRoomId = generateRoomId();
    navigate(`/room/${newRoomId}`);
  };

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomId.trim()) {
      navigate(`/room/${roomId.trim().toLowerCase()}`);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <HomepageBackground />
      <div
        style={{
          textAlign: "center",
          padding: "2rem",
          background: "rgba(255, 255, 255, 0.8)",
          backdropFilter: "blur(16px) saturate(180%)",
          WebkitBackdropFilter: "blur(16px) saturate(180%)",
          borderRadius: "1rem",
          border: "1px solid rgba(255, 255, 255, 0.5)",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.15)",
          maxWidth: "400px",
          width: "100%",
          position: "relative",
          zIndex: 1,
        }}
      >
        <h1
          style={{
            fontSize: "2.5rem",
            marginBottom: "0.5rem",
            color: "#0c4a6e",
          }}
        >
          ❄️ Snowball CTF
        </h1>
        <p
          style={{
            color: "#64748b",
            marginBottom: "2rem",
            fontSize: "0.95rem",
          }}
        >
          Capture the flag in epic snowball battles!
        </p>

        <div style={{ marginBottom: "2rem" }}>
          <button
            onClick={handleCreateRoom}
            style={{
              width: "100%",
              padding: "0.875rem 1.5rem",
              fontSize: "1.1rem",
              fontWeight: "600",
              color: "white",
              background: "linear-gradient(to bottom, #3b82f6, #2563eb)",
              border: "none",
              borderRadius: "0.5rem",
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(37, 99, 235, 0.3)",
              transition: "transform 0.1s, box-shadow 0.1s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow =
                "0 4px 12px rgba(37, 99, 235, 0.4)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow =
                "0 2px 8px rgba(37, 99, 235, 0.3)";
            }}
          >
            Create New Room
          </button>
        </div>

        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            marginBottom: "2rem",
          }}
        >
          <div
            style={{
              flex: 1,
              height: "1px",
              background: "#e2e8f0",
            }}
          />
          <span
            style={{
              padding: "0 1rem",
              color: "#94a3b8",
              fontSize: "0.875rem",
              fontWeight: "500",
            }}
          >
            OR
          </span>
          <div
            style={{
              flex: 1,
              height: "1px",
              background: "#e2e8f0",
            }}
          />
        </div>

        <form onSubmit={handleJoinRoom}>
          <div style={{ marginBottom: "1rem" }}>
            <input
              type="text"
              placeholder="Enter room code"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              style={{
                width: "100%",
                padding: "0.75rem",
                fontSize: "1rem",
                border: "2px solid #e2e8f0",
                borderRadius: "0.5rem",
                outline: "none",
                transition: "border-color 0.2s",
                boxSizing: "border-box",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "#3b82f6";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "#e2e8f0";
              }}
            />
          </div>
          <button
            type="submit"
            disabled={!roomId.trim()}
            style={{
              width: "100%",
              padding: "0.75rem 1.5rem",
              fontSize: "1rem",
              fontWeight: "600",
              color: "white",
              background: roomId.trim()
                ? "linear-gradient(to bottom, #10b981, #059669)"
                : "#cbd5e1",
              border: "none",
              borderRadius: "0.5rem",
              cursor: roomId.trim() ? "pointer" : "not-allowed",
              boxShadow: roomId.trim()
                ? "0 2px 8px rgba(5, 150, 105, 0.3)"
                : "none",
              transition: "transform 0.1s, box-shadow 0.1s",
            }}
            onMouseEnter={(e) => {
              if (roomId.trim()) {
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow =
                  "0 4px 12px rgba(5, 150, 105, 0.4)";
              }
            }}
            onMouseLeave={(e) => {
              if (roomId.trim()) {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow =
                  "0 2px 8px rgba(5, 150, 105, 0.3)";
              }
            }}
          >
            Join Room
          </button>
        </form>
      </div>

      <footer
        style={{
          position: "absolute",
          bottom: "1rem",
          color: "rgba(255, 255, 255, 0.9)",
          fontSize: "0.875rem",
          textShadow: "0 1px 3px rgba(0, 0, 0, 0.5)",
          zIndex: 1,
        }}
      >
        WASD to move · Click to throw · Spacebar to drop flag
      </footer>
    </div>
  );
}
