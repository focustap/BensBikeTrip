import test from 'node:test';
import assert from 'node:assert/strict';
import { BIKES, CRUISE_SPEED, FIXED_DT, GRAVITY, MAX_OVERBOOST, newBike, stepBike, type BikeState } from '../src/physics';
import { COIN_SPACING, COIN_VALUE, coinPosition } from '../src/terrain';
import { RideControls } from '../src/controls';

const flat = () => 530;
function run(b: BikeState, seconds: number, lean = 0, slam = false): void {
  for (let i = 0; i < Math.round(seconds/FIXED_DT) && !b.dead; i++) stepBike(b, lean, false, slam);
}
function velocity(b: BikeState): { x: number; y: number } {
  const bodies = [b.physics.chassis, ...b.physics.wheels];
  const mass = bodies.reduce((n, body) => n+body.getMass(), 0);
  return bodies.reduce((v, body) => ({
    x: v.x + body.getMass()*body.getLinearVelocity().x/mass,
    y: v.y + body.getMass()*body.getLinearVelocity().y/mass,
  }), { x: 0, y: 0 });
}

test('every bike starts with real cruising momentum in its chassis and both tires', () => {
  for (const spec of BIKES) {
    const b = newBike(spec);
    assert.equal(b.vx, CRUISE_SPEED*spec.power);
    assert.ok(b.vx >= 800);
    assert.ok(Math.abs(velocity(b).x*40-b.vx) < 1e-8);
  }
});

test('short air taps are gentle while held controls still accumulate rotation', () => {
  const b = newBike(BIKES[0], { y: -4000, terrain: flat });
  run(b, 0.1, -1);
  assert.ok(Math.abs(b.angle) < 0.18, `tap rotates ${b.angle} radians`);
  const angle = b.angle;
  run(b, 0.2);
  assert.ok(b.angle < angle, 'release preserves momentum instead of snapping upright');
});

test('landing a flip starts automatic overboost without a boost-button press', () => {
  const b = newBike(BIKES[0], { y: -1000, vx: 400, terrain: flat });
  for (let i = 0; i < 600 && !b.dead; i++) {
    const lean = b.onGround ? 0 : Math.max(-1, Math.min(1, (-Math.PI*2-b.angle)*2.5-b.av*0.8));
    const result = stepBike(b, lean, false);
    if (result.flip) {
      assert.ok(b.wheels.every(w => w.grounded));
      assert.ok(result.overboostEarned >= 2.5 && b.overboost >= 2.5);
      assert.ok(b.overboost <= MAX_OVERBOOST);
      const before = b.vx;
      for (let j = 0; j < 180 && !b.dead; j++) {
        const correction = b.onGround ? 0 : Math.max(-1, Math.min(1, (-Math.PI*2-b.angle)*2.5-b.av*0.8));
        stepBike(b, correction, false);
      }
      assert.equal(b.dead, false);
      assert.ok(b.vx > before + 100, 'earned overboost accelerates through the tires');
      return;
    }
  }
  assert.fail('flip never earned overboost');
});

test('overboost is faster than cruising, expires, and preserves momentum in the air', () => {
  const normal = newBike(BIKES[0], { terrain: flat });
  const boosted = newBike(BIKES[0], { terrain: flat });
  boosted.overboost = 4;
  run(normal, 2); run(boosted, 2);
  assert.equal(boosted.dead, false);
  assert.ok(boosted.vx > normal.vx+150);
  const air = newBike(BIKES[0], { y: -4000, vx: 1200, terrain: flat });
  air.overboost = 0.1;
  const before = velocity(air);
  run(air, 0.5);
  assert.equal(air.overboost, 0);
  assert.ok(Math.abs(velocity(air).x-before.x) < 1e-8, 'boost expiry does not brake airborne momentum');
});

test('both tilt holds, A+D, arrows and S request the same slam; releasing one restores tilt', () => {
  const touch = new RideControls(), keyboard = new RideControls();
  touch.pointer('back', 11, true); touch.pointer('forward', 12, true);
  keyboard.key('KeyA', true); keyboard.key('KeyD', true);
  assert.deepEqual(touch.sample(), keyboard.sample());
  assert.deepEqual(touch.sample(), { lean: 0, boost: false, slam: true });
  touch.pointer('forward', 12, false);
  assert.deepEqual(touch.sample(), { lean: -1, boost: false, slam: false });
  for (const code of ['KeyS', 'ArrowDown']) {
    keyboard.reset(); keyboard.key(code, true);
    assert.equal(keyboard.sample().slam, true);
    keyboard.reset(); assert.equal(keyboard.sample().slam, false);
  }
});

test('slam adds only downward force and stops when released', () => {
  const normal = newBike(BIKES[0], { y: -600, terrain: flat });
  const slammed = newBike(BIKES[0], { y: -600, terrain: flat });
  const before = velocity(slammed);
  run(normal, 0.25); run(slammed, 0.25, 0, true);
  assert.ok(slammed.slamming && slammed.y > normal.y+40);
  assert.ok(Math.abs(velocity(slammed).x-before.x) < 1e-8);
  assert.ok(Math.abs(velocity(slammed).y-before.y-GRAVITY*3.8*0.25) < 1e-8);
  const vy = velocity(slammed).y;
  stepBike(slammed, 0, false, false);
  assert.equal(slammed.slamming, false);
  assert.ok(Math.abs(velocity(slammed).y-vy-GRAVITY*FIXED_DT) < 1e-8);
});

test('holding both controls on the ground neither launches nor farms overboost', () => {
  const normal = newBike(BIKES[0], { terrain: flat });
  const slammed = newBike(BIKES[0], { terrain: flat });
  run(normal, 1); run(slammed, 1);
  run(normal, 2); run(slammed, 2, 0, true);
  assert.deepEqual([slammed.x, slammed.y, slammed.vy], [normal.x, normal.y, normal.vy]);
  assert.equal(slammed.overboost, 0);
  assert.equal(slammed.slamming, false);
});

test('a surviving slam landing earns overboost once, an upside-down slam earns none', () => {
  const b = newBike(BIKES[0], { terrain: flat, y: 200 });
  let earned = 0;
  for (let i = 0; i < 240 && !b.dead; i++) earned += stepBike(b, 0, false, true).overboostEarned;
  assert.equal(b.dead, false);
  assert.equal(earned, 1.5);
  const crash = newBike(BIKES[0], { terrain: flat, y: 200, angle: Math.PI });
  let crashReward = 0;
  for (let i = 0; i < 240 && !crash.dead; i++) crashReward += stepBike(crash, 0, false, true).overboostEarned;
  assert.ok(crash.dead);
  assert.equal(crashReward, 0);
});

test('coins are sparse, worth one, and have no wide pickup magnet', () => {
  assert.equal(COIN_VALUE, 1);
  assert.ok(COIN_SPACING >= 1500);
  const positions = Array.from({ length: 10 }, (_, i) => coinPosition(i));
  assert.ok(positions.filter(p => p.x < 5000).length <= 3);
  for (let i = 1; i < positions.length; i++) assert.ok(positions[i].x-positions[i-1].x > 1000);
  const p = positions[0];
  const b = newBike(BIKES[0], { x: p.x+65, y: p.y, vx: 0, terrain: () => 2000 });
  assert.equal(stepBike(b, 0, false).coin, 0);
});

test('a sustained physical wheelie earns overboost without printing coins', () => {
  const b = newBike(BIKES[0], { terrain: flat });
  let earned = 0;
  for (let i = 0; i < 360 && !b.dead; i++) {
    // Test driver balances using torque input; production never selects an angle.
    const lean = Math.max(-1, Math.min(1, (-0.6-b.angle)*3-b.av));
    const result = stepBike(b, lean, false);
    if (result.stunt === 'wheelie') earned += result.overboostEarned;
  }
  assert.equal(b.dead, false);
  assert.ok(earned >= 1.25 && b.overboost > 0);
  assert.equal(b.totalCoins, b.collected.size);
});
