// morph-core.ts — Morph Icons engine, reference implementation.
// -----------------------------------------------------------------------------
// Zero dependencies. Used as-is by the React and React Native components, and
// ported line-for-line to Swift, Kotlin and Dart. Any behavior change here
// must be mirrored in those ports and re-checked with the conformance
// fixtures (`node scripts/build.mjs`, then each port's conformance test).
//
// Model
//   - Every icon is exactly 3 lines in a square viewBox (24 by default).
//   - In the JSON a line is [x1, y1, x2, y2], or `null` for an unused line:
//     null becomes a zero-length point at the center with opacity 0.
//   - Icons that are the same shape at different angles share a `group`
//     (a 3-line template) and only differ by `rotation` (degrees, clockwise).
//
// Transition rules
//   1. Same group  -> rotate the template, shortest way round (never more
//      than 180°). The coordinates don't move.
//   2. Otherwise   -> resolve both icons to absolute coordinates, then pick
//      which line goes where: an `overrides` entry if a designer forced one,
//      else the automatic least-travel matching (6 orders x 8 endpoint flips).
//      Then interpolate the coordinates and opacity linearly.
//   All progress goes through easeInOutCubic, identically on every platform.
// -----------------------------------------------------------------------------

export type RawLine = [number, number, number, number] | null;

export interface IconDef {
  lines?: RawLine[];
  group?: string;
  rotation?: number;
}

export interface Override {
  /** map[k] = index (0-2) of the target line that source line k morphs into. */
  map: number[];
  /** flip[k] = true to connect source k's start to the target line's end. */
  flip: boolean[];
}

export interface MorphData {
  version: number;
  viewBox: number;
  strokeWidth: number;
  duration: number;
  groups: Record<string, RawLine[]>;
  icons: Record<string, IconDef>;
  /** Key "from>to". Also used in reverse (inverted) for "to>from". */
  overrides?: Record<string, Override>;
}

/** One rendered line. `o` = opacity (0-1). */
export interface Seg {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  o: number;
}

export type Lines = [Seg, Seg, Seg];

/**
 * What is on screen. If `group` is set, `lines` is the group's template (local
 * coordinates) and `rotation` applies to it. Otherwise `lines` are absolute
 * and `rotation` is 0. `name` is set only at rest on a known icon.
 */
export interface State {
  name: string | null;
  group: string | null;
  lines: Lines;
  rotation: number;
}

export type Plan =
  | { kind: 'none'; end: State }
  | { kind: 'rotate'; lines: Lines; from: number; to: number; end: State }
  | {
      kind: 'morph';
      from: Lines;
      to: Lines;
      map: number[];
      flip: boolean[];
      source: 'auto' | 'override';
      end: State;
    };

/** What to draw: the 3 lines, rotated by `rotation` degrees around the center. */
export interface Frame {
  lines: Lines;
  rotation: number;
}

// ---- Constants shared by every port -----------------------------------------

/** Matching tolerance: a candidate replaces the current best only if it is
 *  cheaper by more than this. Keeps float-level near-ties deterministic. */
export const MATCH_EPSILON = 1e-6;

/** Nudge applied to a visible zero-length line (a "dot") so every renderer
 *  draws its round cap. */
export const DOT_NUDGE = 0.01;

/** Enumeration order matters (ties go to the first candidate). Same order in every port. */
export const PERMUTATIONS: ReadonlyArray<readonly [number, number, number]> = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
];

// ---- Easing ---------------------------------------------------------------------

export function ease(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ---- Data -> lines -----------------------------------------------------------

export function toSeg(raw: RawLine, center: number): Seg {
  if (raw === null) return { x1: center, y1: center, x2: center, y2: center, o: 0 };
  const [x1, y1, x2, y2] = raw;
  if (x1 === x2 && y1 === y2) return { x1, y1, x2: x2 + DOT_NUDGE, y2, o: 1 };
  return { x1, y1, x2, y2, o: 1 };
}

function toLines(raw: RawLine[], center: number): Lines {
  return [toSeg(raw[0], center), toSeg(raw[1], center), toSeg(raw[2], center)];
}

export function bake(lines: Lines, rotation: number, center: number): Lines {
  if (rotation === 0) return [{ ...lines[0] }, { ...lines[1] }, { ...lines[2] }];
  const r = (rotation * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const rot = (s: Seg): Seg => {
    const dx1 = s.x1 - center;
    const dy1 = s.y1 - center;
    const dx2 = s.x2 - center;
    const dy2 = s.y2 - center;
    return {
      x1: center + dx1 * cos - dy1 * sin,
      y1: center + dx1 * sin + dy1 * cos,
      x2: center + dx2 * cos - dy2 * sin,
      y2: center + dx2 * sin + dy2 * cos,
      o: s.o,
    };
  };
  return [rot(lines[0]), rot(lines[1]), rot(lines[2])];
}

/** The resting state of an icon (what `set(name)` displays). */
export function restState(data: MorphData, name: string): State {
  const def = data.icons[name];
  if (!def) throw new Error(`Unknown icon "${name}"`);
  const center = data.viewBox / 2;
  const rotation = def.rotation ?? 0;
  if (def.group) {
    const tpl = data.groups[def.group];
    if (!tpl) throw new Error(`Icon "${name}": unknown group "${def.group}"`);
    return { name, group: def.group, lines: toLines(tpl, center), rotation };
  }
  if (!def.lines) throw new Error(`Icon "${name}": needs "lines" or "group"`);
  return { name, group: null, lines: bake(toLines(def.lines, center), rotation, center), rotation: 0 };
}

export function frameOf(state: State): Frame {
  return { lines: state.lines, rotation: state.rotation };
}

// ---- Rotation ---------------------------------------------------------------------

/** Signed delta in [-180, 180) to go from `from` to `to` the short way. */
export function shortestDelta(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

// ---- Line matching -----------------------------------------------------------------

function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy); // not Math.hypot: identical to the other ports
}

/** Least-travel correspondence between the lines of `a` and `b` (absolute coordinates). */
export function match(a: Lines, b: Lines): Override & { cost: number } {
  let best = Infinity;
  let bestPerm = PERMUTATIONS[0];
  let bestMask = 0;
  for (const perm of PERMUTATIONS) {
    for (let mask = 0; mask < 8; mask++) {
      let cost = 0;
      for (let k = 0; k < 3; k++) {
        const s = a[k];
        const t = b[perm[k]];
        if ((mask >> k) & 1) cost += dist(s.x1, s.y1, t.x2, t.y2) + dist(s.x2, s.y2, t.x1, t.y1);
        else cost += dist(s.x1, s.y1, t.x1, t.y1) + dist(s.x2, s.y2, t.x2, t.y2);
      }
      if (cost < best - MATCH_EPSILON) {
        best = cost;
        bestPerm = perm;
        bestMask = mask;
      }
    }
  }
  return {
    map: [bestPerm[0], bestPerm[1], bestPerm[2]],
    flip: [(bestMask & 1) !== 0, (bestMask & 2) !== 0, (bestMask & 4) !== 0],
    cost: best,
  };
}

/** Forced matching for from>to, or the inverse of to>from. null if none. */
export function overrideFor(data: MorphData, from: string, to: string): Override | null {
  const ov = data.overrides;
  if (!ov) return null;
  const direct = ov[`${from}>${to}`];
  if (direct) return { map: [...direct.map], flip: [...direct.flip] };
  const rev = ov[`${to}>${from}`];
  if (!rev) return null;
  const map = [0, 0, 0];
  const flip = [false, false, false];
  for (let k = 0; k < 3; k++) {
    map[rev.map[k]] = k;
    flip[rev.map[k]] = rev.flip[k];
  }
  return { map, flip };
}

function arrange(b: Lines, map: number[], flip: boolean[]): Lines {
  const pick = (k: number): Seg => {
    const s = b[map[k]];
    return flip[k] ? { x1: s.x2, y1: s.y2, x2: s.x1, y2: s.y1, o: s.o } : { ...s };
  };
  return [pick(0), pick(1), pick(2)];
}

// ---- Planning & sampling --------------------------------------------------------

/** Describes the transition from what's on screen (`from`) to icon `to`. */
export function plan(data: MorphData, from: State, to: string): Plan {
  const end = restState(data, to);
  if (from.name === to) return { kind: 'none', end };

  if (from.group !== null && from.group === end.group) {
    return {
      kind: 'rotate',
      lines: from.lines,
      from: from.rotation,
      to: from.rotation + shortestDelta(from.rotation, end.rotation),
      end,
    };
  }

  const center = data.viewBox / 2;
  const a = from.group !== null ? bake(from.lines, from.rotation, center) : from.lines;
  const b = end.group !== null ? bake(end.lines, end.rotation, center) : end.lines;
  const forced = from.name !== null ? overrideFor(data, from.name, to) : null;
  const m = forced ?? match(a, b);
  return {
    kind: 'morph',
    from: a,
    to: arrange(b, m.map, m.flip),
    map: m.map,
    flip: m.flip,
    source: forced ? 'override' : 'auto',
    end,
  };
}

/** Frame to draw at linear progress t (0-1). Easing is applied here. */
export function frameAt(p: Plan, t: number): Frame {
  const e = ease(t);
  if (p.kind === 'none') return frameOf(p.end);
  if (p.kind === 'rotate') return { lines: p.lines, rotation: lerp(p.from, p.to, e) };
  const l = (k: number): Seg => {
    const s = p.from[k];
    const d = p.to[k];
    return {
      x1: lerp(s.x1, d.x1, e),
      y1: lerp(s.y1, d.y1, e),
      x2: lerp(s.x2, d.x2, e),
      y2: lerp(s.y2, d.y2, e),
      o: lerp(s.o, d.o, e),
    };
  };
  return { lines: [l(0), l(1), l(2)], rotation: 0 };
}

/** State at linear progress t: where to start from if interrupted at t. */
export function stateAt(p: Plan, t: number): State {
  if (t >= 1 || p.kind === 'none') return p.end;
  const f = frameAt(p, t);
  if (p.kind === 'rotate') return { name: null, group: p.end.group, lines: f.lines, rotation: f.rotation };
  return { name: null, group: null, lines: f.lines, rotation: 0 };
}

// ---- Validation (editor, tests) ----------------------------------------------------

export function validate(data: MorphData): string[] {
  const errors: string[] = [];
  const checkLines = (where: string, lines: unknown) => {
    if (!Array.isArray(lines) || lines.length !== 3) {
      errors.push(`${where}: exactly 3 lines expected`);
      return;
    }
    lines.forEach((l, i) => {
      if (l === null) return;
      if (!Array.isArray(l) || l.length !== 4 || !l.every((n) => typeof n === 'number' && Number.isFinite(n))) {
        errors.push(`${where}, line ${i + 1}: [x1, y1, x2, y2] or null expected`);
      }
    });
  };
  for (const [g, lines] of Object.entries(data.groups ?? {})) checkLines(`Group "${g}"`, lines);
  for (const [name, def] of Object.entries(data.icons ?? {})) {
    if (def.group !== undefined) {
      if (def.lines !== undefined) errors.push(`Icon "${name}": "lines" and "group" are mutually exclusive`);
      if (!data.groups?.[def.group]) errors.push(`Icon "${name}": unknown group "${def.group}"`);
    } else {
      checkLines(`Icon "${name}"`, def.lines);
    }
    if (def.rotation !== undefined && !Number.isFinite(def.rotation)) {
      errors.push(`Icon "${name}": invalid rotation`);
    }
  }
  for (const [key, ov] of Object.entries(data.overrides ?? {})) {
    const [from, to, extra] = key.split('>');
    if (!from || !to || extra !== undefined) errors.push(`Override "${key}": key must be "from>to"`);
    else if (!data.icons[from] || !data.icons[to]) errors.push(`Override "${key}": unknown icon`);
    const okMap = Array.isArray(ov.map) && ov.map.length === 3 && [0, 1, 2].every((i) => ov.map.includes(i));
    if (!okMap) errors.push(`Override "${key}": "map" must be a permutation of [0, 1, 2]`);
    if (!Array.isArray(ov.flip) || ov.flip.length !== 3 || !ov.flip.every((f) => typeof f === 'boolean')) {
      errors.push(`Override "${key}": "flip" must be 3 booleans`);
    }
  }
  return errors;
}

// ---- JS animation driver (React / React Native / web page) -----------------------

/** performance.now() where available (browsers, React Native), else Date.now().
 *  Read through globalThis so it type-checks without the DOM lib (RN tsconfig). */
function defaultNow(): number {
  const perf = (globalThis as { performance?: { now(): number } }).performance;
  return perf ? perf.now() : Date.now();
}

export interface DriverOptions {
  now?: () => number;
  requestFrame?: (cb: (time: number) => void) => number;
  cancelFrame?: (id: number) => void;
}

/**
 * Drives the transitions in JS: call `go(name)`, it calls `onFrame` each frame.
 * Interruptible: a `go()` mid-transition restarts from the on-screen state.
 */
export class MorphDriver {
  private data: MorphData;
  private onFrame: (frame: Frame) => void;
  private now: () => number;
  private requestFrame: (cb: (time: number) => void) => number;
  private cancelFrame: (id: number) => void;
  private state: State;
  private current: Plan | null = null;
  private start = 0;
  private duration = 0;
  private frameId: number | null = null;

  constructor(data: MorphData, initial: string, onFrame: (frame: Frame) => void, options: DriverOptions = {}) {
    this.data = data;
    this.onFrame = onFrame;
    this.now = options.now ?? defaultNow;
    this.requestFrame = options.requestFrame ?? ((cb) => requestAnimationFrame(cb));
    this.cancelFrame = options.cancelFrame ?? ((id) => cancelAnimationFrame(id));
    this.state = restState(data, initial);
    this.onFrame(frameOf(this.state));
  }

  /** Swap the data (e.g. a new JSON version) without animating. */
  setData(data: MorphData): void {
    this.data = data;
    const name = this.target();
    this.stop();
    if (name !== null && data.icons[name]) this.set(name);
  }

  /** Icon currently shown, or being animated to. */
  target(): string | null {
    return this.current ? this.current.end.name : this.state.name;
  }

  /** Jump to an icon with no animation. */
  set(name: string): void {
    this.stop();
    this.state = restState(this.data, name);
    this.onFrame(frameOf(this.state));
  }

  /** Animate to an icon. duration in ms (defaults to the JSON's); 0 = instant. */
  go(name: string, duration: number = this.data.duration): void {
    if (name === this.target()) return;
    const from = this.liveState();
    this.stop();
    if (duration <= 0) {
      this.set(name);
      return;
    }
    this.current = plan(this.data, from, name);
    this.start = this.now();
    this.duration = duration;
    const tick = () => {
      if (!this.current) return;
      const t = Math.min(1, (this.now() - this.start) / this.duration);
      this.onFrame(frameAt(this.current, t));
      if (t < 1) {
        this.frameId = this.requestFrame(tick);
      } else {
        this.state = this.current.end;
        this.current = null;
        this.frameId = null;
      }
    };
    this.frameId = this.requestFrame(tick);
  }

  dispose(): void {
    this.stop();
  }

  private liveState(): State {
    if (!this.current) return this.state;
    const t = Math.min(1, (this.now() - this.start) / this.duration);
    return stateAt(this.current, t);
  }

  private stop(): void {
    if (this.frameId !== null) this.cancelFrame(this.frameId);
    this.frameId = null;
    if (this.current) {
      this.state = this.liveState();
      this.current = null;
    }
  }
}
