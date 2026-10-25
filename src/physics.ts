import { coinPosition, terrainSlope, terrainY } from './terrain';

export interface BikeSpec {
  id: string;
  name: string;
  subtitle: string;
  price: number;
  power: number;
  handling: number;
  wheelScale: number;
  color: string;
  accent: string;
  icon: string;
}

export const BIKES: BikeSpec[] = [
  { id: 'trail', name: 'Trailblazer', subtitle: 'Your trusty first ride', price: 0, power: 1, handling: 1, wheelScale: 1, color: '#f56950', accent: '#ffcf76', icon: '🏍️' },
  { id: 'pocket', name: "Lil' Squeak", subtitle: 'Very small. Very serious.', price: 180, power: 1.08, handling: 1.2, wheelScale: 0.66, color: '#c78dff', accent: '#f9e3ff', icon: '🐭' },
  { id: 'scrambler', name: 'Dirt Devil', subtitle: 'Built for the big hills', price: 500, power: 1.22, handling: 1.06, wheelScale: 1.12, color: '#64ddd0', accent: '#fff19b', icon: '⚡' },
  { id: 'rocket', name: 'The Questionable', subtitle: 'Who approved this?', price: 1200, power: 1.45, handling: 1.32, wheelScale: 0.93, color: '#f8be53', accent: '#fff', icon: '🚀' },
];

export interface BikeState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  av: number;
  wheelSpin: number;
  onGround: boolean;
  airtime: number;
  airRotation: number;
  boost: number;
  totalCoins: number;
  distance: number;
  dead: boolean;
  collected: Set<number>;
  lastBonus: number;
  nextLaunchX: number;
}

export function newBike(): BikeState {
  return { x: 145, y: terrainY(145) - 62, vx: 230, vy: 0, angle: 0, av: 0, wheelSpin: 0, onGround: true, airtime: 0, airRotation: 0, boost: 55, totalCoins: 0, distance: 0, dead: false, collected: new Set(), lastBonus: 0, nextLaunchX: 1480 };
}

const GRAVITY = 1270;

/** Lightweight two-contact suspension solver for a side-view arcade motorcycle. */
export function stepBike(
  b: BikeState, spec: BikeSpec, seconds: number, lean: number, boostPressed: boolean,
): { coin: number; flip: number; crashed: boolean; launch: boolean } {
  const dt = Math.min(seconds, 1 / 40);
  const wheelRadius = 17 * spec.wheelScale;
  const wheelX = 40 * spec.wheelScale;
  const wheelY = 27 * spec.wheelScale;
  const wasGrounded = b.onGround;
  const previousAngle = b.angle;
  const turbo = boostPressed && b.boost > 0;
  const targetSpeed = 510 * spec.power * (turbo ? 1.52 : 1);
  b.boost = Math.max(0, Math.min(100, b.boost + (turbo ? -34 : 1.35) * dt));

  // Pedal-free arcade throttle and aerodynamic drag.
  b.vx += (targetSpeed - b.vx) * (wasGrounded ? 1.5 : 0.23) * dt;
  b.vy += GRAVITY * dt;
  b.av += lean * (wasGrounded ? 4.6 : 12.3) * spec.handling * dt;
  if (!wasGrounded && lean === 0) b.av -= Math.sin(b.angle) * 11 * dt;
  b.av *= Math.exp(-dt * (wasGrounded ? 1.7 : (lean === 0 ? 1.85 : 0.3)));

  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.angle += b.av * dt;
  b.wheelSpin += (b.vx * dt) / Math.max(10, wheelRadius);

  let contacts = 0;
  let maxPenetration = 0;
  for (const wx of [-wheelX, wheelX]) {
    const cos = Math.cos(b.angle);
    const sin = Math.sin(b.angle);
    const rx = cos * wx - sin * wheelY;
    const ry = sin * wx + cos * wheelY;
    const px = b.x + rx;
    const py = b.y + ry;
    const penetration = py + wheelRadius - terrainY(px);
    if (penetration <= 0) continue;
    contacts++;
    maxPenetration = Math.max(maxPenetration, penetration);
    const slope = terrainSlope(px);
    const nx = slope / Math.sqrt(1 + slope * slope);
    const ny = -1 / Math.sqrt(1 + slope * slope);
    const vxAtWheel = b.vx - b.av * ry;
    const vyAtWheel = b.vy + b.av * rx;
    const approach = -(vxAtWheel * nx + vyAtWheel * ny);
    const force = Math.max(0, penetration * 74 + approach * 8);
    b.vx += nx * force * dt;
    b.vy += ny * force * dt;
    b.av += ((rx * ny - ry * nx) * force / 2400) * dt;
  }
  b.onGround = contacts > 0;
  if (maxPenetration > 22) b.y -= (maxPenetration - 22) * 0.38;
  b.vx = Math.max(80, Math.min(b.vx, targetSpeed * 1.42));
  b.vy = Math.max(-1100, Math.min(b.vy, 1200));
  b.av = Math.max(-12, Math.min(b.av, 12));

  let flip = 0;
  if (!b.onGround) {
    b.airtime += dt;
    b.airRotation += b.angle - previousAngle;
  } else if (!wasGrounded && b.airtime > 0.25) {
    flip = Math.floor(Math.abs(b.airRotation) / (Math.PI * 2 - 0.38));
    if (flip > 0) {
      b.totalCoins += flip * 30;
      b.boost = Math.min(100, b.boost + flip * 38);
      b.lastBonus = flip;
    }
    b.airtime = 0;
    b.airRotation = 0;
  } else if (b.onGround) {
    b.airtime = 0;
    b.airRotation = 0;
  }

  // Arcade launch zones give enough hang time for full rotations, even on gentle hills.
  let launch = false;
  if (b.onGround && b.x >= b.nextLaunchX) {
    b.vy = Math.min(b.vy, -770);
    b.av = 0;
    b.onGround = false;
    b.airtime = 0;
    b.airRotation = 0;
    b.nextLaunchX += 2800;
    launch = true;
  }

  let coin = 0;
  const nearIndex = Math.max(0, Math.floor((b.x - 690) / 235));
  for (let i = Math.max(0, nearIndex - 1); i <= nearIndex + 2; i++) {
    if (b.collected.has(i)) continue;
    const p = coinPosition(i);
    if (Math.hypot(p.x - b.x, p.y - b.y) < 75) {
      b.collected.add(i);
      b.totalCoins += 10;
      b.boost = Math.min(100, b.boost + 2);
      coin += 10;
    }
  }

  b.distance = Math.max(b.distance, Math.floor(Math.max(0, b.x - 145) / 6));
  // Rider head and handlebars are vulnerable to being driven into the hill.
  const headX = b.x + Math.sin(b.angle) * 52;
  const headY = b.y - Math.cos(b.angle) * 53;
  const riderHit = headY > terrainY(headX) - 5;
  const upsideDown = Math.cos(b.angle) < -0.48;
  const crashed = riderHit || (b.onGround && upsideDown && maxPenetration > 8);
  if (crashed) b.dead = true;
  return { coin, flip, crashed, launch };
}
