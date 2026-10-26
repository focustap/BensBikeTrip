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
  takeoffGrace: number;
  launchCooldown: number;
}

const GRAVITY = 1270;
const MAX_WHEELIE = 0.95;
const MAX_STOPPIE = 0.58;

const clamp = (v: number, low: number, high: number) => Math.max(low, Math.min(high, v));
const angleDelta = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

/**
 * Ground height for the bike's center, not an impulse or a suspension force.
 * Keeping *both* tires above the road and allowing one to lift is what makes
 * grounded wheelies possible without vibrating or catapulting the motorcycle.
 */
function supportY(x: number, angle: number, scale: number): number {
  const c = Math.cos(angle), s = Math.sin(angle);
  const ax = 40 * scale, ay = 27 * scale, radius = 17 * scale;
  let highestSurface = Infinity;
  for (const offset of [-ax, ax]) {
    const px = x + c * offset - s * ay;
    const ry = s * offset + c * ay;
    highestSurface = Math.min(highestSurface, terrainY(px) - radius - ry);
  }
  return highestSurface;
}

function roadAngle(x: number, scale: number): number {
  const width = 40 * scale;
  return Math.atan2(terrainY(x + width) - terrainY(x - width), 2 * width);
}

/** The tire actually holding the bike up determines the launch slope. */
function contactX(x: number, angle: number, scale: number): number {
  const c = Math.cos(angle), s = Math.sin(angle);
  const ax = 40 * scale, ay = 27 * scale, radius = 17 * scale;
  let bestY = Infinity;
  let bestX = x;
  for (const offset of [-ax, ax]) {
    const px = x + c * offset - s * ay;
    const ry = s * offset + c * ay;
    const possibleCenter = terrainY(px) - radius - ry;
    if (possibleCenter < bestY) { bestY = possibleCenter; bestX = px; }
  }
  return bestX;
}

function roadCurvature(x: number): number {
  const h = 35;
  return (terrainY(x - h) - 2 * terrainY(x) + terrainY(x + h)) / (h * h);
}

export function newBike(wheelScale = 1): BikeState {
  const x = 145;
  const angle = roadAngle(x, wheelScale);
  return {
    x, y: supportY(x, angle, wheelScale), vx: 230, vy: 0, angle, av: 0,
    wheelSpin: 0, onGround: true, airtime: 0, airRotation: 0,
    boost: 55, totalCoins: 0, distance: 0, dead: false,
    collected: new Set(), lastBonus: 0, takeoffGrace: 0, launchCooldown: 0,
  };
}

/**
 * Stable, arcade-style wheel-contact physics. A grounded tire supports the bike
 * without a giant spring impulse; momentum only takes over when it leaves a hill.
 * Holding lean-back genuinely raises the front tire, even while riding on land.
 */
export function stepBike(
  b: BikeState, spec: BikeSpec, seconds: number, lean: number, boostPressed: boolean,
): { coin: number; flip: number; crashed: boolean; launch: boolean } {
  const dt = Math.min(seconds, 1 / 40);
  b.launchCooldown = Math.max(0, b.launchCooldown - dt);
  const wasGrounded = b.onGround;
  const oldAngle = b.angle;
  const turbo = boostPressed && b.boost > 0;
  const targetSpeed = 510 * spec.power * (turbo ? 1.52 : 1);
  b.boost = clamp(b.boost + (turbo ? -34 : 1.35) * dt, 0, 100);

  // Throttle accelerates on the road, while air travel preserves momentum.
  b.vx += (targetSpeed - b.vx) * (wasGrounded ? 1.55 : 0.1) * dt;
  b.vx = clamp(b.vx, 80, targetSpeed * 1.4);

  const lastSupport = supportY(b.x, b.angle, spec.wheelScale);
  b.x += b.vx * dt;
  let launch = false;

  if (wasGrounded) {
    // Input is a *pitch target*, not a weak force fighting the ground solver.
    // Negative pitch lifts the front wheel; positive pitch lifts the rear wheel.
    const pitch = lean < 0 ? lean * MAX_WHEELIE : lean * MAX_STOPPIE;
    const desired = clamp(roadAngle(b.x, spec.wheelScale) + pitch, -1.25, 1.15);
    const error = angleDelta(b.angle, desired);
    b.av += (34 * error - 10.5 * b.av) * spec.handling * dt;
    b.av = clamp(b.av, -4.7 * spec.handling, 4.7 * spec.handling);
    b.angle += b.av * dt;

    const ground = supportY(b.x, b.angle, spec.wheelScale);
    const tireX = contactX(b.x, b.angle, spec.wheelScale);
    const groundSpeed = terrainSlope(tireX) * b.vx;

    // A convex crest at sufficient speed is an actual jump. There are no
    // scripted launch zones or invisible upward velocity injections.
    const outwardAccel = roadCurvature(tireX) * b.vx * b.vx;
    if (b.launchCooldown <= 0 && outwardAccel > GRAVITY * 1.04 && groundSpeed < -65 && ground > lastSupport - 5) {
      b.onGround = false;
      b.vy = clamp(groundSpeed, -800, 800);
      b.y = ground;
      b.takeoffGrace = 0.07;
      b.launchCooldown = 0.24;
      launch = true;
    } else {
      b.onGround = true;
      b.y = ground;
      b.vy = clamp(groundSpeed, -900, 900);
    }
  } else {
    b.takeoffGrace = Math.max(0, b.takeoffGrace - dt);
    b.vy = Math.min(1450, b.vy + GRAVITY * dt);
    b.y += b.vy * dt;
    b.av += lean * 17 * spec.handling * dt;
    if (!lean) b.av *= Math.exp(-0.42 * dt);
    b.av = clamp(b.av, -9.5 * spec.handling, 9.5 * spec.handling);
    b.angle += b.av * dt;

    const ground = supportY(b.x, b.angle, spec.wheelScale);
    if (b.y >= ground && (b.takeoffGrace <= 0 || b.y - ground > 6)) {
      const landingSpeed = terrainSlope(contactX(b.x, b.angle, spec.wheelScale)) * b.vx;
      // Never turn penetration into a rocket-like upward kick.
      b.y = ground;
      b.vy = clamp(landingSpeed, -900, 900);
      b.onGround = true;
    }
  }
  b.wheelSpin += b.vx * dt / (17 * spec.wheelScale);

  let flip = 0;
  if (!b.onGround) {
    b.airtime += dt;
    b.airRotation += b.angle - oldAngle;
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
  // Check the actual drawn rider head rather than a different imaginary point.
  const cos = Math.cos(b.angle), sin = Math.sin(b.angle);
  const headX = b.x - 16 * spec.wheelScale * cos + 55 * spec.wheelScale * sin;
  const headY = b.y - 16 * spec.wheelScale * sin - 55 * spec.wheelScale * cos;
  const riderHit = headY + 10 * spec.wheelScale > terrainY(headX);
  const upsideDown = cos < -0.5;
  const crashed = riderHit || (b.onGround && upsideDown);
  if (crashed) b.dead = true;
  return { coin, flip, crashed, launch };
}
