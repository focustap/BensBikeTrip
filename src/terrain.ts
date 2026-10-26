/** Shared tessellation for collision chains and the rendered road surface. */
export const TERRAIN_STEP = 8;
export const COIN_START = 1600;
export const COIN_SPACING = 1550;
export const COIN_VALUE = 1;
/** Deterministic terrain: the same hills on every run for a fair first prototype. */
export function terrainY(x: number): number {
  const u = Math.max(0, x - 430);
  const blend = Math.min(1, u / 540);
  const eased = blend * blend * (3 - 2 * blend);
  const rampPhase = (u % 2200) / 2200;
  const smooth = (a: number, b: number, v: number) => {
    const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  // Broad takeoffs and long downslopes make room for tricks at cruising speed.
  // These are ordinary collision surfaces; takeoff still comes only from momentum.
  const jumpHill = -155 * smooth(0.08, 0.27, rampPhase) * (1 - smooth(0.34, 0.70, rampPhase));
  return 530 + eased * (jumpHill +
    Math.sin(u / 650) * 45 +
    Math.sin(u / 240) * 16 +
    Math.sin(u / 115) * 6
  );
}

export function terrainSlope(x: number): number {
  return (terrainY(x + 3) - terrainY(x - 3)) / 6;
}

export function coinPosition(index: number): { x: number; y: number } {
  const x = COIN_START + index * COIN_SPACING + seeded(index + 23)*450;
  return { x, y: terrainY(x) - 78 - seeded(index + 81)*35 };
}

export function seeded(index: number): number {
  const n = Math.sin(index * 127.1 + 311.7) * 43758.5453123;
  return n - Math.floor(n);
}
