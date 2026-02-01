import { GameCanvas } from "./game-canvas";

export default function App() {
  return (
    <div>
      <header>
        <h1>❄️ Snowball CTF</h1>
      </header>

      <GameCanvas />

      <footer>WASD to move · Click to throw</footer>
    </div>
  );
}
