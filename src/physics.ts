import { Body, Chain, Circle, Polygon, Vec2, WheelJoint, World, type Fixture } from 'planck';
import { BIKE_GEOMETRY as G } from './geometry';
import { coinPosition, TERRAIN_STEP, terrainY } from './terrain';

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

export const FIXED_DT = 1 / 120;
export const PIXELS_PER_METER = 40;
const P = PIXELS_PER_METER;
const CHUNK = 512;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
type Part = 'terrain' | 'wheel' | 'chassis' | 'head' | 'body';
export interface Pose { x: number; y: number; angle: number }
export interface WheelState extends Pose { grounded: boolean }
export interface BikeState extends Pose {
  vx: number;
  vy: number;
  av: number;
  wheels: [WheelState, WheelState];
  previous: { chassis: Pose; wheels: [Pose, Pose] };
  onGround: boolean;
  airtime: number;
  airRotation: number;
  boost: number;
  totalCoins: number;
  distance: number;
  dead: boolean;
  crashReason?: 'head' | 'impact' | 'stranded';
  collected: Set<number>;
  lastBonus: number;
  physics: MotorcyclePhysics;
}
/** Initial conditions also support deterministic headless scenario tests. */
export interface BikeOptions {
  terrain?: (x: number) => number;
  x?: number;
  y?: number;
  angle?: number;
  vx?: number;
  vy?: number;
  av?: number;
}

/** Three dynamic bodies. Planck alone integrates motion and resolves contact. */
export class MotorcyclePhysics {
  readonly world = new World(Vec2(0, 31.75));
  readonly chassis: Body;
  readonly wheels: [Body, Body];
  readonly joints: [WheelJoint, WheelJoint];
  readonly road: (x: number) => number;
  private chunks = new Map<number, Body>();
  private origin = 0;
  private strandedTime = 0;
  private impact = false;
  private headHit = false;
  private contacts = [false, false];
  private chassisContact = false;

  constructor(readonly spec: BikeSpec, options: BikeOptions) {
    this.road = options.terrain ?? terrainY;
    const s = spec.wheelScale;
    const x = options.x ?? 145;
    // Placement happens once at spawn; no runtime ground corrections.
    const angle = options.angle ?? Math.atan2(this.road(x + 40*s) - this.road(x - 40*s), 80*s);
    const y = options.y ?? this.road(x) - (G.axleY + G.tireRadius + 1)*s;
    this.chassis = this.world.createDynamicBody({
      position: Vec2(x/P, y/P), angle, bullet: true, angularDamping: 1.25,
    });
    const fixture = (shape: Circle | Polygon, part: Part, density: number) =>
      this.chassis.createFixture(shape, { density, friction: 0.45, restitution: 0, filterGroupIndex: -1, userData: part });
    fixture(new Polygon(G.chassis.map(([px, py]) => Vec2(px*s/P, py*s/P))), 'chassis', 15);
    fixture(new Circle(Vec2(G.head.x*s/P, G.head.y*s/P), G.head.radius*s/P), 'head', 1.2);
    // Capsules follow the renderer's round stroke caps and joints.
    const capsule = (ax: number, ay: number, bx: number, by: number, radius: number, part: Part, density: number) => {
      const dx = bx-ax, dy = by-ay, len = Math.hypot(dx, dy);
      const nx = -dy/len*radius, ny = dx/len*radius;
      fixture(new Polygon([
        Vec2((ax+nx)*s/P, (ay+ny)*s/P), Vec2((ax-nx)*s/P, (ay-ny)*s/P),
        Vec2((bx-nx)*s/P, (by-ny)*s/P), Vec2((bx+nx)*s/P, (by+ny)*s/P),
      ]), part, density);
      for (const [px, py] of [[ax, ay], [bx, by]])
        fixture(new Circle(Vec2(px*s/P, py*s/P), radius*s/P), part, density/3);
    };
    const t = G.torso;
    capsule(t.ax, t.ay, t.bx, t.by, t.radius, 'body', 3);
    for (const [points, radius, part] of [[G.legs, 5, 'body'], [G.arms, 3, 'body'], [G.handlebar, 2, 'chassis']] as const) {
      for (let i = 1; i < points.length; i++) {
        const [ax, ay] = points[i-1], [bx, by] = points[i];
        capsule(ax, ay, bx, by, radius, part, 0.2);
      }
    }
    this.wheels = [-1, 1].map(side => {
      const anchor = this.chassis.getWorldPoint(Vec2(side*G.axleX*s/P, G.axleY*s/P));
      const wheel = this.world.createDynamicBody({ position: anchor, angle, bullet: true });
      wheel.createFixture(new Circle(G.tireRadius*s/P), {
        density: 3, friction: 1.4, restitution: 0, filterGroupIndex: -1, userData: 'wheel',
      });
      return wheel;
    }) as [Body, Body];
    this.joints = this.wheels.map((wheel, i) => this.world.createJoint(new WheelJoint({
      frequencyHz: 5.5, dampingRatio: 0.9, enableMotor: i === 0,
      motorSpeed: 0, maxMotorTorque: 0,
    }, this.chassis, wheel, wheel.getPosition(), this.chassis.getWorldVector(Vec2(0, 1))))!) as [WheelJoint, WheelJoint];
    const velocity = Vec2((options.vx ?? 230)/P, (options.vy ?? 0)/P);
    for (const body of [this.chassis, ...this.wheels]) {
      body.setLinearVelocity(velocity);
      body.setAngularVelocity(body === this.chassis ? options.av ?? 0 : velocity.x/(G.tireRadius*s/P));
    }
    this.streamTerrain(x);
    this.world.on('begin-contact', contact => {
      const a = contact.getFixtureA(), b = contact.getFixtureB();
      if (this.terrainPart(a, b)?.getUserData() === 'head') this.headHit = true;
    });
    this.world.on('post-solve', (contact, impulse) => {
      const part = this.terrainPart(contact.getFixtureA(), contact.getFixtureB());
      if (part?.getUserData() === 'body') {
        // Normal impulse / mass is the collision's change in speed, not pitch.
        const deltaV = impulse.normalImpulses.reduce((sum, value) => sum + value, 0)/this.chassis.getMass();
        if (deltaV > 3.8) this.impact = true;
      }
    });
  }

  private terrainPart(a: Fixture, b: Fixture): Fixture | undefined {
    if (a.getUserData() === 'terrain') return b;
    if (b.getUserData() === 'terrain') return a;
  }

  private streamTerrain(x: number): void {
    const first = Math.floor((x - 1536)/CHUNK), last = Math.floor((x + 2048)/CHUNK);
    for (let i = first; i <= last; i++) {
      if (this.chunks.has(i)) continue;
      const start = i*CHUNK;
      const point = (px: number) => Vec2((px-this.origin)/P, this.road(px)/P);
      const vertices = Array.from({ length: CHUNK/TERRAIN_STEP + 1 }, (_, j) => point(start+j*TERRAIN_STEP));
      const shape = new Chain(vertices);
      shape.setPrevVertex(point(start-TERRAIN_STEP));
      shape.setNextVertex(point(start+CHUNK+TERRAIN_STEP));
      const body = this.world.createBody();
      body.createFixture(shape, { friction: 1.2, restitution: 0, userData: 'terrain' });
      this.chunks.set(i, body);
    }
    for (const [i, body] of this.chunks) {
      if (i < first-1 || i > last+1) { this.world.destroyBody(body); this.chunks.delete(i); }
    }
  }

  pose(body: Body): Pose {
    const p = body.getPosition();
    return { x: p.x*P + this.origin, y: p.y*P, angle: body.getAngle() };
  }

  step(b: BikeState, lean: number, boost: boolean): void {
    const s = this.spec.wheelScale;
    const turbo = boost && b.boost > 0;
    b.boost = clamp(b.boost + (turbo ? -34 : 1.35)*FIXED_DT, 0, 100);
    this.streamTerrain(b.x);
    // Motor torque is traction-limited by the tire contacts. No chassis thrust.
    this.joints[0].setMotorSpeed(510*this.spec.power*(turbo ? 1.52 : 1)/(G.tireRadius*s));
    this.joints[0].setMaxMotorTorque(120*s*s*s*(turbo ? 1.55 : 1));
    // Inertia-scaled torque keeps the tiny bike responsive too. Never an angle target.
    const controlAcceleration = b.onGround ? 155/s : 110;
    this.chassis.applyTorque(clamp(lean, -1, 1)*this.chassis.getInertia()*controlAcceleration*this.spec.handling, true);
    b.previous = { chassis: this.pose(this.chassis), wheels: this.wheels.map(w => this.pose(w)) as [Pose, Pose] };
    this.world.step(FIXED_DT, 8, 3);
    this.contacts.fill(false);
    this.chassisContact = false;
    for (let contact = this.world.getContactList(); contact; contact = contact.getNext()) {
      if (!contact.isTouching() || !contact.isEnabled()) continue;
      const part = this.terrainPart(contact.getFixtureA(), contact.getFixtureB());
      if (!part) continue;
      const index = this.wheels.indexOf(part.getBody());
      if (index >= 0) this.contacts[index] = true;
      else this.chassisContact = true;
    }
    Object.assign(b, this.pose(this.chassis));
    b.wheels = this.wheels.map((wheel, i) => ({ ...this.pose(wheel), grounded: this.contacts[i] })) as [WheelState, WheelState];
    const v = this.chassis.getLinearVelocity();
    b.vx = v.x*P; b.vy = v.y*P; b.av = this.chassis.getAngularVelocity();
    b.onGround = this.contacts.some(Boolean);
    // A resting wreck is unrecoverable only after actual non-wheel ground contact.
    this.strandedTime = this.chassisContact && !b.onGround && v.length() < 0.6 && Math.abs(b.av) < 0.5
      ? this.strandedTime + FIXED_DT : 0;
    if (this.headHit || this.impact || this.strandedTime > 1.5) {
      b.dead = true;
      b.crashReason = this.headHit ? 'head' : this.impact ? 'impact' : 'stranded';
    }
    // Keep Box2D coordinates precise during endless runs. This shifts the entire
    // world together; it changes no relative positions, velocities or contacts.
    const shift = Math.trunc(this.chassis.getPosition().x/256)*256;
    if (shift) { this.world.shiftOrigin(Vec2(shift, 0)); this.origin += shift*P; }
  }
}

export function newBike(spec: BikeSpec = BIKES[0], options: BikeOptions = {}): BikeState {
  const physics = new MotorcyclePhysics(spec, options);
  const pose = physics.pose(physics.chassis);
  const wheels = physics.wheels.map(w => ({ ...physics.pose(w), grounded: false })) as [WheelState, WheelState];
  return {
    ...pose, vx: options.vx ?? 230, vy: options.vy ?? 0, av: options.av ?? 0, wheels,
    previous: { chassis: { ...pose }, wheels: [{ ...wheels[0] }, { ...wheels[1] }] },
    onGround: false, airtime: 0, airRotation: 0, boost: 55, totalCoins: 0,
    distance: 0, dead: false, collected: new Set(), lastBonus: 0, physics,
  };
}

/** Called only with the shared fixed timestep by the animation loop and tests. */
export function stepBike(b: BikeState, lean: number, boostPressed: boolean): { coin: number; flip: number; crashed: boolean; launch: boolean } {
  if (b.dead) return { coin: 0, flip: 0, crashed: true, launch: false };
  const wasGrounded = b.onGround, oldAngle = b.angle;
  b.physics.step(b, lean, boostPressed);
  const launch = wasGrounded && !b.onGround;
  let flip = 0;
  // Include the landing step in rotation accounting; never wrap the angle.
  if (!wasGrounded || !b.onGround) b.airRotation += b.angle-oldAngle;
  if (!b.onGround) b.airtime += FIXED_DT;
  else {
    if (!wasGrounded && b.airtime > 0.25 && !b.dead) {
      flip = Math.floor((Math.abs(b.airRotation) + 0.15)/(Math.PI*2));
      if (flip) {
        b.totalCoins += flip*30; b.boost = Math.min(100, b.boost + flip*38); b.lastBonus = flip;
      }
    }
    b.airtime = 0; b.airRotation = 0;
  }
  let coin = 0;
  const nearIndex = Math.max(0, Math.floor((b.x-690)/235));
  if (!b.dead) for (let i = Math.max(0, nearIndex-1); i <= nearIndex+2; i++) {
    if (b.collected.has(i)) continue;
    const p = coinPosition(i);
    if (Math.hypot(p.x-b.x, p.y-b.y) < 75) {
      b.collected.add(i); b.totalCoins += 10; b.boost = Math.min(100, b.boost+2); coin += 10;
    }
  }
  b.distance = Math.max(b.distance, Math.floor(Math.max(0, b.x-145)/6));
  return { coin, flip, crashed: b.dead, launch };
}

/** Render one fixed step behind; chassis and both suspension poses interpolate. */
export function interpolateBike(b: BikeState, alpha: number): BikeState {
  const mix = (a: Pose, z: Pose): Pose => ({
    x: a.x + (z.x-a.x)*alpha, y: a.y + (z.y-a.y)*alpha, angle: a.angle + (z.angle-a.angle)*alpha,
  });
  return { ...b, ...mix(b.previous.chassis, b), wheels: b.wheels.map((w, i) => ({
    ...w, ...mix(b.previous.wheels[i], w),
  })) as [WheelState, WheelState] };
}
