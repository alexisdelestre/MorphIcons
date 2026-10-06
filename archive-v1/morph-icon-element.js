// morph-icon-element.js
// -----------------------------------------------------------------------------
// <morph-icon> — a zero-dependency custom element. Works in plain HTML, React,
// Vue, Svelte, anything that can render a tag.
//
//   <morph-icon icon="menu" size="24" duration="450"></morph-icon>
//
//   const el = document.querySelector('morph-icon');
//   el.icon = 'cross';              // animates the morph
//   el.setAttribute('icon', 'x');   // same thing, via attribute
//   await el.morphTo('play', { duration: 300 });
//
// Styling: color comes from CSS `color` (strokes use currentColor), and the
// element is an inline-flex box sized by the `size` attribute/property.
// -----------------------------------------------------------------------------

import { SIZE, ICON_NAMES } from './icons.js';
import { MorphController } from './engine.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host {
      display: inline-flex;
      width: var(--morph-icon-size, 24px);
      height: var(--morph-icon-size, 24px);
      color: inherit;
    }
    svg {
      width: 100%;
      height: 100%;
      overflow: visible;
    }
    line {
      stroke: currentColor;
      fill: none;
    }
  </style>
  <svg viewBox="0 0 ${SIZE} ${SIZE}" fill="none" xmlns="${SVG_NS}">
    <g class="rot">
      <line class="l0" />
      <line class="l1" />
      <line class="l2" />
    </g>
  </svg>
`;

export class MorphIconElement extends HTMLElement {
  static get observedAttributes() {
    return ['icon', 'size', 'duration', 'stroke-width', 'linecap'];
  }

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.appendChild(template.content.cloneNode(true));

    this._g = shadow.querySelector('g.rot');
    this._lineEls = [
      shadow.querySelector('.l0'),
      shadow.querySelector('.l1'),
      shadow.querySelector('.l2'),
    ];

    this._controller = new MorphController((lines, rotation) => this._paint(lines, rotation));
  }

  connectedCallback() {
    this._applyStrokeWidth();
    this._applyLinecap();
    this._applySize();
    const initial = this.getAttribute('icon') || 'menu';
    this._controller.set(initial);
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (name === 'icon') {
      if (this._controller.name == null) return; // not connected yet
      this._controller.morphTo(newValue, { duration: this.duration });
    } else if (name === 'size') {
      this._applySize();
    } else if (name === 'stroke-width') {
      this._applyStrokeWidth();
    } else if (name === 'linecap') {
      this._applyLinecap();
    }
  }

  _applySize() {
    const size = this.getAttribute('size');
    this.style.setProperty('--morph-icon-size', size ? `${size}px` : '24px');
  }

  _applyStrokeWidth() {
    const w = this.getAttribute('stroke-width') || '2';
    this._lineEls.forEach((el) => el.setAttribute('stroke-width', w));
  }

  _applyLinecap() {
    const cap = this.getAttribute('linecap') || 'round';
    this._lineEls.forEach((el) => {
      el.setAttribute('stroke-linecap', cap);
    });
  }

  _paint(lines, rotation) {
    this._g.setAttribute('transform', `rotate(${rotation} ${SIZE / 2} ${SIZE / 2})`);
    lines.forEach((l, i) => {
      const el = this._lineEls[i];
      el.setAttribute('x1', l.x1);
      el.setAttribute('y1', l.y1);
      el.setAttribute('x2', l.x2);
      el.setAttribute('y2', l.y2);
      el.setAttribute('opacity', l.opacity);
    });
  }

  get icon() {
    return this.getAttribute('icon');
  }
  set icon(name) {
    this.setAttribute('icon', name);
  }

  get duration() {
    const d = Number(this.getAttribute('duration'));
    return Number.isFinite(d) && d > 0 ? d : 450;
  }
  set duration(ms) {
    this.setAttribute('duration', String(ms));
  }

  /** Animate to an icon, bypassing the (debounced-by-nature) attribute path. */
  morphTo(name, opts) {
    return this._controller.morphTo(name, { duration: this.duration, ...opts });
  }

  /** Jump to an icon instantly. */
  setInstant(name) {
    this.setAttribute('icon', name);
    this._controller.set(name);
  }
}

customElements.define('morph-icon', MorphIconElement);

export { ICON_NAMES };
