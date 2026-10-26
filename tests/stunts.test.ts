import test from 'node:test';
import assert from 'node:assert/strict';
import { BIG_AIR_HEIGHT, BIG_AIR_SECONDS, StuntTracker, type StuntFrame } from '../src/stunts';

const dt = 1/120;
function sample(angle: number, changes: Partial<StuntFrame> = {}): StuntFrame {
  return { angle, av: 0, airborne: true, bothGrounded: false, wheelie: null,
    clearance: 50, slamming: false, dead: false, ...changes };
}
function rotate(tracker: StuntTracker, from: number, to: number) {
  let boost = 0, callout: string | null = null;
  for (let i=1; i<=120; i++) {
    const result = tracker.update(sample(from+(to-from)*i/120), dt);
    boost += result.boostEarned;
    if (result.callout) callout = result.callout;
  }
  return { boost, callout };
}

test('front flip x4 appears live, fills boost per flip, and banks the full landing combo once', () => {
  const tracker = new StuntTracker(0);
  const result = rotate(tracker, 0, 8*Math.PI);
  assert.equal(result.callout, 'FRONT FLIP x4');
  assert.equal(result.boost, 4*18);
  let earned = 0, flips = 0;
  for (let i=0; i<30; i++) {
    const landing = tracker.update(sample(8*Math.PI, { airborne: false, bothGrounded: true }), dt);
    earned += landing.overboostEarned; flips += landing.flip;
  }
  assert.equal(earned, 10);
  assert.equal(flips, 4);
});

test('backflip x3 survives brief tire touches and a controlled one-wheel landing', () => {
  const tracker = new StuntTracker(0);
  rotate(tracker, 0, -2*Math.PI);
  for (let i=0; i<4; i++) tracker.update(sample(-2*Math.PI, { airborne: false }), dt);
  const result = rotate(tracker, -2*Math.PI, -6*Math.PI);
  assert.equal(result.callout, 'BACKFLIP x3');
  let flips = 0, earned = 0;
  for (let i=0; i<30; i++) {
    const landing = tracker.update(sample(-6*Math.PI, { airborne: false, av: 0.5 }), dt);
    flips += landing.flip; earned += landing.overboostEarned;
  }
  assert.equal(flips, 3);
  assert.equal(earned, 7.5);
});

test('reversing half a turn does not score a fake flip; completed directions remain distinct', () => {
  const tracker = new StuntTracker(0);
  assert.equal(rotate(tracker, 0, Math.PI).boost, 0);
  assert.equal(rotate(tracker, Math.PI, 0).boost, 0);
  assert.equal(rotate(tracker, 0, -2*Math.PI).callout, 'BACKFLIP x1');
  assert.equal(rotate(tracker, -2*Math.PI, 0).callout, 'FRONT FLIP x1 · BACKFLIP x1');
});

test('Big Air requires both sustained flight and real clearance, with a cooldown', () => {
  const tracker = new StuntTracker(0);
  let calls = 0;
  for (let i=0; i<240; i++) if (tracker.update(sample(0, { clearance: 30 }), dt).stunt === 'air') calls++;
  assert.equal(calls, 0, 'ordinary low flights do not earn Big Air');
  const high = new StuntTracker(0);
  for (let i=0; i<Math.ceil(BIG_AIR_SECONDS/dt)-2; i++)
    assert.equal(high.update(sample(0, { clearance: BIG_AIR_HEIGHT+20 }), dt).stunt, null);
  for (let i=0; i<120; i++) if (high.update(sample(0, { clearance: BIG_AIR_HEIGHT+20 }), dt).stunt === 'air') calls++;
  assert.equal(calls, 1);
  for (let i=0; i<30; i++) high.update(sample(0, { airborne: false, bothGrounded: true }), dt);
  for (let i=0; i<240; i++) if (high.update(sample(0, { clearance: BIG_AIR_HEIGHT+20 }), dt).stunt === 'air') calls++;
  assert.equal(calls, 1, 'a second ordinary hill cannot immediately repeat Big Air');
});

test('wheelie multipliers update during a sustained hold, and a crash cannot bank pending flips', () => {
  const tracker = new StuntTracker(0);
  let label: string | null = null;
  for (let i=0; i<210; i++) {
    const event = tracker.update(sample(-0.5, { airborne: false, wheelie: 'wheelie' }), dt);
    if (event.callout) label = event.callout;
  }
  assert.equal(label, 'WHEELIE x2');
  const crash = new StuntTracker(0);
  rotate(crash, 0, -2*Math.PI);
  assert.equal(crash.update(sample(-2*Math.PI, { dead: true }), dt).overboostEarned, 0);
});
