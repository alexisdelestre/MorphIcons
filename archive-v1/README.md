# Morphing Icons

A morphing SVG icon set: every icon is exactly **three lines**, so any icon can
tween smoothly into any other icon by animating the same three `x1,y1,x2,y2`
pairs. Modeled proportionally on [Phosphor](https://phosphoricons.com)'s
regular weight (24×24 box, stroke-width 2, round caps/joins, no fill).

Built following the approach described in
[benji.org/morphing-icons-with-claude](https://benji.org/morphing-icons-with-claude):
a fixed 3-line structure, unused lines collapsed to an invisible center point,
and rotation used instead of coordinate-morphing for icons that are really the
same shape at a different angle.

## Files

| File | What it is |
|---|---|
| [`icons.js`](icons.js) | The data: all 21 icons as 3 lines each, plus the rotation-group templates and the `bake()` helper that resolves an icon to absolute coordinates. |
| [`engine.js`](engine.js) | `MorphController` — a tiny, dependency-free rAF tweening engine that decides *rotate* vs *morph coordinates* and drives either. |
| [`morph-icon-element.js`](morph-icon-element.js) | `<morph-icon>` — a zero-dependency Web Component. Works anywhere: plain HTML, React, Vue, Svelte. |
| [`MorphIcon.jsx`](MorphIcon.jsx) | A native React component alternative, same data/engine, no custom element. |
| [`demo.html`](demo.html) | A gallery of all 21 icons — click one to morph the hero icon into it, or hit "cycle all". |
| [`test-engine.mjs`](test-engine.mjs) | Headless correctness checks (`node test-engine.mjs`) — run these after editing any icon's coordinates. |

## Usage

**Web component** (no build step):

```html
<script type="module" src="./morph-icon-element.js"></script>
<morph-icon icon="menu" size="24" duration="450"></morph-icon>
<script type="module">
  document.querySelector('morph-icon').icon = 'cross'; // animates
</script>
```

**React:**

```jsx
import MorphIcon from './MorphIcon.jsx';

<MorphIcon icon={isOpen ? 'cross' : 'menu'} size={24} duration={350} />
```

Changing the `icon` prop/attribute always animates. To jump instantly (e.g. on
first paint) the web component exposes `.setInstant(name)`; both engines call
that path automatically on mount.

## The three rules

**1. Every icon is exactly three `<line>`s.** Icons needing fewer than three
visible strokes collapse the rest to a zero-length line pinned at the exact
center with `opacity: 0` — e.g. `minus` is `plus` with its vertical arm
collapsed to `{x1:12,y1:12,x2:12,y2:12,opacity:0}`. This is what keeps every
icon addressable by the same three coordinate pairs, and it's why a collapse
never flashes a stray dot: the point sits exactly on the rotation center and
is invisible the whole time it's "extra."

**2. Rotation groups, not coordinate morphs, for same-shape-different-angle
icons.** `arrow-right/down/left/up`, `chevron-right/down/left/up`, and
`plus/cross` (a plus turned 45° *is* an X) each share one canonical, unrotated
`lines` template plus a per-icon `rotation` in degrees. `engine.js` checks
whether the source and target icon share a `group` id — if so it animates
*only* the `<g transform="rotate(...)">`, never touching the line
coordinates. Coordinate-interpolating an arrow through 90° makes the shaft
visibly bow and the head warp; rotating the identical shape doesn't.

Everything else — `menu → play`, `plus → minus`, any pair that isn't in the
same rotation group — interpolates the three lines' raw coordinates and
opacity directly. That's deliberate: those pairs aren't the same shape, so
there's nothing to rotate, and a straight coordinate morph is what makes the
transition read as one shape organically becoming another rather than two
icons cross-fading.

**3. Never mix the two.** A transition is either a pure rotation (identical
line template, only the angle changes) or a pure coordinate morph (rotation
pinned to 0, only the coordinates change) — never both at once. Blending them
reintroduces the bowing/warping the rotation groups exist to avoid.

## Icon list (21)

`menu` · `arrow-right/down/left/up` · `chevron-right/down/left/up` ·
`plus` · `cross` · `download` · `upload` · `minus` · `equals` · `asterisk` ·
`more` · `check` · `play` · `pause` · `external`

## Verifying changes

The demo's live browser tab throttles `requestAnimationFrame`/`setTimeout`
when it isn't the OS-focused window (common in sandboxed/automated browser
panes), which makes intermediate animation frames unreliable to eyeball. So
`test-engine.mjs` drives `MorphController` with a manually-stepped fake clock
instead of a real one, and asserts on the actual interpolated state:

```bash
node test-engine.mjs
```

It checks: rotation-group members only ever animate the shared template's
rotation (never its coordinates); every icon has exactly three lines; every
collapsed line is a true zero-length point at the center; a coordinate morph
never produces NaN or a wildly out-of-viewBox value; and interrupting a morph
mid-flight resumes from the actually-visible position instead of snapping.

If you add or edit an icon, run this after — and if it's a rotation group
member, double check `icon.lines === otherMember.lines` (same array
reference, not just equal values), since that's what tells the engine to
rotate instead of morph.
