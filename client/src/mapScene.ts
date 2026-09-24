import { Container, Graphics, Text } from "pixi.js";

import { coordKey, hexDistance } from "../../src/hex";
import type { Fleet, GameState, HexCoord, TerrainType, Tile } from "../../src/types";
import { defaultPlayerColor, playerColorToNumber } from "../../src/utils/playerColor";
import { axialToPixel, HEX_DIRECTIONS, hexPolygon, pixelToAxial } from "./hexMath";
import { drawTacticalObjectOrbits } from "./tacticalObjects";

export const HEX_SIZE = 30;
export const MAP_OFFSET = { x: 70, y: 60 };
const HEX_LAYOUT = { hexSize: HEX_SIZE, offset: MAP_OFFSET };
const TACTICAL_RADIUS = 0;

type Nullable<T> = T | null;
type TileLabelSlots = Map<string, number>;

export interface MapLayers {
  terrainLayer: Container;
  warpLayer: Container;
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
  plannedMovePathsByFleetId: Record<string, HexCoord[]>;
  playerId: string | null;
  hasFullMapVisibility: boolean;
  navigatorLayerEnabled: boolean;
  tacticalCenter: HexCoord | null;
  strategicSelectedHex: HexCoord | null;
  textResolution: number;
  hexScale: number;
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
  const ownFleets = ownFleetsAtCoord(state, coord, playerId).sort((a, b) => a.id - b.id);
  return ownFleets[0] ?? null;
}

export function buildPath(
  state: GameState,
  start: HexCoord,
  target: HexCoord,
  maxSteps = Number.POSITIVE_INFINITY,
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
  clearLayer(layers.warpLayer);
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
    plannedMovePathsByFleetId,
    playerId,
    hasFullMapVisibility,
    navigatorLayerEnabled,
    tacticalCenter,
    strategicSelectedHex,
    textResolution,
    hexScale,
  } = params;

  const renderedState = tacticalCenter ? filterStateToTacticalArea(state, tacticalCenter) : state;
  applyMapLayerScale(layers, hexScale);
  const labelSlots: TileLabelSlots = new Map();
  drawTerrain(renderedState, layers, tacticalCenter, strategicSelectedHex);
  drawWarpLayer(
    renderedState,
    layers,
    textResolution,
    tacticalCenter !== null || navigatorLayerEnabled,
  );
  if (navigatorLayerEnabled) {
    clearLayer(layers.planetLayer);
    clearLayer(layers.fleetLayer);
    clearLayer(layers.effectLayer);
    clearLayer(layers.uiLayer);
    drawFog(renderedState, layers, playerId, hasFullMapVisibility, state);
    return;
  }
  if (tacticalCenter) {
    drawTacticalObjectOrbits({
      state: renderedState,
      layers,
      selectedFleet,
      hexScale,
      textResolution,
      toPixel,
    });
  } else {
    drawPlanets(renderedState, layers, labelSlots, textResolution);
    drawFleets(renderedState, layers, selectedFleet, labelSlots, textResolution);
  }
  drawPlannedPaths(renderedState, layers, plannedMovePathsByFleetId, selectedFleet?.id ?? null);
  drawDraftPath(layers, tacticalCenter && selectedFleet && hexDistance(tacticalCenter, selectedFleet.position) > TACTICAL_RADIUS ? null : selectedFleet, plannedPath);
  drawFog(renderedState, layers, playerId, hasFullMapVisibility, state);
  drawUiMarkers(renderedState, layers, textResolution);
}

function filterStateToTacticalArea(state: GameState, center: HexCoord): GameState {
  const isInArea = (position: HexCoord): boolean => hexDistance(center, position) <= TACTICAL_RADIUS;
  return {
    ...state,
    map: { ...state.map, tiles: state.map.tiles.filter(isInArea) },
    planets: Object.fromEntries(Object.entries(state.planets).filter(([, planet]) => isInArea(planet.position))),
    stations: Object.fromEntries(Object.entries(state.stations).filter(([, station]) => isInArea(station.position))),
    shipwrecks: Object.fromEntries(Object.entries(state.shipwrecks).filter(([, shipwreck]) => isInArea(shipwreck.position))),
    anomalies: Object.fromEntries(Object.entries(state.anomalies).filter(([, anomaly]) => isInArea(anomaly.position))),
    fleets: Object.fromEntries(Object.entries(state.fleets).filter(([, fleet]) => isInArea(fleet.position))),
  };
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

function ownerColor(state: GameState, ownerId: number): number {
  const color = state.players[ownerId]?.color ?? defaultPlayerColor(ownerId);
  return playerColorToNumber(color);
}

function clearLayer(layer: Container): void {
  layer.removeChildren().forEach((child) => child.destroy());
}

function applyMapLayerScale(layers: MapLayers, scale: number): void {
  for (const layer of [
    layers.terrainLayer, layers.warpLayer, layers.planetLayer, layers.fleetLayer,
    layers.effectLayer, layers.fogLayer, layers.uiLayer,
  ]) {
    layer.scale.set(scale);
  }
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

function drawTerrain(state: GameState, layers: MapLayers, tacticalCenter: HexCoord | null, strategicSelectedHex: HexCoord | null): void {
  clearLayer(layers.terrainLayer);

  for (const tile of state.map.tiles) {
    const center = toPixel(tile);
    const shape = hexPolygon(center, tacticalCenter ? HEX_SIZE : HEX_SIZE - 1);

    const graphics = new Graphics();
    graphics.lineStyle(1, 0x3a5270, 0.7);
    graphics.beginFill(tileColor(tile.terrainType), 0.95);
    graphics.drawPolygon(shape);
    graphics.endFill();

    layers.terrainLayer.addChild(graphics);
  }
  const highlightedHex = tacticalCenter ? null : strategicSelectedHex;
  if (!highlightedHex) return;

  const outline = new Graphics();
  outline.lineStyle(3, 0xfacc15, 1);
  outline.drawPolygon(hexPolygon(toPixel(highlightedHex), HEX_SIZE - 0.5));
  layers.terrainLayer.addChild(outline);

}

function drawWarpLayer(
  state: GameState,
  layers: MapLayers,
  textResolution: number,
  showFullHex: boolean,
): void {
  clearLayer(layers.warpLayer);
  const colors = [0x4ade80, 0xa3e635, 0xfacc15, 0xfb923c, 0xef4444, 0x991b1b];
  for (const tile of state.map.tiles) {
    if (!Number.isInteger(tile.warpDisturbanceLevel)) continue;
    const level = tile.warpDisturbanceLevel;
    if (level < 1 || level > 6) continue;
    const center = toPixel(tile);
    const color = colors[level - 1] ?? 0xffffff;

    if (!showFullHex) {
      const marker = new Graphics();
      marker.lineStyle(1, 0x172033, 0.9);
      marker.beginFill(color, 0.95);
      marker.drawCircle(
        center.x + HEX_SIZE * 0.34,
        center.y + HEX_SIZE * 0.3,
        HEX_SIZE * 0.13,
      );
      marker.endFill();
      layers.warpLayer.addChild(marker);
      continue;
    }

    const overlay = new Graphics();
    overlay.beginFill(color, 0.78);
    overlay.drawPolygon(hexPolygon(center, HEX_SIZE - 2));
    overlay.endFill();
    layers.warpLayer.addChild(overlay);
    const label = createMapText(String(level), {
      fontFamily: "Chakra Petch", fontSize: 16, fill: 0xffffff,
    }, textResolution);
    label.anchor.set(0.5, 0.5);
    label.x = center.x;
    label.y = center.y;
    layers.warpLayer.addChild(label);
  }
}

function drawPlanets(
  state: GameState,
  layers: MapLayers,
  labelSlots: TileLabelSlots,
  textResolution: number,
): void {
  clearLayer(layers.planetLayer);

  const markerSlots = new Map<string, number>();
  const nextMarker = (position: HexCoord): { x: number; y: number } => {
    const center = toPixel(position);
    const key = coordKey(position);
    const slot = markerSlots.get(key) ?? 0;
    markerSlots.set(key, slot + 1);
    const offsets = [
      { x: 0, y: 0 },
      { x: 11, y: 0 },
      { x: -11, y: 0 },
      { x: 0, y: 11 },
      { x: 0, y: -11 },
    ];
    const offset = offsets[slot % offsets.length] ?? { x: 0, y: 0 };
    return { x: center.x + offset.x, y: center.y + offset.y };
  };

  for (const planet of Object.values(state.planets)) {
    const center = toPixel(planet.position);
    const marker = nextMarker(planet.position);

    const circle = new Graphics();
    circle.lineStyle(2, 0xc8f1ff, 0.9);
    circle.beginFill(0x5a8ef5, 0.85);
    circle.drawCircle(marker.x, marker.y, 8);
    circle.endFill();
    layers.planetLayer.addChild(circle);

    const label = createMapText(
      `${planet.name} | ${planet.worldType} +${planet.resourceProduction}`,
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

  for (const station of Object.values(state.stations)) {
    const center = toPixel(station.position);
    const marker = nextMarker(station.position);
    const body = new Graphics();
    body.lineStyle(2, 0xe7d88f, 0.95);
    body.beginFill(0x8b6f32, 0.9);
    body.drawRect(marker.x - 6, marker.y - 6, 12, 12);
    body.endFill();
    layers.planetLayer.addChild(body);
    const label = createMapText(
      "Station " + station.name + " (#" + station.id + ")",
      {
        fontFamily: "Chakra Petch",
        fontSize: 11,
        fill: 0xffedaa,
      },
      textResolution,
    );
    const labelPosition = allocateTileLabelPosition(labelSlots, station.position, center);
    label.x = labelPosition.x;
    label.y = labelPosition.y;
    layers.planetLayer.addChild(label);
  }

  for (const shipwreck of Object.values(state.shipwrecks)) {
    const center = toPixel(shipwreck.position);
    const marker = nextMarker(shipwreck.position);
    const body = new Graphics();
    body.lineStyle(3, 0xbcc3cc, 0.95);
    body.moveTo(marker.x - 6, marker.y - 6);
    body.lineTo(marker.x + 6, marker.y + 6);
    body.moveTo(marker.x + 6, marker.y - 6);
    body.lineTo(marker.x - 6, marker.y + 6);
    layers.planetLayer.addChild(body);
    const label = createMapText(
      "Shipwreck #" + shipwreck.id,
      {
        fontFamily: "Chakra Petch",
        fontSize: 11,
        fill: 0xd9dee5,
      },
      textResolution,
    );
    const labelPosition = allocateTileLabelPosition(labelSlots, shipwreck.position, center);
    label.x = labelPosition.x;
    label.y = labelPosition.y;
    layers.planetLayer.addChild(label);
  }

  for (const anomaly of Object.values(state.anomalies)) {
    const center = toPixel(anomaly.position);
    const marker = nextMarker(anomaly.position);
    const body = new Graphics();
    body.lineStyle(2, 0xe3a7ff, 0.95);
    body.beginFill(0x732b91, 0.75);
    body.drawPolygon([
      marker.x, marker.y - 7,
      marker.x + 7, marker.y,
      marker.x, marker.y + 7,
      marker.x - 7, marker.y,
    ]);
    body.endFill();
    layers.planetLayer.addChild(body);
    const label = createMapText(
      "Anomaly #" + anomaly.id,
      {
        fontFamily: "Chakra Petch",
        fontSize: 11,
        fill: 0xf0c8ff,
      },
      textResolution,
    );
    const labelPosition = allocateTileLabelPosition(labelSlots, anomaly.position, center);
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
      body.beginFill(ownerColor(state, fleet.ownerPlayerId), 1);
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
      if (fleet.confidence === "ESTIMATED") {
        tag.text = "≈ " + tag.text;
      }
      const labelPosition = allocateTileLabelPosition(labelSlots, coord, center);
      tag.x = labelPosition.x;
      tag.y = labelPosition.y;
      layers.fleetLayer.addChild(tag);
    });
  }
}

function drawPlannedPaths(
  state: GameState,
  layers: MapLayers,
  plannedMovePathsByFleetId: Record<string, HexCoord[]>,
  selectedFleetId: string | null,
): void {
  clearLayer(layers.effectLayer);

  for (const [fleetId, path] of Object.entries(plannedMovePathsByFleetId)) {
    if (path.length === 0) {
      continue;
    }

    const fleet = state.fleets[fleetId];
    if (!fleet) {
      continue;
    }

    const isSelected = selectedFleetId === fleetId;
    const line = new Graphics();
    line.lineStyle(isSelected ? 3 : 2, isSelected ? 0x8ed8ff : 0x4cc8ff, isSelected ? 0.92 : 0.72);

    const start = toPixel(fleet.position);
    line.moveTo(start.x, start.y);
    for (const step of path) {
      const point = toPixel(step);
      line.lineTo(point.x, point.y);
    }
    layers.effectLayer.addChild(line);

    const projected = path[path.length - 1];
    const projectedPixel = toPixel(projected);
    const marker = new Graphics();
    marker.lineStyle(2, 0xb8f1ff, 0.95);
    marker.beginFill(0x65dcff, 0.22);
    marker.drawCircle(projectedPixel.x, projectedPixel.y, 9);
    marker.endFill();
    layers.effectLayer.addChild(marker);
  }
}

function drawDraftPath(
  layers: MapLayers,
  selectedFleet: Nullable<Fleet>,
  plannedPath: HexCoord[],
): void {
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
  hasFullMapVisibility: boolean,
  visibilityState: GameState,
): void {
  clearLayer(layers.fogLayer);

  if (hasFullMapVisibility || !playerId) {
    return;
  }

  const player = visibilityState.players[playerId];
  if (!player) {
    return;
  }

  const visible = computeVisibleTiles(visibilityState, playerId);
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
