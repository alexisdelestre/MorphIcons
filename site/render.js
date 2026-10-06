// site/render.js — SVG drawing of frames for the page (previews, editor).

import { frameOf, restState } from '../dist/morph-core.js';

const NS = 'http://www.w3.org/2000/svg';

/** One color per line "slot", used by every debug view. */
export const SLOT_COLORS = ['#e5484d', '#0090ff', '#30a46c'];

export function svgEl(tag, attrs = {}, parent) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (parent) parent.appendChild(el);
  return el;
}

export function restFrame(data, name) {
  return frameOf(restState(data, name));
}

/**
 * An SVG that draws frames. `paint(frame)` updates the 3 lines.
 * options.debug: lines colored by slot + endpoint markers (●start ○end).
 */
export function createIconView(data, { size = 24, debug = false, className = '' } = {}) {
  const vb = data.viewBox;
  const c = vb / 2;
  const svg = svgEl('svg', {
    viewBox: `0 0 ${vb} ${vb}`,
    width: size,
    height: size,
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': data.strokeWidth,
    'stroke-linecap': 'round',
    class: `icon-view ${className}`,
    'aria-hidden': 'true',
  });
  const ghosts = svgEl('g', { class: 'ghosts' }, svg);
  const rot = svgEl('g', {}, svg);
  const lines = [0, 1, 2].map(() => svgEl('line', {}, rot));
  const markers = [0, 1, 2].map((k) => {
    const g = svgEl('g', { class: 'markers' }, rot);
    const start = svgEl('circle', { r: 0.75, fill: SLOT_COLORS[k], stroke: 'none' }, g);
    const end = svgEl('circle', { r: 0.6, fill: 'var(--surface)', stroke: SLOT_COLORS[k], 'stroke-width': 0.4 }, g);
    return { g, start, end };
  });

  const view = {
    el: svg,
    debug,
    lastFrame: null,
    paint(frame) {
      view.lastFrame = frame;
      rot.setAttribute('transform', `rotate(${frame.rotation} ${c} ${c})`);
      frame.lines.forEach((s, k) => {
        const l = lines[k];
        l.setAttribute('x1', s.x1);
        l.setAttribute('y1', s.y1);
        l.setAttribute('x2', s.x2);
        l.setAttribute('y2', s.y2);
        l.setAttribute('opacity', view.debug ? Math.max(s.o, 0.25) : s.o);
        l.setAttribute('stroke', view.debug ? SLOT_COLORS[k] : 'currentColor');
        const m = markers[k];
        m.g.style.display = view.debug ? '' : 'none';
        m.start.setAttribute('cx', s.x1);
        m.start.setAttribute('cy', s.y1);
        m.end.setAttribute('cx', s.x2);
        m.end.setAttribute('cy', s.y2);
        m.g.setAttribute('opacity', s.o < 0.05 ? 0.35 : 1);
      });
    },
    setDebug(on) {
      view.debug = on;
      if (view.lastFrame) view.paint(view.lastFrame);
    },
    /** Faint outlines (e.g. start and end icons) behind the animation. */
    setGhosts(frames) {
      ghosts.replaceChildren();
      for (const { frame, cls } of frames) {
        const g = svgEl('g', { class: `ghost ${cls}`, transform: `rotate(${frame.rotation} ${c} ${c})` }, ghosts);
        for (const s of frame.lines) {
          if (s.o === 0) continue;
          svgEl('line', { x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 }, g);
        }
      }
    },
  };
  return view;
}

/** Static icon (lists, thumbnails). */
export function iconThumb(data, name, size = 24) {
  const v = createIconView(data, { size });
  v.paint(restFrame(data, name));
  return v.el;
}
