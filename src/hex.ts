import { HexCoord, MapState, Tile } from "./types";

const HEX_DIRECTIONS: ReadonlyArray<HexCoord> = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function coordKey(coord: HexCoord): string {
  return `${coord.q},${coord.r}`;
}

export function parseCoordKey(key: string): HexCoord {
  const [q, r] = key.split(",").map(Number);
  return { q, r };
}

export function hexDistance(a: HexCoord, b: HexCoord): number {
  const dq = Math.abs(a.q - b.q);
  const dr = Math.abs(a.r - b.r);
  const ds = Math.abs((a.q + a.r) - (b.q + b.r));
  return Math.max(dq, dr, ds);
}

export function areNeighbors(a: HexCoord, b: HexCoord): boolean {
  return HEX_DIRECTIONS.some(
    (dir) => a.q + dir.q === b.q && a.r + dir.r === b.r,
  );
}

export function isInsideMap(coord: HexCoord, map: MapState): boolean {
  return (
    coord.q >= 0 &&
    coord.q < map.width &&
    coord.r >= 0 &&
    coord.r < map.height
  );
}

export function isTilePassable(tile: Tile): boolean {
  return tile.terrainType !== "OBSTACLE";
}

export function buildTileIndex(map: MapState): Map<string, Tile> {
  const index = new Map<string, Tile>();
  for (const tile of map.tiles) {
    index.set(coordKey(tile), tile);
  }
  return index;
}