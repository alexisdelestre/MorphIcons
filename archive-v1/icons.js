// icons.js
// -----------------------------------------------------------------------------
// Icon data for the morphing icon set.
//
// THE RULE: every icon is exactly three lines, in a 24x24 box (center = 12,12),
// modeled after Phosphor's "regular" stroke weight (strokeWidth 2, round caps/
// joins, no fill). Icons that need fewer than three visible strokes collapse
// the extra line(s) down to a zero-length point at the center, with opacity 0,
// so they never flash a stray dot mid-morph:
//
//   { x1: 12, y1: 12, x2: 12, y2: 12, opacity: 0 }
//
// ROTATION GROUPS: some icons are the *same shape*, just turned — arrow-right/
// down/left/up, chevron-right/down/left/up, and plus/cross (a plus turned 45°
// is an X). Coordinate-morphing those makes the lines visibly bend and warp
// as they sweep round; rotating the shared shape instead is both cheaper and
// looks correct. Each of those icons stores the SAME `lines` array reference
// (the canonical, unrotated template) plus its own `rotation` in degrees.
// The morph engine (engine.js) checks `group` to decide whether to animate
// just the rotation (same group) or the raw coordinates (different groups /
// standalone icons).
//
// INDEX CORRESPONDENCE for coordinate morphs: when two icons DON'T share a
// group, the engine lerps line[i] of A straight into line[i] of B — so which
// physical stroke sits at which index matters as much as the coordinates
// themselves. Every "convergent" icon (the lines meet at one point: arrow,
// chevron, download/upload, check, play, external) follows the same layout:
//   index 0 = the stroke that DOESN'T touch the tip (shaft / base / collapsed)
//   index 1 = the arm from the tip going to its "left turn" side
//   index 2 = the arm from the tip going to its "right turn" side
// and every arm line is written tip-first (x1,y1 = the tip). That's what
// makes arrow-right -> chevron-right morph the top arm into the top arm and
// the bottom arm into the bottom arm, instead of one flipping to the other
// side. Verify with `node test-engine.mjs` after touching any of these.
// -----------------------------------------------------------------------------

export const SIZE = 24;
export const CENTER = 12;

function L(x1, y1, x2, y2, opacity = 1) {
  return { x1, y1, x2, y2, opacity };
}

// A fully collapsed, invisible line — the "extra" line for icons that only
// need one or two visible strokes.
const COLLAPSED = L(CENTER, CENTER, CENTER, CENTER, 0);

// ---- Shared templates for rotation groups ----------------------------------

// Canonical "arrow-right" (→), tip at (18,12). index0 = shaft (doesn't need
// to be tip-first, but is, for consistency); index1 = up arm; index2 = down
// arm — both tip-first, matching CHEVRON_LINES / check / play below.
const ARROW_LINES = [L(18, 12, 4, 12), L(18, 12, 12, 6), L(18, 12, 12, 18)];

// Canonical "chevron-right" (>), tip at (15,12). No shaft, so index0 is the
// collapsed slot; index1 = up arm, index2 = down arm, both tip-first — same
// roles/order as ARROW_LINES so arrow <-> chevron morphs arm-to-arm, not
// top-to-bottom.
const CHEVRON_LINES = [COLLAPSED, L(15, 12, 9, 5), L(15, 12, 9, 19)];

// Canonical "plus" (+). A plus turned 45° is an X (cross) — see README.
const PLUS_LINES = [L(12, 4, 12, 20), L(4, 12, 20, 12), COLLAPSED];

// Canonical "download" (shaft + head pointing down), tip at (12,15). Turned
// 180° it becomes "upload" (shaft + head pointing up) — a mirror pair, so it
// rotates too. index0 = shaft, index1 = right arm, index2 = left arm
// (tip-first) — chosen so it lines up with the baked arrow-down template
// (also index1 = right arm, index2 = left arm) despite being a separate,
// non-rotating shape.
const UPDOWN_LINES = [L(12, 15, 12, 4), L(12, 15, 18, 9), L(12, 15, 6, 9)];

// ---- Icon table --------------------------------------------------------------
// Each entry: { lines: [3 lines in local/unrotated space], rotation: degrees,
// group?: shared-template id used by the morph engine to decide rotate-vs-morph }

export const ICONS = {
  menu: {
    lines: [L(4, 7, 20, 7), L(4, 12, 20, 12), L(4, 17, 20, 17)],
    rotation: 0,
  },

  'arrow-right': { lines: ARROW_LINES, rotation: 0, group: 'arrow' },
  'arrow-down': { lines: ARROW_LINES, rotation: 90, group: 'arrow' },
  'arrow-left': { lines: ARROW_LINES, rotation: 180, group: 'arrow' },
  'arrow-up': { lines: ARROW_LINES, rotation: 270, group: 'arrow' },

  'chevron-right': { lines: CHEVRON_LINES, rotation: 0, group: 'chevron' },
  'chevron-down': { lines: CHEVRON_LINES, rotation: 90, group: 'chevron' },
  'chevron-left': { lines: CHEVRON_LINES, rotation: 180, group: 'chevron' },
  'chevron-up': { lines: CHEVRON_LINES, rotation: 270, group: 'chevron' },

  plus: { lines: PLUS_LINES, rotation: 0, group: 'plusCross' },
  cross: { lines: PLUS_LINES, rotation: 45, group: 'plusCross' },

  download: { lines: UPDOWN_LINES, rotation: 0, group: 'updown' },
  upload: { lines: UPDOWN_LINES, rotation: 180, group: 'updown' },

  minus: {
    // Same horizontal bar as `plus`'s second line; the vertical bar collapses
    // to the center point instead of rotating away, since minus isn't a
    // rotation of plus — it's plus with one arm removed.
    lines: [COLLAPSED, L(4, 12, 20, 12), COLLAPSED],
    rotation: 0,
  },

  equals: {
    lines: [L(4, 9, 20, 9), L(4, 15, 20, 15), COLLAPSED],
    rotation: 0,
  },

  asterisk: {
    // Three full diameters through the center, 60° apart — uses all three
    // lines at full length, no collapsing needed.
    lines: [L(12, 3, 12, 21), L(19.8, 7.5, 4.2, 16.5), L(19.8, 16.5, 4.2, 7.5)],
    rotation: 0,
  },

  more: {
    // Horizontal ellipsis: three near-zero-length lines. With round linecaps
    // a zero-length line renders as a dot. (Kept visible — opacity 1 — this
    // is NOT the "collapsed" convention, just very short real strokes.)
    lines: [L(6, 12, 6.01, 12), L(12, 12, 12.01, 12), L(18, 12, 18.01, 12)],
    rotation: 0,
  },

  check: {
    // The elbow (9,17) is check's "tip". index0 collapsed, index1/2 = the
    // two legs, elbow-first — same layout as chevron-down, so check <->
    // chevron morphs read as one V turning into another, not flipping.
    lines: [COLLAPSED, L(9, 17, 19, 6), L(9, 17, 5, 13)],
    rotation: 0,
  },

  play: {
    // A closed triangle needs exactly three lines — no collapsing needed.
    // Tip at (18,12), same point as arrow-right's tip: index0 = the base
    // edge (doesn't touch the tip), index1 = up arm, index2 = down arm —
    // so play <-> arrow-right barely moves the arms, just the base.
    lines: [L(8, 5, 8, 19), L(18, 12, 8, 5), L(18, 12, 8, 19)],
    rotation: 0,
  },

  pause: {
    lines: [L(9, 5, 9, 19), L(15, 5, 15, 19), COLLAPSED],
    rotation: 0,
  },

  external: {
    // Tip at (17,7) where all three strokes already meet. index0 = shaft,
    // index1 = horizontal arm, index2 = vertical arm, tip-first throughout.
    lines: [L(17, 7, 7, 17), L(17, 7, 10, 7), L(17, 7, 17, 14)],
    rotation: 0,
  },
};

export const ICON_NAMES = Object.keys(ICONS);

// ---- Geometry helpers --------------------------------------------------------

function rotatePoint(x, y, deg) {
  if (!deg) return [x, y];
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = x - CENTER;
  const dy = y - CENTER;
  return [CENTER + dx * cos - dy * sin, CENTER + dx * sin + dy * cos];
}

// Resolve an icon's lines to *absolute*, already-rotated coordinates.
export function bake(icon) {
  const { lines, rotation } = icon;
  return lines.map((l) => {
    const [x1, y1] = rotatePoint(l.x1, l.y1, rotation);
    const [x2, y2] = rotatePoint(l.x2, l.y2, rotation);
    return { x1, y1, x2, y2, opacity: l.opacity };
  });
}

export function getIcon(name) {
  const icon = ICONS[name];
  if (!icon) throw new Error(`Unknown icon: "${name}". Known icons: ${ICON_NAMES.join(', ')}`);
  return icon;
}
