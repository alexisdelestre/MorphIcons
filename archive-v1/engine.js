// engine.js
// -----------------------------------------------------------------------------
// Framework-agnostic morph controller. Renders nothing itself — you give it a
// `render(lines, rotation)` callback and it calls that callback every frame
// with the three lines (each {x1,y1,x2,y2,opacity}) and a rotation in degrees
// to apply around the icon's center.
//
// The one decision that matters: when morphing between two icons that share
// a `group` (arrow-right -> arrow-down, plus -> cross, ...), animate ONLY the
// rotation and keep the line coordinates fixed at the group's shared template.
// Otherwise, "bake" both icons to absolute coordinates and lerp the lines
// directly. Mixing the two (rotating AND morphing coordinates at once) is
// exactly the "bends and warps" failure mode we're avoiding.
// -----------------------------------------------------------------------------

import { getIcon, bake, CENTER } from './icons.js';

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

const prefersReducedMotion =
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;

export class MorphController {
  /**
   * @param {(lines: {x1:number,y1:number,x2:number,y2:number,opacity:number}[], rotation: number) => void} render
   */
  constructor(render) {
    this.render = render;
    this.name = null;
    // Snapshot of exactly what's on screen right now, normalized so a new
    // morph can always start from it (including mid-animation interrupts).
    // `groupId` is set only when `lines` is still the shared, unrotated
    // group template (i.e. we're mid rotation-only animation or idle on a
    // group icon) — otherwise `lines` are absolute/baked and rotation is 0.
    this._live = null; // { lines, rotation, groupId }
    this._raf = null;
  }

  /** Jump to an icon instantly, no animation. */
  set(name) {
    this._cancel();
    const icon = getIcon(name);
    this.name = name;
    if (icon.group) {
      this._live = { lines: icon.lines, rotation: icon.rotation, groupId: icon.group };
      this.render(icon.lines, icon.rotation);
    } else {
      const baked = bake(icon);
      this._live = { lines: baked, rotation: 0, groupId: null };
      this.render(baked, 0);
    }
  }

  /** Animate to an icon. Safe to call again mid-animation. Returns a Promise. */
  morphTo(name, { duration = 450, easing = easeInOutCubic } = {}) {
    const target = getIcon(name);
    if (!this._live) {
      this.set(name);
      return Promise.resolve();
    }
    if (name === this.name && !this._raf) {
      return Promise.resolve(); // already there, idle
    }

    this._cancel();

    if (prefersReducedMotion && prefersReducedMotion.matches) {
      this.set(name);
      return Promise.resolve();
    }

    const live = this._live;
    const sameGroup = Boolean(live.groupId && target.group && live.groupId === target.group);

    return new Promise((resolve) => {
      const start = performance.now();

      if (sameGroup) {
        // Rotation-only path: coordinates never change.
        const fromLines = live.lines; // === target.lines, by construction
        const fromRotation = live.rotation;
        const toRotation = target.rotation;

        const tick = (now) => {
          const t = Math.min(1, (now - start) / duration);
          const e = easing(t);
          const rotation = lerp(fromRotation, toRotation, e);
          this._live = { lines: fromLines, rotation, groupId: target.group };
          this.render(fromLines, rotation);
          if (t < 1) {
            this._raf = requestAnimationFrame(tick);
          } else {
            this.name = name;
            resolve();
          }
        };
        this._raf = requestAnimationFrame(tick);
      } else {
        // Coordinate-morph path: bake both ends to absolute coordinates.
        const fromLines = live.groupId ? bake({ lines: live.lines, rotation: live.rotation }) : live.lines;
        const toLines = bake(target);

        const tick = (now) => {
          const t = Math.min(1, (now - start) / duration);
          const e = easing(t);
          const lines = fromLines.map((l, i) => {
            const tl = toLines[i];
            return {
              x1: lerp(l.x1, tl.x1, e),
              y1: lerp(l.y1, tl.y1, e),
              x2: lerp(l.x2, tl.x2, e),
              y2: lerp(l.y2, tl.y2, e),
              opacity: lerp(l.opacity, tl.opacity, e),
            };
          });
          this._live = { lines, rotation: 0, groupId: null };
          this.render(lines, 0);
          if (t < 1) {
            this._raf = requestAnimationFrame(tick);
          } else {
            const baked = toLines;
            this._live = { lines: baked, rotation: 0, groupId: null };
            this.render(baked, 0);
            this.name = name;
            resolve();
          }
        };
        this._raf = requestAnimationFrame(tick);
      }
    });
  }

  _cancel() {
    if (this._raf != null) {
      cancelAnimationFrame(this._raf);
      this._raf = null;
    }
  }

  destroy() {
    this._cancel();
  }
}

export { CENTER };
