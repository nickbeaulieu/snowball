export type SpawnZone = {
  x: number; // Center X coordinate
  y: number; // Center Y coordinate
  radius: number; // Random spawn within this radius
};

export type FlagBase = {
  x: number;
  y: number;
};

export type Wall = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type MapDefinition = {
  id: string; // Unique identifier (e.g., "classic", "arena")
  name: string; // Display name
  description?: string; // Optional description
  width: number; // World width in pixels
  height: number; // World height in pixels
  gridSize: number; // Grid alignment (typically 40)

  // Team-specific data
  teams: {
    red: {
      flagBase: FlagBase;
      spawnZone: SpawnZone;
    };
    blue: {
      flagBase: FlagBase;
      spawnZone: SpawnZone;
    };
  };

  // Walls/obstacles
  walls: Wall[];

  // Optional metadata
  recommendedPlayerCount?: { min: number; max: number };
};
