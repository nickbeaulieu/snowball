import type { MapDefinition } from "./types";
import { classicMap } from "./classic";
import { arenaMap } from "./arena";

// Map registry
export const MAPS: Record<string, MapDefinition> = {
  classic: classicMap,
  arena: arenaMap,
};

// Default map
export const DEFAULT_MAP_ID = "classic";

// Helper functions
export function getMap(id: string): MapDefinition {
  return MAPS[id] || MAPS[DEFAULT_MAP_ID];
}

export function getAllMapIds(): string[] {
  return Object.keys(MAPS);
}

export function getAllMaps(): MapDefinition[] {
  return Object.values(MAPS);
}

// Re-export types
export type { MapDefinition, SpawnZone, FlagBase, Wall } from "./types";
