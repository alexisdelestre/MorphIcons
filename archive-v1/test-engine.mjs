// test-engine.mjs — headless correctness check for engine.js, driven by a
// manually-stepped fake clock (the real browser tab in this sandbox reports
// document.hidden === true, which throttles rAF/setTimeout to ~1/sec and
// makes visual mid-animation inspection unreliable — so we verify the math
// directly here instead).
import assert from 'node:assert/strict';
import { ICONS, bake } from './icons.js';
import { MorphController } from './engine.js';

// ---- fake clock + rAF -------------------------------------------------------
let now = 0;
let pending = null;
globalThis.performance = { now: () => now };
globalThis.requestAnimationFrame = (cb) => { pending = cb; return 1; };
globalThis.cancelAnimationFrame = () => { pending = null; };
globalThis.window = undefined; // exercise the "no matchMedia" branch too

function tick(dt) {
  now += dt;
  const cb = pending;
  pending = null;
  if (cb) cb(now);
}

// ---- 1) rotation-group path: plus -> cross should ONLY rotate -------------
{
  let frames = [];
  const c = new MorphController((lines, rotation) => frames.push({ lines, rotation }));
  c.set('plus');
  now = 0;
  c.morphTo('cross', { duration: 1000 });
  tick(500); // halfway
  const mid = frames.at(-1);
  assert.equal(mid.lines, ICONS.plus.lines, 'lines must stay the exact shared template (identity), not a copy');
  assert.ok(Math.abs(mid.rotation - 22.5) < 0.5, `expected ~22.5deg at t=0.5, got ${mid.rotation}`);

  tick(500); // finish
  const end = frames.at(-1);
  assert.ok(Math.abs(end.rotation - 45) < 1e-6, 'should land exactly on 45deg');
  console.log('OK  plus -> cross rotates only (mid=%s deg, end=%s deg)', mid.rotation.toFixed(2), end.rotation);
}

// ---- 2) rotation-group path covers all 4 arrow members, both directions --
{
  const seq = ['arrow-right', 'arrow-down', 'arrow-left', 'arrow-up', 'arrow-right'];
  const c = new MorphController(() => {});
  c.set(seq[0]);
  for (let i = 1; i < seq.length; i++) {
    now = 0;
    const p = c.morphTo(seq[i], { duration: 200 });
    tick(200);
    assert.equal(c._live.groupId, 'arrow');
    assert.equal(c._live.lines, ICONS['arrow-right'].lines, 'arrow group must never touch coordinates');
  }
  console.log('OK  arrow-right -> down -> left -> up -> right stays on shared template throughout');
}

// ---- 3) cross-group coordinate morph: no NaN / no wild overshoot ----------
{
  let frames = [];
  const c = new MorphController((lines, rotation) => frames.push({ lines: lines.map(l => ({ ...l })), rotation }));
  c.set('menu');
  now = 0;
  c.morphTo('play', { duration: 1000 });
  for (let i = 0; i < 10; i++) tick(100);
  for (const f of frames) {
    assert.equal(f.rotation, 0, 'standalone/cross-group morph should not introduce rotation');
    for (const l of f.lines) {
      for (const k of ['x1', 'y1', 'x2', 'y2']) {
        assert.ok(Number.isFinite(l[k]), `${k} is not finite`);
        assert.ok(l[k] >= -1 && l[k] <= 25, `${k}=${l[k]} is way outside the 0..24 viewBox (bad morph)`);
      }
      assert.ok(l.opacity >= 0 && l.opacity <= 1);
    }
  }
  const end = frames.at(-1);
  const target = bake(ICONS.play);
  end.lines.forEach((l, i) => {
    ['x1', 'y1', 'x2', 'y2'].forEach((k) => assert.ok(Math.abs(l[k] - target[i][k]) < 1e-6));
  });
  console.log('OK  menu -> play coordinate-morphs cleanly and lands exactly on target');
}

// ---- 4) collapse family: plus -> minus -> equals stays coherent -----------
{
  const c = new MorphController(() => {});
  c.set('plus');
  now = 0;
  c.morphTo('minus', { duration: 100 });
  tick(100);
  let baked = c._live.lines;
  // vertical arm collapsed to the center point, horizontal bar untouched
  assert.deepEqual([baked[0].x1, baked[0].y1, baked[0].x2, baked[0].y2], [12, 12, 12, 12]);
  assert.equal(baked[0].opacity, 0);
  assert.deepEqual([baked[1].x1, baked[1].y1, baked[1].x2, baked[1].y2], [4, 12, 20, 12]);

  now = 0;
  c.morphTo('equals', { duration: 100 });
  tick(100);
  baked = c._live.lines;
  assert.deepEqual([baked[0].x1, baked[0].y1, baked[0].x2, baked[0].y2], [4, 9, 20, 9]);
  assert.deepEqual([baked[1].x1, baked[1].y1, baked[1].x2, baked[1].y2], [4, 15, 20, 15]);
  console.log('OK  plus -> minus -> equals: bars collapse/grow from the correct points');
}

// ---- 5) interrupting mid-animation continues from the live point, not a jump
{
  let frames = [];
  const c = new MorphController((lines, rotation) => frames.push({ lines: lines.map(l => ({ ...l })), rotation }));
  c.set('menu');
  now = 0;
  c.morphTo('play', { duration: 1000 });
  tick(500); // halfway to play
  const midway = frames.at(-1).lines.map((l) => ({ ...l }));

  now = 0;
  c.morphTo('pause', { duration: 1000 }); // interrupt!
  tick(0); // first frame of the new animation, t=0
  const justAfterInterrupt = frames.at(-1).lines;
  justAfterInterrupt.forEach((l, i) => {
    ['x1', 'y1', 'x2', 'y2'].forEach((k) =>
      assert.ok(Math.abs(l[k] - midway[i][k]) < 1e-6, `interrupt should start exactly where the visible line was (${k})`)
    );
  });
  console.log('OK  interrupting a morph mid-flight starts from the live coordinates, no snap/jump');
}

// ---- 6) every icon has exactly 3 lines, and every collapsed line is a true
//         zero-length point at the exact center with opacity 0 ---------------
{
  for (const [name, icon] of Object.entries(ICONS)) {
    assert.equal(icon.lines.length, 3, `${name} must have exactly 3 lines`);
    for (const l of icon.lines) {
      const len = Math.hypot(l.x2 - l.x1, l.y2 - l.y1);
      if (l.opacity === 0) {
        assert.ok(len < 1e-9, `${name}: a collapsed (opacity 0) line must be zero-length, got length ${len}`);
        assert.equal(l.x1, 12);
        assert.equal(l.y1, 12);
      }
    }
  }
  console.log('OK  all 21 icons have exactly 3 lines; every collapsed line is a true center point');
}

// ---- 7) rotation-group templates: all members reference the identical array
{
  const groups = {};
  for (const [name, icon] of Object.entries(ICONS)) {
    if (!icon.group) continue;
    (groups[icon.group] ??= []).push([name, icon.lines]);
  }
  for (const [group, members] of Object.entries(groups)) {
    const [, first] = members[0];
    for (const [name, lines] of members) {
      assert.equal(lines, first, `${name} (group ${group}) must share the exact same lines array reference`);
    }
  }
  assert.equal(Object.keys(groups).length, 4, 'expected 4 rotation groups (arrow, chevron, plusCross, updown)');
  console.log('OK  rotation groups: arrow(4) chevron(4) plusCross(2) updown(2) all share one template each');
}

// ---- 8) regression: arrow-right -> chevron-right keeps top parts on top and
//         bottom parts on bottom throughout — this used to swap (reported bug)
{
  let frames = [];
  const c = new MorphController((lines, rotation) => frames.push({ lines: lines.map(l => ({ ...l })), rotation }));
  c.set('arrow-right');
  now = 0;
  c.morphTo('chevron-right', { duration: 1000 });
  for (let i = 0; i < 10; i++) {
    tick(100);
    const [, upArm, downArm] = frames.at(-1).lines;
    assert.ok(upArm.y2 < 12, `up arm (index1) end must stay above center the whole time, got y2=${upArm.y2} at t=${i}`);
    assert.ok(downArm.y2 > 12, `down arm (index2) end must stay below center the whole time, got y2=${downArm.y2} at t=${i}`);
  }
  console.log('OK  arrow-right -> chevron-right: up arm stays up, down arm stays down (no top/bottom swap)');
}

console.log('\nAll engine checks passed.');
