import test from 'node:test';
import assert from 'node:assert/strict';
import { BIKES, FIXED_DT, PIXELS_PER_METER, interpolateBike, newBike, stepBike, type BikeState } from '../src/physics';
import { BIKE_GEOMETRY as G } from '../src/geometry';
import { coinPosition, terrainSlope } from '../src/terrain';

const flat = () => 530;
function run(b: BikeState, seconds: number, lean = 0, boost = false): void {
  for (let i = 0; i < Math.round(seconds/FIXED_DT) && !b.dead; i++) stepBike(b, lean, boost);
}

for (const spec of BIKES) {
  for (const lean of [-1, 1]) test(`${spec.name}: ${lean < 0 ? 'wheelie' : 'stoppie'} lifts a tire, continued hold crashes on helmet`, () => {
    const b = newBike(spec, { terrain: flat });
    let lift = false;
    for (let i = 0; i < 600 && !b.dead; i++) {
      stepBike(b, lean, false);
      const lifted = b.wheels[lean < 0 ? 1 : 0], support = b.wheels[lean < 0 ? 0 : 1];
      if (!lifted.grounded && support.grounded && lifted.y < support.y - 8*spec.wheelScale) lift = true;
    }
    assert.ok(lift, 'opposite wheel lifts with the supporting wheel touching the ground');
    assert.ok(b.dead);
    assert.equal(b.crashReason, 'head');
  });

  test(`${spec.name}: neutral flat ride stays stable across streamed terrain seams`, () => {
    const b = newBike(spec, { terrain: flat });
    run(b, 1);
    const baseline = b.y;
    let maxSpeedY = 0, minY = Infinity, maxY = -Infinity, airborne = 0;
    for (let i = 0; i < 3600; i++) {
      stepBike(b, 0, false);
      maxSpeedY = Math.max(maxSpeedY, Math.abs(b.vy));
      minY = Math.min(minY, b.y); maxY = Math.max(maxY, b.y);
      if (!b.onGround) airborne++;
    }
    assert.equal(b.dead, false);
    assert.ok(b.x > 10000, 'crosses terrain chunks and floating origin boundary');
    assert.ok(Math.abs(b.angle) < 0.03);
    assert.ok(maxSpeedY < 6, `vertical jitter: ${maxSpeedY}`);
    assert.ok(maxY-minY < 2 && Math.abs(b.y-baseline) < 2);
    assert.equal(airborne, 0, 'no invisible jumps on flat ground');
    assert.ok(b.physics.world.getBodyCount() < 16, 'streaming retains bounded terrain bodies');
  });

  test(`${spec.name}: both controls permit multiple full rotations in free flight`, () => {
    for (const lean of [-1, 1]) {
      const b = newBike(spec, { terrain: flat, y: -4000 });
      run(b, 1.4, lean);
      assert.equal(b.dead, false, 'extreme airborne angle is not a crash');
      assert.ok(b.angle*lean > Math.PI*4, `angle ${b.angle}`);
      const av = b.av;
      run(b, 0.2, -lean);
      assert.ok(Math.abs(b.av) < Math.abs(av), 'opposite torque brakes angular momentum');
    }
  });

  test(`${spec.name}: full backflip, correct rotation, land and keep riding`, () => {
    const b = newBike(spec, { terrain: flat, y: -1000, vx: 400 });
    let flips = 0, landed = false, landingX = 0;
    for (let i = 0; i < 600 && !b.dead; i++) {
      // Test driver uses only the same torque input as a player, never a transform.
      const lean = b.onGround ? 0 : Math.max(-1, Math.min(1, (-Math.PI*2-b.angle)*2.5-b.av*0.8));
      const result = stepBike(b, lean, false);
      flips += result.flip;
      if (result.flip) { landed = true; landingX = b.x; }
    }
    assert.equal(b.dead, false);
    assert.ok(landed && flips === 1);
    assert.ok(b.wheels.every(wheel => wheel.grounded));
    assert.ok(b.x > landingX+400, 'continues driving after landing');
    assert.ok(Math.abs(b.angle+Math.PI*2) < 0.05, 'angle stays unwrapped through landing');
    assert.ok(b.totalCoins >= 30 && b.lastBonus === 1);
  });
}

test('small smooth bumps track without repeated bouncing or crashes', () => {
  const b = newBike(BIKES[0], { terrain: x => 530 + 4*Math.sin(x/100) });
  let airborne = 0, peakV = 0;
  for (let i = 0; i < 2400; i++) {
    stepBike(b, 0, false);
    if (i > 120 && !b.onGround) airborne++;
    peakV = Math.max(peakV, Math.abs(b.vy));
  }
  assert.equal(b.dead, false);
  assert.ok(airborne < 8);
  assert.ok(peakV < 65, `peak vertical speed ${peakV}`);
});

test('crest detaches naturally: velocity remains continuous and flight obeys gravity', () => {
  const hill = (x: number) => 530 - 125*Math.exp(-(((x-850)/140)**2));
  const b = newBike(BIKES[0], { terrain: hill, vx: 650 });
  let launch = false, airborne = 0;
  for (let i = 0; i < 600 && !b.dead; i++) {
    const vy = b.vy;
    const result = stepBike(b, 0, true);
    if (result.launch && b.vy < -60) {
      launch = true;
      assert.ok(Math.abs(b.vy-vy) < 50, 'no upward kick at takeoff');
    }
    if (launch && !b.onGround) airborne += FIXED_DT;
  }
  assert.ok(launch);
  assert.ok(airborne > 0.3, `flight time ${airborne}`);
});

test('airborne boost cannot add translation: total momentum follows only gravity', () => {
  const b = newBike(BIKES[0], { terrain: flat, y: -2000, vx: 500, vy: -100 });
  const momentum = () => {
    const bodies = [b.physics.chassis, ...b.physics.wheels];
    const mass = bodies.reduce((sum, body) => sum + body.getMass(), 0);
    return bodies.reduce((v, body) => ({ x: v.x+body.getMass()*body.getLinearVelocity().x/mass,
      y: v.y+body.getMass()*body.getLinearVelocity().y/mass }), { x: 0, y: 0 });
  };
  const before = momentum();
  run(b, 0.5, -1, true);
  const after = momentum();
  assert.ok(Math.abs(after.x-before.x) < 1e-8);
  assert.ok(Math.abs(after.y-before.y-31.75*0.5) < 1e-8);
  assert.ok(b.boost < 55);
});

test('upside-down landing and high-speed helmet impact crash through continuous contact', () => {
  for (const vy of [0, 5000]) {
    const b = newBike(BIKES[0], { terrain: flat, y: vy ? 100 : 420, angle: Math.PI, vy, vx: 0 });
    run(b, 1);
    assert.ok(b.dead);
    assert.equal(b.crashReason, 'head');
    assert.ok(b.y < 550, 'helmet did not tunnel below the road');
  }
});

test('render interpolation follows both wheel bodies through suspension travel', () => {
  const b = newBike();
  run(b, 0.3, -1);
  const mid = interpolateBike(b, 0.5);
  assert.equal(mid.x, (b.x+b.previous.chassis.x)/2);
  assert.equal(mid.wheels[1].y, (b.wheels[1].y+b.previous.wheels[1].y)/2);
  assert.ok(Math.abs(b.physics.wheels[0].getFixtureList()!.getShape().getRadius()*PIXELS_PER_METER-G.tireRadius) < 1e-8);
});

test('normal riding follows the actual game hills and launches without rotation input', () => {
  const b = newBike(BIKES[0]);
  let jumps = 0, longestAir = 0;
  for (let i = 0; i < 3600; i++) {
    const result = stepBike(b, 0, false);
    if (result.launch) jumps++;
    longestAir = Math.max(longestAir, b.airtime);
  }
  assert.equal(b.dead, false);
  assert.ok(b.distance > 2000);
  assert.ok(jumps > 0 && longestAir > 0.25);
});

test('boost into an actual course hill, complete a backflip and continue over the next hill', () => {
  const b = newBike(BIKES[0]);
  let flips = 0, landingX = 0, longestAir = 0, bothWheelsLanded = false;
  for (let i = 0; i < 1600 && !b.dead; i++) {
    // A test driver presses only full left/right/neutral and boost. The production
    // solver has no target angle, course trigger, or takeoff assistance.
    const target = -2*Math.PI + (flips ? Math.atan(terrainSlope(b.x)) : 0);
    const lean = b.x > 1200 ? Math.sign((target-b.angle)*8-b.av*0.8) : 0;
    const result = stepBike(b, lean, b.x > 900 && flips === 0);
    longestAir = Math.max(longestAir, b.airtime);
    flips += result.flip;
    if (result.flip) landingX = b.x;
    if (flips && b.wheels.every(wheel => wheel.grounded)) bothWheelsLanded = true;
    if (flips && b.x > landingX+500) break;
  }
  assert.equal(b.dead, false);
  assert.equal(flips, 1);
  assert.ok(bothWheelsLanded && b.x > landingX+500);
  assert.ok(longestAir > 0.5);
});

test('coins can be collected only once and replenish boost', () => {
  const p = coinPosition(0);
  const b = newBike(BIKES[0], { x: p.x, y: p.y, vx: 0, terrain: () => 2000 });
  assert.equal(stepBike(b, 0, false).coin, 10);
  run(b, 0.1);
  assert.equal(b.totalCoins, 10);
  assert.ok(b.collected.has(0) && b.boost > 57);
});

test('boost increases speed through ground traction and consumes the existing meter', () => {
  const normal = newBike(BIKES[0], { terrain: flat });
  const boosted = newBike(BIKES[0], { terrain: flat });
  run(normal, 1.2); run(boosted, 1.2, 0, true);
  assert.equal(boosted.dead, false);
  assert.ok(boosted.vx > normal.vx+100);
  assert.ok(boosted.boost < normal.boost-30);
});
