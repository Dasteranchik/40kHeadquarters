import { Container, Graphics, Text } from "pixi.js";

import type { Fleet, GameState } from "../../src/types";
import { defaultPlayerColor, playerColorToNumber } from "../../src/utils/playerColor";
import type { PixelPoint } from "./hexMath";

export interface TacticalObjectLayers {
  planetLayer: Container;
  fleetLayer: Container;
}

interface LabelSpec {
  text: string;
  color: number;
}

export interface TacticalObjectRenderParams {
  state: GameState;
  layers: TacticalObjectLayers;
  selectedFleet: Fleet | null;
  hexScale: number;
  textResolution: number;
  toPixel: (coord: { q: number; r: number }) => PixelPoint;
}

export function drawTacticalObjectOrbits(params: TacticalObjectRenderParams): void {
  const { state, layers, selectedFleet, hexScale, textResolution, toPixel } = params;
  clearLayer(layers.planetLayer);
  clearLayer(layers.fleetLayer);

  const tile = state.map.tiles[0];
  if (!tile) {
    return;
  }

  const center = toPixel(tile);
  const iconScale = 0.9 / hexScale;
  const textScale = 1 / hexScale;
  const sharpTextResolution = Math.max(4, textResolution);
  const markerSize = (value: number): number => value * iconScale;
  const ownerColor = (ownerPlayerId: number): number => {
    const color = state.players[ownerPlayerId]?.color ?? defaultPlayerColor(ownerPlayerId);
    return playerColorToNumber(color);
  };

  const orbitGuides = new Graphics();
  orbitGuides.lineStyle(1.2 / hexScale, 0x60a5fa, 0.7);
  for (const radius of [5.5, 10.5, 15, 19.5, 24]) {
    orbitGuides.drawCircle(center.x, center.y, radius);
  }
  layers.planetLayer.addChild(orbitGuides);

  drawOrbit(
    Object.values(state.planets),
    0,
    center,
    layers.planetLayer,
    textScale,
    sharpTextResolution,
    (planet, marker) => {
      const body = new Graphics();
      body.lineStyle(markerSize(2), 0xc8f1ff, 0.95);
      body.beginFill(0x5a8ef5, 0.9);
      body.drawCircle(marker.x, marker.y, markerSize(8));
      body.endFill();
      layers.planetLayer.addChild(body);
    },
    (planet) => ({ text: planet.name, color: 0xd8ecff }),
  );

  const armies = Object.values(state.fleets).filter((fleet) => fleet.domain === "GROUND");
  drawOrbit(
    armies,
    5.5,
    center,
    layers.fleetLayer,
    textScale,
    sharpTextResolution,
    (army, marker) => {
      const body = new Graphics();
      body.lineStyle(markerSize(2), army.id === selectedFleet?.id ? 0xffffff : 0x1a2533, 1);
      body.beginFill(ownerColor(army.ownerPlayerId), 1);
      body.drawCircle(marker.x, marker.y, markerSize(6));
      body.endFill();
      layers.fleetLayer.addChild(body);
    },
    (army) => ({ text: `Армия #${army.id}`, color: 0xf7f9fc }),
  );

  drawOrbit(
    Object.values(state.stations),
    10.5,
    center,
    layers.planetLayer,
    textScale,
    sharpTextResolution,
    (station, marker) => {
      const body = new Graphics();
      const halfSize = markerSize(6);
      body.lineStyle(markerSize(2), 0xe7d88f, 0.95);
      body.beginFill(0x8b6f32, 0.9);
      body.drawRect(marker.x - halfSize, marker.y - halfSize, halfSize * 2, halfSize * 2);
      body.endFill();
      layers.planetLayer.addChild(body);
    },
    (station) => ({ text: `Станция #${station.id}`, color: 0xffedaa }),
  );

  drawOrbit(
    Object.values(state.shipwrecks),
    15,
    center,
    layers.planetLayer,
    textScale,
    sharpTextResolution,
    (shipwreck, marker) => {
      const body = new Graphics();
      const halfSize = markerSize(6);
      body.lineStyle(markerSize(3), 0xbcc3cc, 0.95);
      body.moveTo(marker.x - halfSize, marker.y - halfSize);
      body.lineTo(marker.x + halfSize, marker.y + halfSize);
      body.moveTo(marker.x + halfSize, marker.y - halfSize);
      body.lineTo(marker.x - halfSize, marker.y + halfSize);
      layers.planetLayer.addChild(body);
    },
    (shipwreck) => ({ text: `Крушение #${shipwreck.id}`, color: 0xd9dee5 }),
  );

  drawOrbit(
    Object.values(state.anomalies),
    19.5,
    center,
    layers.planetLayer,
    textScale,
    sharpTextResolution,
    (anomaly, marker) => {
      const body = new Graphics();
      const radius = markerSize(7);
      body.lineStyle(markerSize(2), 0xe3a7ff, 0.95);
      body.beginFill(0x732b91, 0.8);
      body.drawPolygon([
        marker.x, marker.y - radius,
        marker.x + radius, marker.y,
        marker.x, marker.y + radius,
        marker.x - radius, marker.y,
      ]);
      body.endFill();
      layers.planetLayer.addChild(body);
    },
    (anomaly) => ({ text: `Аномалия #${anomaly.id}`, color: 0xf0c8ff }),
  );

  const fleets = Object.values(state.fleets).filter((fleet) => fleet.domain !== "GROUND");
  drawOrbit(
    fleets,
    24,
    center,
    layers.fleetLayer,
    textScale,
    sharpTextResolution,
    (fleet, marker) => {
      const body = new Graphics();
      body.lineStyle(markerSize(2), fleet.id === selectedFleet?.id ? 0xffffff : 0x1a2533, 1);
      body.beginFill(ownerColor(fleet.ownerPlayerId), 1);
      body.drawCircle(marker.x, marker.y, markerSize(7));
      body.endFill();
      layers.fleetLayer.addChild(body);
    },
    (fleet) => ({
      text: `${fleet.confidence === "ESTIMATED" ? "≈ " : ""}Флот #${fleet.id}`,
      color: 0xf7f9fc,
    }),
  );
}

function drawOrbit<T extends { id: number }>(
  items: T[],
  requestedRadius: number,
  center: PixelPoint,
  layer: Container,
  textScale: number,
  textResolution: number,
  drawMarker: (item: T, marker: PixelPoint) => void,
  labelFor: (item: T) => LabelSpec,
): void {
  const sorted = [...items].sort((left, right) => left.id - right.id);
  if (sorted.length === 0) {
    return;
  }

  const radius = requestedRadius === 0 && sorted.length > 1 ? 2.5 : requestedRadius;
  const angleStep = Math.min(Math.PI / 6, (Math.PI * 2) / sorted.length);
  for (let index = 0; index < sorted.length; index += 1) {
    const item = sorted[index];
    if (!item) {
      continue;
    }

    const angle = -Math.PI / 2 + angleStep * index;
    const marker: PixelPoint = {
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    };
    const labelPosition: PixelPoint = {
      x: marker.x,
      y: marker.y + 2.1,
    };

    drawMarker(item, marker);
    const spec = labelFor(item);
    const label = new Text(spec.text, {
      fontFamily: "Chakra Petch",
      fontSize: 11,
      fill: spec.color,
    });
    label.resolution = textResolution;
    label.anchor.set(0.5, 0.5);
    label.scale.set(textScale);
    label.x = labelPosition.x;
    label.y = labelPosition.y;
    layer.addChild(label);
  }
}

function clearLayer(layer: Container): void {
  layer.removeChildren().forEach((child) => child.destroy());
}

