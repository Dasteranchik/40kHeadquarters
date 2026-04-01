import type { HexCoord } from "../../src/types";

export const HEX_DIRECTIONS: ReadonlyArray<HexCoord> = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export interface PixelPoint {
  x: number;
  y: number;
}

export interface HexLayout {
  hexSize: number;
  offset: PixelPoint;
}

export function axialToPixel(coord: HexCoord, layout: HexLayout): PixelPoint {
  const x =
    layout.hexSize *
    (Math.sqrt(3) * coord.q + (Math.sqrt(3) / 2) * coord.r);
  const y = layout.hexSize * ((3 / 2) * coord.r);

  return {
    x: x + layout.offset.x,
    y: y + layout.offset.y,
  };
}

export function pixelToAxial(x: number, y: number, layout: HexLayout): HexCoord {
  const translatedX = x - layout.offset.x;
  const translatedY = y - layout.offset.y;

  const q =
    ((Math.sqrt(3) / 3) * translatedX - (1 / 3) * translatedY) / layout.hexSize;
  const r = ((2 / 3) * translatedY) / layout.hexSize;

  return cubeRound(q, r);
}

export function cubeRound(q: number, r: number): HexCoord {
  const x = q;
  const z = r;
  const y = -x - z;

  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);

  const xDiff = Math.abs(rx - x);
  const yDiff = Math.abs(ry - y);
  const zDiff = Math.abs(rz - z);

  if (xDiff > yDiff && xDiff > zDiff) {
    rx = -ry - rz;
  } else if (yDiff > zDiff) {
    ry = -rx - rz;
  } else {
    rz = -rx - ry;
  }

  return { q: rx, r: rz };
}

export function hexPolygon(center: PixelPoint, size: number): number[] {
  const points: number[] = [];

  for (let i = 0; i < 6; i += 1) {
    const angle = ((60 * i - 30) * Math.PI) / 180;
    points.push(center.x + size * Math.cos(angle));
    points.push(center.y + size * Math.sin(angle));
  }

  return points;
}
