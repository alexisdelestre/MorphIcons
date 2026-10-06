// tests/core.test.ts — reference engine tests.
// Run: npm test   (or: node --experimental-strip-types --test tests/core.test.ts)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  bake,
  ease,
  frameAt,
  match,
  MorphDriver,
  overrideFor,
  plan,
  restState,
  shortestDelta,
  stateAt,
  validate,
  type Frame,
  type Lines,
  type MorphData,
} from '../core/morph-core.ts';

const data: MorphData = JSON.parse(readFileSync(new URL('../morph-icons.json', import.meta.url), 'utf8'));
const names = Object.keys(data.icons);
const C = data.viewBox / 2;
const pairs = names.flatMap((a) => names.filter((b) => b !== a).map((b) => [a, b] as const));

const absolute = (name: string): Lines => {
  const s = restState(data, name);
  return s.group ? bake(s.lines, s.rotation, C) : s.lines;
};
const close = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) <= tol;

test('morph-icons.json is valid and every icon has exactly 3 lines', () => {
  assert.deepEqual(validate(data), []);
  for (const n of names) assert.equal(restState(data, n).lines.length, 3, n);
});

test('a null line is an invisible point at the center', () => {
  const minus = restState(data, 'minus');
  for (const k of [0, 2]) {
    assert.deepEqual(minus.lines[k], { x1: C, y1: C, x2: C, y2: C, o: 0 });
  }
});

test('a visible zero-length line (dot) is nudged so the round cap gets drawn', () => {
  for (const s of restState(data, 'more').lines) {
    assert.equal(s.o, 1);
    assert.ok(close(Math.hypot(s.x2 - s.x1, s.y2 - s.y1), 0.01));
  }
});

test('same group: rotation only, coordinates never move', () => {
  for (const [a, b] of pairs) {
    const ga = data.icons[a].group;
    if (!ga || ga !== data.icons[b].group) continue;
    const p = plan(data, restState(data, a), b);
    assert.equal(p.kind, 'rotate', `${a} -> ${b}`);
    if (p.kind !== 'rotate') continue;
    for (const t of [0, 0.25, 0.5, 0.75, 1]) assert.equal(frameAt(p, t).lines, p.lines);
  }
});

test('rotations take the short way: never more than 180°', () => {
  const p = plan(data, restState(data, 'arrow-up'), 'arrow-right');
  assert.equal(p.kind, 'rotate');
  if (p.kind === 'rotate') assert.equal(p.to - p.from, 90, 'arrow-up -> arrow-right = +90°, not -270°');
  for (const [a, b] of pairs) {
    const q = plan(data, restState(data, a), b);
    if (q.kind === 'rotate') assert.ok(Math.abs(q.to - q.from) <= 180, `${a} -> ${b}`);
  }
  assert.equal(shortestDelta(270, 0), 90);
  assert.equal(shortestDelta(0, 270), -90);
  assert.equal(shortestDelta(315, 90), 135);
});

test('different groups: coordinate morph, starts and ends exactly on the icons', () => {
  for (const [a, b] of pairs) {
    const p = plan(data, restState(data, a), b);
    if (p.kind !== 'morph') continue;
    const start = frameAt(p, 0);
    const end = frameAt(p, 1);
    const A = absolute(a);
    start.lines.forEach((s, k) => {
      for (const key of ['x1', 'y1', 'x2', 'y2', 'o'] as const) assert.ok(close(s[key], A[k][key]), `${a}->${b} start`);
    });
    // The end is the target's lines, in the matched order and direction.
    const B = absolute(b);
    end.lines.forEach((s, k) => {
      const t = B[p.map[k]];
      const [x1, y1, x2, y2] = p.flip[k] ? [t.x2, t.y2, t.x1, t.y1] : [t.x1, t.y1, t.x2, t.y2];
      assert.ok(close(s.x1, x1) && close(s.y1, y1) && close(s.x2, x2) && close(s.y2, y2), `${a}->${b} end`);
      assert.equal(s.o, t.o);
    });
    assert.equal(end.rotation, 0);
  }
});

test('no frame ever produces NaN or leaves the viewBox', () => {
  for (const [a, b] of pairs) {
    const p = plan(data, restState(data, a), b);
    for (let i = 0; i <= 20; i++) {
      const f = frameAt(p, i / 20);
      assert.ok(Number.isFinite(f.rotation));
      for (const s of f.lines) {
        for (const v of [s.x1, s.y1, s.x2, s.y2]) assert.ok(Number.isFinite(v) && v >= -1 && v <= data.viewBox + 1, `${a}->${b}`);
        assert.ok(s.o >= 0 && s.o <= 1);
      }
    }
  }
});

test('automatic matching never travels more than keeping the declared order', () => {
  for (const [a, b] of pairs) {
    const A = absolute(a);
    const B = absolute(b);
    const m = match(A, B);
    let identity = 0;
    for (let k = 0; k < 3; k++) {
      identity += Math.hypot(A[k].x1 - B[k].x1, A[k].y1 - B[k].y1) + Math.hypot(A[k].x2 - B[k].x2, A[k].y2 - B[k].y2);
    }
    assert.ok(m.cost <= identity + 1e-9, `${a} -> ${b}`);
  }
});

test('regression: arrow-right -> chevron-right keeps the top on top', () => {
  const p = plan(data, restState(data, 'arrow-right'), 'chevron-right');
  assert.equal(p.kind, 'morph');
  for (let i = 0; i <= 10; i++) {
    const f = frameAt(p, i / 10);
    // Find the lines that start as the top and bottom arms of the arrow.
    const up = f.lines[1];
    const down = f.lines[2];
    assert.ok(up.y2 < C && down.y2 > C, `t=${i / 10}: up y2=${up.y2}, down y2=${down.y2}`);
  }
});

test('automatic matching: menu -> equals collapses the middle bar, not the bottom one', () => {
  const p = plan(data, restState(data, 'menu'), 'equals');
  assert.equal(p.kind, 'morph');
  const end = frameAt(p, 1).lines;
  assert.equal(end[1].o, 0, 'middle bar (y=12) disappears');
  assert.equal(end[0].y1, 9);
  assert.equal(end[2].y1, 15);
});

test('overrides: used as given, and inverted for the reverse transition', () => {
  const d: MorphData = { ...data, overrides: { 'menu>check': { map: [2, 0, 1], flip: [false, true, false] } } };
  const p = plan(d, restState(d, 'menu'), 'check');
  assert.equal(p.kind, 'morph');
  if (p.kind === 'morph') {
    assert.equal(p.source, 'override');
    assert.deepEqual(p.map, [2, 0, 1]);
    assert.deepEqual(p.flip, [false, true, false]);
  }
  const inv = overrideFor(d, 'check', 'menu');
  assert.deepEqual(inv, { map: [1, 2, 0], flip: [true, false, false] });
  // Going there and back draws the same lines (time reversed).
  const back = plan(d, restState(d, 'check'), 'menu');
  if (p.kind === 'morph' && back.kind === 'morph') {
    const fwd = frameAt(p, 0.3).lines;
    const rev = frameAt(back, 0.7).lines;
    const key = (s: { x1: number; y1: number; x2: number; y2: number }) =>
      [s.x1, s.y1, s.x2, s.y2].map((v) => v.toFixed(6)).join(',');
    const keyAny = (s: { x1: number; y1: number; x2: number; y2: number }) =>
      [key(s), key({ x1: s.x2, y1: s.y2, x2: s.x1, y2: s.y1 })].sort()[0];
    assert.deepEqual(fwd.map(keyAny).sort(), rev.map(keyAny).sort());
  }
  // An interrupted transition (name = null) ignores overrides.
  const mid = stateAt(plan(d, restState(d, 'play'), 'menu'), 0.5);
  assert.equal((plan(d, mid, 'check') as { source?: string }).source, 'auto');
});

test('validate() catches broken data', () => {
  const bad = {
    ...data,
    groups: { ...data.groups, broken: [[0, 0, 1, 1], null] },
    icons: { ...data.icons, ghost: { group: 'nope' }, both: { group: 'arrow', lines: [null, null, null] } },
    overrides: { 'menu>check': { map: [0, 0, 1], flip: [true, false] }, 'nope': { map: [0, 1, 2], flip: [false, false, false] } },
  } as unknown as MorphData;
  const errors = validate(bad).join('\n');
  for (const needle of ['Group "broken"', 'Icon "ghost"', 'Icon "both"', 'permutation', '3 booleans', 'Override "nope"']) {
    assert.ok(errors.includes(needle), `missing error: ${needle}\n${errors}`);
  }
});

test('ease: fixed points and symmetry', () => {
  assert.equal(ease(0), 0);
  assert.equal(ease(1), 1);
  assert.equal(ease(0.5), 0.5);
  assert.ok(close(ease(0.25) + ease(0.75), 1));
});

// ---- Driver (fake clock) ----------------------------------------------------------

function fakeDriver(initial: string) {
  let now = 0;
  let pending: ((t: number) => void) | null = null;
  const frames: Frame[] = [];
  const driver = new MorphDriver(data, initial, (f) => frames.push(f), {
    now: () => now,
    requestFrame: (cb) => {
      pending = cb;
      return 1;
    },
    cancelFrame: () => {
      pending = null;
    },
  });
  const advance = (ms: number) => {
    now += ms;
    const cb = pending;
    pending = null;
    cb?.(now);
  };
  return { driver, frames, advance, idle: () => pending === null };
}

test('driver: animates, then stops requesting frames', () => {
  const { driver, frames, advance, idle } = fakeDriver('menu');
  driver.go('play', 400);
  assert.equal(driver.target(), 'play');
  for (let i = 0; i < 5; i++) advance(100);
  assert.ok(idle());
  const last = frames.at(-1)!;
  const end = frameAt(plan(data, restState(data, 'menu'), 'play'), 1);
  assert.deepEqual(last, end);
});

test('driver: interrupting resumes from the on-screen frame, no jump', () => {
  const { driver, frames, advance } = fakeDriver('menu');
  driver.go('play', 1000);
  advance(450);
  const before = frames.at(-1)!;
  driver.go('pause', 1000);
  advance(0);
  const after = frames.at(-1)!;
  after.lines.forEach((s, k) => {
    // Same lines as a set: the new transition may reorder the slots.
    const match = before.lines.some(
      (b) => (close(b.x1, s.x1, 1e-6) && close(b.y1, s.y1, 1e-6) && close(b.x2, s.x2, 1e-6) && close(b.y2, s.y2, 1e-6)) ||
        (close(b.x1, s.x2, 1e-6) && close(b.y1, s.y2, 1e-6) && close(b.x2, s.x1, 1e-6) && close(b.y2, s.y1, 1e-6)),
    );
    assert.ok(match, `line ${k} jumped`);
  });
});

test('driver: interrupting a rotation keeps rotating from the current angle', () => {
  const { driver, frames, advance } = fakeDriver('arrow-right');
  driver.go('arrow-down', 1000);
  advance(500); // eased halfway: 45°
  assert.ok(close(frames.at(-1)!.rotation, 45));
  driver.go('arrow-up', 1000);
  advance(0);
  assert.ok(close(frames.at(-1)!.rotation, 45));
  advance(1000);
  assert.ok(close(((frames.at(-1)!.rotation % 360) + 360) % 360, 270));
});

test('driver: duration 0 and repeated targets', () => {
  const { driver, frames, idle } = fakeDriver('menu');
  const count = frames.length;
  driver.go('menu');
  assert.equal(frames.length, count, 'already there: nothing happens');
  driver.go('cross', 0);
  assert.ok(idle());
  assert.equal(frames.at(-1)!.rotation, 45);
});

// ---- Fixtures: the reference must reproduce its own fixtures --------------------

test('conformance fixtures match this engine (the same check every port runs)', () => {
  const fx = JSON.parse(readFileSync(new URL('../conformance/fixtures.json', import.meta.url), 'utf8'));
  const tol: number = fx.tolerance;
  const sameFrame = (got: Frame, want: { rotation: number; lines: number[][] }, label: string) => {
    assert.ok(Math.abs(got.rotation - want.rotation) <= tol, `${label}: rotation`);
    got.lines.forEach((s, k) => {
      [s.x1, s.y1, s.x2, s.y2, s.o].forEach((v, i) => assert.ok(Math.abs(v - want.lines[k][i]) <= tol, `${label}: line ${k}`));
    });
  };
  for (const [t, e] of fx.ease) assert.ok(Math.abs(ease(t) - e) <= tol);
  for (const [a, b, d] of fx.shortestDelta) assert.ok(Math.abs(shortestDelta(a, b) - d) <= tol);
  for (const tr of fx.transitions) {
    const p = plan(fx.data, restState(fx.data, tr.from), tr.to);
    assert.equal(p.kind, tr.kind);
    if (p.kind === 'morph') {
      assert.deepEqual(p.map, tr.map);
      assert.deepEqual(p.flip, tr.flip);
      assert.equal(p.source, tr.source);
    }
    for (const f of tr.frames) sameFrame(frameAt(p, f.t), f, `${tr.from}->${tr.to}@${f.t}`);
  }
  for (const ch of fx.chains) {
    const mid = stateAt(plan(fx.data, restState(fx.data, ch.from), ch.via), ch.cut);
    const p = plan(fx.data, mid, ch.to);
    assert.equal(p.kind, ch.kind);
    for (const f of ch.frames) sameFrame(frameAt(p, f.t), f, `chain ${ch.from}>${ch.via}>${ch.to}`);
  }
});
