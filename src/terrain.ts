/** Shared tessellation for collision chains and the rendered road surface. */
export const TERRAIN_STEP = 8;
/** Deterministic terrain: the same hills on every run for a fair first prototype. */
export function terrainY(x: number): number {
  const u = Math.max(0, x - 430);
  const blend = Math.min(1, u / 540);
  const eased = blend * blend * (3 - 2 * blend);
  const rampPhase = (u % 1800) / 1800;
  const smooth = (a: number, b: number, v: number) => {
    const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const jumpHill = -85 * smooth(0.13, 0.35, rampPhase) * (1 - smooth(0.55, 0.72, rampPhase));
  return 530 + eased * (jumpHill +
    Math.sin(u / 410) * 88 +
    Math.sin(u / 177) * 45 +
    Math.sin(u / 87) * 25 +
    Math.sin(u / 920) * 42
  );
}

export function terrainSlope(x: number): number {
  return (terrainY(x + 3) - terrainY(x - 3)) / 6;
}

export function coinPosition(index: number): { x: number; y: number } {
  const x = 690 + index * 235;
  return { x, y: terrainY(x) - 84 - (Math.sin(index * 3.7) + 1) * 18 };
}

export function seeded(index: number): number {
  const n = Math.sin(index * 127.1 + 311.7) * 43758.5453123;
  return n - Math.floor(n);
}
