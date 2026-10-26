import test from 'node:test';
import assert from 'node:assert/strict';
import { RideControls } from '../src/controls';
import { BIKES, FIXED_DT, newBike, stepBike } from '../src/physics';

test('desktop keys and touch holds produce identical physics, including combined boost', () => {
  for (const [code, action] of [['KeyA', 'back'], ['ArrowLeft', 'back'], ['KeyD', 'forward'], ['ArrowRight', 'forward']] as const) {
    const keyboard = new RideControls(), touch = new RideControls();
    keyboard.key(code, true); keyboard.key('KeyW', true);
    touch.pointer(action, 1, true); touch.pointer('boost', 2, true);
    assert.deepEqual(keyboard.sample(), touch.sample());
    for (const spec of BIKES) {
      const a = newBike(spec), b = newBike(spec);
      for (let i = 0; i < 40; i++) {
        const k = keyboard.sample(), t = touch.sample();
        stepBike(a, k.lean, k.boost); stepBike(b, t.lean, t.boost);
      }
      assert.deepEqual([a.x, a.y, a.angle, a.boost, a.dead], [b.x, b.y, b.angle, b.boost, b.dead]);
    }
  }
});

test('multi-touch release, cancellation and pause reset cannot leave stuck inputs', () => {
  const c = new RideControls();
  c.pointer('back', 1, true); c.pointer('back', 2, true); c.pointer('boost', 3, true);
  c.pointer('back', 1, false);
  assert.deepEqual(c.sample(), { lean: -1, boost: true });
  c.pointer('forward', 4, true);
  assert.deepEqual(c.sample(), { lean: 0, boost: true });
  c.reset();
  c.pointer('forward', 4, false);
  assert.deepEqual(c.sample(), { lean: 0, boost: false });
  c.pointer('back', 5, true); c.pointer('back', 5, false);
  assert.equal(c.sample().lean, 0);
  for (const key of ['Space', 'KeyW', 'ArrowUp']) {
    c.key(key, true); assert.ok(c.sample().boost);
    c.key(key, false); assert.equal(c.sample().boost, false);
  }
});

test('30, 60 and 120 FPS deliver the same fixed-step physics and input', () => {
  const results = [30, 60, 120].map(fps => {
    const b = newBike(BIKES[0], { terrain: () => 530 });
    let accumulator = 0;
    for (let frame = 0; frame < fps*3; frame++) {
      accumulator += 1/fps;
      while (accumulator >= FIXED_DT) { stepBike(b, 0, false); accumulator -= FIXED_DT; }
    }
    return [b.x, b.y, b.angle, b.boost];
  });
  assert.deepEqual(results[0], results[1]);
  assert.deepEqual(results[1], results[2]);
});
