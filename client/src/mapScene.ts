import { Container, Graphics, Text } from "pixi.js";

import { coordKey, hexDistance } from "../../src/hex";
import type { Fleet, GameState, HexCoord, TerrainType, Tile } from "../../src/types";
import { axialToPixel, HEX_DIRECTIONS, hexPolygon, pixelToAxial } from "./hexMath";

export const HEX_SIZE = 30;
export const MAP_OFFSET = { x: 70, y: 60 };
const HEX_LAYOUT = { hexSize: HEX_SIZE, offset: MAP_OFFSET };

type Nullable<T> = T | null;
type TileLabelSlots = Map<string, number>;

export interface MapLayers {
  terrainLayer: Container;
  planetLayer: Container;
  fleetLayer: Container;
  effectLayer: Container;
  fogLayer: Container;
  uiLayer: Container;
}

export interface RenderMapSceneParams {
  state: GameState;
  layers: MapLayers;
  selectedFleet: Nullable<Fleet>;
  plannedPath: HexCoord[];
  playerId: string | null;
  textResolution: number;
}

export function toPixel(coord: HexCoord): { x: number; y: number } {
  return axialToPixel(coord, HEX_LAYOUT);
}

export function toHex(x: number, y: number): HexCoord {
  return pixelToAxial(x, y, HEX_LAYOUT);
}

export function getTile(state: GameState, coord: HexCoord): Nullable<Tile> {
  return state.map.tiles.find((tile) => tile.q === coord.q && tile.r === coord.r) ?? null;
}

export function isInsideMap(state: GameState, coord: HexCoord): boolean {
  return (
    coord.q >= 0 &&
    coord.r >= 0 &&
    coord.q < state.map.width &&
    coord.r < state.map.height
  );
}

export function isPassableTile(state: GameState, coord: HexCoord): boolean {
  const tile = getTile(state, coord);
  return Boolean(tile && tile.terrainType !== "OBSTACLE");
}

export function fleetsAtCoord(state: GameState, coord: HexCoord): Fleet[] {
  return Object.values(state.fleets).filter(
    (fleet) => fleet.position.q === coord.q && fleet.position.r === coord.r,
  );
}

export function ownFleetsAtCoord(
  state: GameState,
  coord: HexCoord,
  playerId: string,
): Fleet[] {
  return fleetsAtCoord(state, coord).filter((fleet) => fleet.ownerPlayerId === playerId);
}

export function ownFleetAtCoord(
  state: GameState,
  coord: HexCoord,
  playerId: string,
): Nullable<Fleet> {
  const ownFleets = ownFleetsAtCoord(state, coord, playerId).sort((a, b) => a.id.localeCompare(b.id));
  return ownFleets[0] ?? null;
}

export function buildPath(
  state: GameState,
  start: HexCoord,
  target: HexCoord,
  maxSteps: number,
): Nullable<HexCoord[]> {
  if (start.q === target.q && start.r === target.r) {
    return [];
  }

  const visited = new Set<string>([coordKey(start)]);
  const queue: Array<{ coord: HexCoord; path: HexCoord[] }> = [{ coord: start, path: [] }];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    if (current.path.length >= maxSteps) {
      continue;
    }

    for (const dir of HEX_DIRECTIONS) {
      const next: HexCoord = {
        q: current.coord.q + dir.q,
        r: current.coord.r + dir.r,
      };

      const key = coordKey(next);
      if (visited.has(key)) {
        continue;
      }

      if (!isInsideMap(state, next) || !isPassableTile(state, next)) {
        continue;
      }

      const nextPath = [...current.path, next];
      if (next.q === target.q && next.r === target.r) {
        return nextPath;
      }

      visited.add(key);
      queue.push({ coord: next, path: nextPath });
    }
  }

  return null;
}

export function clearMapLayers(layers: MapLayers): void {
  clearLayer(layers.terrainLayer);
  clearLayer(layers.planetLayer);
  clearLayer(layers.fleetLayer);
  clearLayer(layers.effectLayer);
  clearLayer(layers.fogLayer);
  clearLayer(layers.uiLayer);
}

export function renderMapScene(params: RenderMapSceneParams): void {
  const {
    state,
    layers,
    selectedFleet,
    plannedPath,
    playerId,
    textResolution,
  } = params;

  const labelSlots: TileLabelSlots = new Map();
  drawTerrain(state, layers);
  drawPlanets(state, layers, labelSlots, textResolution);
  drawFleets(state, layers, selectedFleet, labelSlots, textResolution);
  drawPath(layers, selectedFleet, plannedPath);
  drawFog(state, layers, playerId);
  drawUiMarkers(state, layers, textResolution);
}

function tileColor(terrainType: TerrainType): number {
  if (terrainType === "OBSTACLE") {
    return 0x4b2e2e;
  }
  if (terrainType === "NEBULA") {
    return 0x2e3f57;
  }
  return 0x223247;
}

function ownerColor(ownerId: string): number {
  const map: Record<string, number> = {
    p1: 0x63d6ff,
    p2: 0xff9a63,
    p3: 0xc7ff67,
  };

  return map[ownerId] ?? 0xd4d7de;
}

function clearLayer(layer: Container): void {
  layer.removeChildren().forEach((child) => child.destroy());
}

function createMapText(text: string, style: ConstructorParameters<typeof Text>[1], resolution: number): Text {
  const label = new Text(text, style);
  label.resolution = resolution;
  label.roundPixels = true;
  return label;
}

function allocateTileLabelPosition(
  slots: TileLabelSlots,
  coord: HexCoord,
  center: { x: number; y: number },
): { x: number; y: number } {
  const key = coordKey(coord);
  const slot = slots.get(key) ?? 0;
  slots.set(key, slot + 1);

  return {
    x: center.x + 10,
    y: center.y - 7 + slot * 11,
  };
}

function mapFleetsByTile(state: GameState): Map<string, Fleet[]> {
  const byTile = new Map<string, Fleet[]>();

  for (const fleet of Object.values(state.fleets)) {
    const key = coordKey(fleet.position);
    const list = byTile.get(key);
    if (list) {
      list.push(fleet);
    } else {
      byTile.set(key, [fleet]);
    }
  }

  return byTile;
}

function drawTerrain(state: GameState, layers: MapLayers): void {
  clearLayer(layers.terrainLayer);

  for (const tile of state.map.tiles) {
    const center = toPixel(tile);
    const shape = hexPolygon(center, HEX_SIZE - 1);

    const graphics = new Graphics();
    graphics.lineStyle(1, 0x3a5270, 0.7);
    graphics.beginFill(tileColor(tile.terrainType), 0.95);
    graphics.drawPolygon(shape);
    graphics.endFill();

    layers.terrainLayer.addChild(graphics);
  }
}

function drawPlanets(
  state: GameState,
  layers: MapLayers,
  labelSlots: TileLabelSlots,
  textResolution: number,
): void {
  clearLayer(layers.planetLayer);

  for (const planet of Object.values(state.planets)) {
    const center = toPixel(planet.position);

    const circle = new Graphics();
    circle.lineStyle(2, 0xc8f1ff, 0.9);
    circle.beginFill(0x5a8ef5, 0.85);
    circle.drawCircle(center.x, center.y, 8);
    circle.endFill();
    layers.planetLayer.addChild(circle);

    const label = createMapText(
      `${planet.worldType} +${planet.resourceProduction} | VR ${planet.overviewRange}`,
      {
        fontFamily: "Chakra Petch",
        fontSize: 11,
        fill: 0xd8ecff,
      },
      textResolution,
    );
    const labelPosition = allocateTileLabelPosition(labelSlots, planet.position, center);
    label.x = labelPosition.x;
    label.y = labelPosition.y;
    layers.planetLayer.addChild(label);
  }
}

function drawFleets(
  state: GameState,
  layers: MapLayers,
  selectedFleet: Nullable<Fleet>,
  labelSlots: TileLabelSlots,
  textResolution: number,
): void {
  clearLayer(layers.fleetLayer);

  const byTile = mapFleetsByTile(state);

  for (const [key, fleets] of byTile.entries()) {
    const [qStr, rStr] = key.split(",");
    const coord = { q: Number(qStr), r: Number(rStr) };
    const center = toPixel(coord);

    const spreadRadius = fleets.length > 1 ? 10 : 0;
    fleets.forEach((fleet, index) => {
      const angle = (Math.PI * 2 * index) / Math.max(fleets.length, 1);
      const x = center.x + Math.cos(angle) * spreadRadius;
      const y = center.y + Math.sin(angle) * spreadRadius;

      const body = new Graphics();
      body.lineStyle(2, fleet.id === selectedFleet?.id ? 0xffffff : 0x1a2533, 1);
      body.beginFill(ownerColor(fleet.ownerPlayerId), 1);
      body.drawCircle(x, y, 7);
      body.endFill();
      layers.fleetLayer.addChild(body);

      const statsText = `CP ${Math.round(fleet.combatPower)}  HP ${Math.max(
        0,
        Math.round(fleet.health),
      )}`;
      const tag = createMapText(
        statsText,
        {
          fontFamily: "Chakra Petch",
          fontSize: 9,
          fill: 0xf7f9fc,
        },
        textResolution,
      );
      const labelPosition = allocateTileLabelPosition(labelSlots, coord, center);
      tag.x = labelPosition.x;
      tag.y = labelPosition.y;
      layers.fleetLayer.addChild(tag);
    });
  }
}

function drawPath(
  layers: MapLayers,
  selectedFleet: Nullable<Fleet>,
  plannedPath: HexCoord[],
): void {
  clearLayer(layers.effectLayer);

  if (!selectedFleet || plannedPath.length === 0) {
    return;
  }

  const line = new Graphics();
  line.lineStyle(3, 0x64ffe1, 0.95);

  const start = toPixel(selectedFleet.position);
  line.moveTo(start.x, start.y);

  for (const step of plannedPath) {
    const point = toPixel(step);
    line.lineTo(point.x, point.y);

    const dot = new Graphics();
    dot.beginFill(0x8dffe9, 1);
    dot.drawCircle(point.x, point.y, 3);
    dot.endFill();
    layers.effectLayer.addChild(dot);
  }

  layers.effectLayer.addChild(line);
}

function drawFog(
  state: GameState,
  layers: MapLayers,
  playerId: string | null,
): void {
  clearLayer(layers.fogLayer);

  if (!playerId) {
    return;
  }

  const player = state.players[playerId];
  if (!player) {
    return;
  }

  const visible = computeVisibleTiles(state, playerId);
  const explored = new Set(player.exploredTiles.map(coordKey));

  for (const tile of state.map.tiles) {
    const key = coordKey(tile);
    const center = toPixel(tile);
    const shape = hexPolygon(center, HEX_SIZE - 1);

    let alpha = 0;
    if (!explored.has(key)) {
      alpha = 0.82;
    } else if (!visible.has(key)) {
      alpha = 0.45;
    }

    if (alpha <= 0) {
      continue;
    }

    const veil = new Graphics();
    veil.beginFill(0x0a0f17, alpha);
    veil.drawPolygon(shape);
    veil.endFill();
    layers.fogLayer.addChild(veil);
  }
}

function drawUiMarkers(
  state: GameState,
  layers: MapLayers,
  textResolution: number,
): void {
  clearLayer(layers.uiLayer);

  for (const tile of state.map.tiles) {
    if (tile.terrainType !== "OBSTACLE") {
      continue;
    }

    const center = toPixel(tile);
    const mark = createMapText(
      "X",
      {
        fontFamily: "Chakra Petch",
        fontSize: 12,
        fill: 0xfab8b8,
      },
      textResolution,
    );
    mark.x = center.x - 4;
    mark.y = center.y - 8;
    layers.uiLayer.addChild(mark);
  }
}

function computeVisibleTiles(state: GameState, playerId: string): Set<string> {
  const visible = new Set<string>();

  for (const planet of Object.values(state.planets)) {
    for (const tile of state.map.tiles) {
      if (hexDistance(planet.position, tile) <= planet.overviewRange) {
        visible.add(coordKey(tile));
      }
    }
  }

  const fleets = Object.values(state.fleets).filter(
    (fleet) => fleet.ownerPlayerId === playerId,
  );

  for (const fleet of fleets) {
    for (const tile of state.map.tiles) {
      if (hexDistance(fleet.position, tile) <= fleet.visionRange) {
        visible.add(coordKey(tile));
      }
    }
  }

  return visible;
}
