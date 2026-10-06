// site/app.js — the Morph Icons page: playground, quick review, integration, draft bar.

import { bake, frameAt, plan, restState, stateAt, MorphDriver } from '../dist/morph-core.js';
import { store } from './store.js';
import { createIconView, iconThumb, svgEl, SLOT_COLORS } from './render.js';
import { initEditor } from './editor.js';
import { PLATFORMS } from './platforms.js';

const $ = (sel, root = document) => root.querySelector(sel);
const h = (tag, attrs = {}, ...children) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null) el.append(c);
  return el;
};
const names = () => Object.keys(store.data.icons);
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// =============================================================================
// Routing (#playground, #editor, #integration/react, #guide)
// =============================================================================

const TABS = ['playground', 'editor', 'integration', 'guide'];
let activeTab = null;

function route() {
  const [tab, sub] = location.hash.slice(1).split('/');
  const next = TABS.includes(tab) ? tab : 'playground';
  for (const t of TABS) {
    $(`#tab-${t}`).hidden = t !== next;
    document.querySelector(`[data-tab="${t}"]`).setAttribute('aria-current', t === next ? 'page' : 'false');
  }
  activeTab = next;
  review.setRunning(next === 'playground');
  if (next === 'integration') integration.show(sub);
  if (next === 'guide' && sub) document.getElementById(sub)?.scrollIntoView();
}

// =============================================================================
// Playground
// =============================================================================

const pg = {
  view: null,
  from: 'menu',
  to: 'menu',
  p: null,
  /** false when the plan started mid-transition (an interruption). */
  clean: true,
  t: 1,
  raf: null,
  /** Override being edited, not saved yet: { key, map, flip } */
  pending: null,

  init() {
    this.view = createIconView(store.data, { size: 192, className: 'hero-svg' });
    $('#hero').append(this.view.el);
    $('#playBtn').addEventListener('click', () => (this.raf ? this.pause() : this.play()));
    $('#scrub').addEventListener('input', (e) => this.scrub(e.target.value / 1000));
    $('#fromSel').addEventListener('change', (e) => this.setPair(e.target.value, this.to, true));
    $('#toSel').addEventListener('change', (e) => this.setPair(this.from, e.target.value, true));
    $('#swapBtn').addEventListener('click', () => this.setPair(this.to, this.from, true));
    $('#debugChk').addEventListener('change', (e) => {
      this.view.setDebug(e.target.checked);
      this.paint();
    });
    $('#durInput').addEventListener('change', () => this.play());
    this.refresh();
    // Open on a meaningful pair, at its start: press play to see it.
    const all = names();
    if (all.length > 1) this.setPair(all[0], all.includes('cross') && all[0] !== 'cross' ? 'cross' : all[1], false);
  },

  duration() {
    const v = Number($('#durInput').value);
    return Number.isFinite(v) && v >= 50 ? v : store.data.duration;
  },

  /** Data used for planning: the store's, plus the override being edited. */
  data() {
    const d = store.data;
    if (!this.pending) return d;
    const overrides = { ...(d.overrides ?? {}) };
    delete overrides[`${this.to}>${this.from}`];
    overrides[this.pending.key] = { map: this.pending.map, flip: this.pending.flip };
    return { ...d, overrides };
  },

  replan() {
    const d = this.data();
    this.p = plan(d, restState(d, this.from), this.to);
    this.clean = true;
  },

  setPair(from, to, autoplay) {
    this.stop();
    this.from = from;
    this.to = to;
    this.pending = null;
    this.replan();
    this.t = 0;
    this.syncControls();
    if (autoplay) this.play();
    else this.paint();
  },

  /** Grid click: from what's on screen to `name` (interruptible, like in an app). */
  goTo(name) {
    const live = this.p ? stateAt(this.p, this.t) : restState(store.data, this.to);
    this.stop();
    this.pending = null;
    this.from = this.to;
    this.to = name;
    this.p = plan(store.data, live, name);
    this.clean = live.name !== null;
    this.syncControls();
    this.play(true);
  },

  play(keepPlan = false) {
    if (!keepPlan && !this.clean) this.replan();
    if (this.t >= 1) this.t = 0;
    const dur = reduceMotion() ? 1 : this.duration();
    const start = performance.now() - this.t * dur;
    const tick = (now) => {
      this.t = Math.min(1, (now - start) / dur);
      this.paint();
      this.raf = this.t < 1 ? requestAnimationFrame(tick) : null;
      if (!this.raf) this.syncPlayButton();
    };
    this.raf = requestAnimationFrame(tick);
    this.syncPlayButton();
  },

  pause() {
    this.stop();
    this.syncPlayButton();
  },

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
  },

  scrub(t) {
    this.stop();
    if (!this.clean) this.replan();
    this.t = t;
    this.paint();
    this.syncPlayButton();
  },

  paint() {
    if (!this.p) return;
    this.view.paint(frameAt(this.p, this.t));
    const d = store.data;
    if (this.view.debug) {
      this.view.setGhosts([
        { frame: frameAt(plan(d, restState(d, this.from), this.from), 1), cls: 'ghost-from' },
        { frame: frameAt(this.p, 1), cls: 'ghost-to' },
      ]);
    } else {
      this.view.setGhosts([]);
    }
    $('#scrub').value = Math.round(this.t * 1000);
    $('#scrubOut').textContent = `${Math.round(this.t * 100)} %`;
  },

  syncPlayButton() {
    const playing = this.raf !== null;
    const btn = $('#playBtn');
    btn.textContent = playing ? '❚❚' : '▶';
    btn.setAttribute('aria-label', playing ? 'Pause' : 'Jouer');
  },

  syncControls() {
    for (const sel of [$('#fromSel'), $('#toSel')]) {
      if (sel.options.length !== names().length || [...sel.options].some((o, i) => o.value !== names()[i])) {
        sel.replaceChildren(...names().map((n) => h('option', { value: n }, n)));
      }
    }
    $('#fromSel').value = this.from;
    $('#toSel').value = this.to;
    for (const cell of $('#iconGrid').children) cell.classList.toggle('active', cell.dataset.name === this.to);
    this.renderInfo();
    this.renderOverridePanel();
  },

  /** After a data change (edit, draft discarded…). */
  refresh() {
    const all = names();
    if (!all.includes(this.from)) this.from = all[0];
    if (!all.includes(this.to)) this.to = this.from;
    this.pending = null;
    const grid = $('#iconGrid');
    grid.replaceChildren(
      ...all.map((n) =>
        h('button', { class: 'icon-cell', 'data-name': n, title: n, onclick: () => this.goTo(n) }, iconThumb(store.data, n, 28), h('span', {}, n)),
      ),
    );
    $('#durInput').placeholder = store.data.duration;
    this.stop();
    this.replan();
    this.t = 1;
    this.syncControls();
    this.paint();
  },

  renderInfo() {
    const p = this.p;
    const info = $('#pairInfo');
    if (!p || p.kind === 'none') {
      info.innerHTML = 'Même picto au départ et à l’arrivée : choisissez une autre cible.';
      return;
    }
    if (p.kind === 'rotate') {
      const delta = Math.round((p.to - p.from) * 100) / 100;
      info.innerHTML = `<span class="badge badge-rot">Rotation</span> Même forme (groupe <code>${p.end.group}</code>) : elle tourne de <b>${delta > 0 ? '+' : ''}${delta}°</b>, par le plus court chemin. Les coordonnées ne bougent pas.`;
      return;
    }
    const how =
      p.source === 'override'
        ? '<span class="badge badge-fix">Corrigé à la main</span> Appariement des lignes imposé dans le JSON.'
        : '<span class="badge">Automatique</span> Chaque ligne va vers la ligne cible la plus proche (trajet total minimal).';
    info.innerHTML = `${how}${this.clean ? '' : ' <i>Repris en cours de route : rejouez pour voir la transition complète.</i>'}`;
  },

  renderOverridePanel() {
    const panel = $('#overridePanel');
    const p = this.p;
    if (!p || p.kind !== 'morph' || !this.clean) {
      panel.replaceChildren();
      return;
    }
    const key = `${this.from}>${this.to}`;
    const d = store.data;
    const hasOverride = Boolean(d.overrides?.[key] || d.overrides?.[`${this.to}>${this.from}`]);

    if (!this.pending) {
      panel.replaceChildren(
        h(
          'div',
          { class: 'override-closed' },
          h('button', { class: 'btn', onclick: () => this.openOverride() }, 'Corriger cette transition…'),
          hasOverride
            ? h('button', { class: 'btn btn-ghost', onclick: () => this.resetOverride() }, 'Revenir à l’automatique')
            : null,
        ),
      );
      return;
    }

    const { map, flip } = this.pending;
    const fromLines = absoluteLines(d, this.from);
    const toLines = absoluteLines(d, this.to);
    const slotOfTarget = [0, 1, 2].map((j) => map.indexOf(j));

    const rows = [0, 1, 2].map((k) =>
      h(
        'div',
        { class: 'ov-row' },
        h('span', { class: 'swatch', style: `background:${SLOT_COLORS[k]}` }),
        h('span', { class: 'ov-src' }, `Ligne ${k + 1}${fromLines[k].o === 0 ? ' (masquée)' : ''}`),
        h('span', { class: 'ov-arrow' }, '→'),
        h(
          'select',
          {
            'aria-label': `Cible de la ligne ${k + 1}`,
            onchange: (e) => this.setPendingTarget(k, Number(e.target.value)),
          },
          [0, 1, 2].map((j) =>
            h('option', { value: j, selected: map[k] === j }, `ligne ${j + 1} de ${this.to}${toLines[j].o === 0 ? ' (masquée)' : ''}`),
          ),
        ),
        h(
          'label',
          { class: 'ov-flip' },
          h('input', { type: 'checkbox', checked: flip[k], onchange: (e) => this.setPendingFlip(k, e.target.checked) }),
          'sens inversé',
        ),
      ),
    );

    panel.replaceChildren(
      h(
        'div',
        { class: 'override-open' },
        h(
          'div',
          { class: 'ov-previews' },
          numberedPreview(d, this.from, (k) => SLOT_COLORS[k], `Départ : ${this.from}`),
          h('span', { class: 'ov-arrow big' }, '→'),
          numberedPreview(d, this.to, (j) => SLOT_COLORS[slotOfTarget[j]], `Arrivée : ${this.to}`),
        ),
        h('p', { class: 'hint' }, 'Choisissez, pour chaque ligne de départ, la ligne d’arrivée qu’elle doit devenir. « Sens inversé » relie le début de l’une à la fin de l’autre (●→○). L’aperçu se met à jour en direct.'),
        ...rows,
        h(
          'div',
          { class: 'ov-actions' },
          h('button', { class: 'btn btn-primary', onclick: () => this.saveOverride() }, 'Enregistrer dans le brouillon'),
          hasOverride ? h('button', { class: 'btn', onclick: () => this.resetOverride() }, 'Revenir à l’automatique') : null,
          h('button', { class: 'btn btn-ghost', onclick: () => this.closeOverride() }, 'Annuler'),
        ),
      ),
    );
  },

  openOverride() {
    const p = this.p;
    this.pending = { key: `${this.from}>${this.to}`, map: [...p.map], flip: [...p.flip] };
    $('#debugChk').checked = true;
    this.view.setDebug(true);
    this.renderOverridePanel();
    this.paint();
  },

  setPendingTarget(k, j) {
    const map = this.pending.map;
    const other = map.indexOf(j);
    map[other] = map[k];
    map[k] = j;
    this.previewPending();
  },

  setPendingFlip(k, on) {
    this.pending.flip[k] = on;
    this.previewPending();
  },

  previewPending() {
    this.replan();
    this.renderInfo();
    this.renderOverridePanel();
    this.t = 0;
    this.play();
  },

  saveOverride() {
    const { key, map, flip } = this.pending;
    const reverse = `${this.to}>${this.from}`;
    this.pending = null;
    store.edit((d) => {
      d.overrides ??= {};
      delete d.overrides[reverse];
      d.overrides[key] = { map: [...map], flip: [...flip] };
    });
  },

  resetOverride() {
    const key = `${this.from}>${this.to}`;
    const reverse = `${this.to}>${this.from}`;
    this.pending = null;
    store.edit((d) => {
      if (!d.overrides) return;
      delete d.overrides[key];
      delete d.overrides[reverse];
    });
  },

  closeOverride() {
    this.pending = null;
    this.replan();
    this.syncControls();
    this.t = 1;
    this.paint();
  },
};

function absoluteLines(d, name) {
  const s = restState(d, name);
  return s.group ? bake(s.lines, s.rotation, d.viewBox / 2) : s.lines;
}

/** Icon with its lines colored and numbered (1-3), for the correction panel. */
function numberedPreview(d, name, colorOf, caption) {
  const vb = d.viewBox;
  const svg = svgEl('svg', { viewBox: `-2 -2 ${vb + 4} ${vb + 4}`, width: 120, height: 120, fill: 'none', 'stroke-linecap': 'round' });
  absoluteLines(d, name).forEach((s, i) => {
    const color = colorOf(i);
    if (s.o === 0) {
      svgEl('circle', { cx: s.x1, cy: s.y1, r: 1.4, stroke: color, 'stroke-width': 0.35, 'stroke-dasharray': '0.6 0.5' }, svg);
    } else {
      svgEl('line', { x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2, stroke: color, 'stroke-width': d.strokeWidth }, svg);
      svgEl('circle', { cx: s.x1, cy: s.y1, r: 0.75, fill: color }, svg);
    }
    const mx = (s.x1 + s.x2) / 2;
    const my = (s.y1 + s.y2) / 2;
    const label = svgEl('g', {}, svg);
    svgEl('circle', { cx: mx, cy: my, r: 1.5, fill: 'var(--surface)', stroke: color, 'stroke-width': 0.35 }, label);
    const tx = svgEl('text', { x: mx, y: my + 0.75, 'text-anchor': 'middle', 'font-size': 2.1, fill: color, 'font-weight': 700 }, label);
    tx.textContent = String(i + 1);
  });
  return h('figure', { class: 'ov-figure' }, svg, h('figcaption', {}, caption));
}

// =============================================================================
// Quick review: every transition from one icon, looping there and back
// =============================================================================

const review = {
  source: 'menu',
  cells: [],
  raf: null,
  start: 0,
  running: false,

  init() {
    $('#reviewSel').addEventListener('change', (e) => {
      this.source = e.target.value;
      this.build();
    });
    this.build();
  },

  build() {
    const d = store.data;
    const all = names();
    if (!all.includes(this.source)) this.source = all[0];
    $('#reviewSel').replaceChildren(...all.map((n) => h('option', { value: n, selected: n === this.source }, n)));
    const grid = $('#reviewGrid');
    this.cells = all
      .filter((n) => n !== this.source)
      .map((n) => {
        const view = createIconView(d, { size: 44 });
        const there = plan(d, restState(d, this.source), n);
        const back = plan(d, restState(d, n), this.source);
        const kind = there.kind === 'rotate' ? 'rotation' : there.source === 'override' ? 'corrigé' : '';
        const el = h(
          'button',
          {
            class: 'review-cell',
            title: `${this.source} ⇄ ${n} — cliquer pour inspecter`,
            onclick: () => {
              pg.setPair(this.source, n, true);
              $('#stage').scrollIntoView({ behavior: 'smooth', block: 'start' });
            },
          },
          view.el,
          h('span', { class: 'review-name' }, n),
          kind ? h('span', { class: `review-kind ${kind === 'rotation' ? 'rot' : 'fix'}` }, kind) : null,
        );
        view.paint(frameAt(there, 0));
        return { el, view, there, back };
      });
    grid.replaceChildren(...this.cells.map((c) => c.el));
    this.start = performance.now();
  },

  setRunning(on) {
    this.running = on;
    if (on && !this.raf) this.raf = requestAnimationFrame((t) => this.tick(t));
    if (!on && this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = null;
    }
  },

  tick(now) {
    const D = store.data.duration;
    const hold = 550;
    const cycle = 2 * (D + hold);
    const tau = (now - this.start) % cycle;
    for (const c of this.cells) {
      let f;
      if (tau < D) f = frameAt(c.there, tau / D);
      else if (tau < D + hold) f = frameAt(c.there, 1);
      else if (tau < 2 * D + hold) f = frameAt(c.back, (tau - D - hold) / D);
      else f = frameAt(c.back, 1);
      c.view.paint(f);
    }
    this.raf = this.running ? requestAnimationFrame((t) => this.tick(t)) : null;
  },
};

// =============================================================================
// Integration: one tab per platform, code fetched from the repo
// =============================================================================

const fileCache = new Map();
async function fetchText(path) {
  if (!fileCache.has(path)) {
    fileCache.set(
      path,
      fetch(path, { cache: 'no-cache' }).then((r) => {
        if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
        return r.text();
      }),
    );
  }
  return fileCache.get(path);
}

function highlight(codeEl) {
  if (window.hljs) {
    try {
      window.hljs.highlightElement(codeEl);
    } catch {}
  }
}

async function copyText(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    flash(button, 'Copié ✓');
  } catch {
    flash(button, 'Copie impossible');
  }
}

function flash(button, label) {
  const old = button.dataset.label ?? button.textContent;
  button.dataset.label = old;
  button.textContent = label;
  setTimeout(() => (button.textContent = old), 1400);
}

function codeBlock(code, lang) {
  const codeEl = h('code', { class: `language-${lang}` }, code.trim());
  const copy = h('button', { class: 'btn btn-small copy-btn', onclick: (e) => copyText(code.trim(), e.currentTarget) }, 'Copier');
  const wrap = h('div', { class: 'code' }, copy, h('pre', {}, codeEl));
  highlight(codeEl);
  return wrap;
}

function fileBlock(file) {
  const codeEl = h('code', { class: `language-${file.lang}` }, 'Chargement…');
  const pre = h('pre', {}, codeEl);
  let loaded = false;
  const load = async () => {
    if (loaded) return;
    loaded = true;
    try {
      const text = await fetchText(file.path);
      codeEl.textContent = text;
      highlight(codeEl);
      meta.textContent = `${file.path} · ${text.split('\n').length} lignes`;
    } catch (err) {
      codeEl.textContent = `Impossible de charger ${file.path} (${err.message}). Ouvrez la page via un serveur HTTP.`;
    }
  };
  const meta = h('span', { class: 'file-meta' }, file.path);
  const details = h(
    'details',
    { class: 'file', ontoggle: (e) => e.currentTarget.open && load() },
    h(
      'summary',
      {},
      h('span', { class: 'file-name' }, file.as),
      meta,
      h(
        'span',
        { class: 'file-actions' },
        h(
          'button',
          {
            class: 'btn btn-small',
            onclick: async (e) => {
              e.preventDefault();
              const btn = e.currentTarget;
              copyText(await fetchText(file.path), btn);
            },
          },
          'Copier',
        ),
        h('a', { class: 'btn btn-small', href: file.path, download: file.as, onclick: (e) => e.stopPropagation() }, 'Télécharger'),
      ),
    ),
    file.note ? h('p', { class: 'file-note' }, file.note) : null,
    pre,
  );
  return details;
}

const integration = {
  current: null,
  init() {
    $('#platformTabs').replaceChildren(
      ...PLATFORMS.map((p) => h('a', { href: `#integration/${p.id}`, 'data-platform': p.id, class: 'subtab' }, p.label)),
    );
  },
  show(id) {
    const platform = PLATFORMS.find((p) => p.id === id) ?? PLATFORMS[0];
    for (const a of $('#platformTabs').children) a.setAttribute('aria-current', a.dataset.platform === platform.id ? 'page' : 'false');
    if (this.current === platform.id) return;
    this.current = platform.id;
    const body = $('#platformBody');
    body.replaceChildren();
    for (const section of platform.sections) {
      const sec = h('section', { class: 'doc-section' }, section.title ? h('h3', {}, section.title) : null);
      if (section.html) {
        const div = h('div', { class: 'prose' });
        div.innerHTML = section.html;
        sec.append(div);
      }
      if (section.files) sec.append(...section.files.map(fileBlock));
      if (section.code) sec.append(codeBlock(section.code, section.lang));
      if (section.after) {
        const div = h('div', { class: 'prose' });
        div.innerHTML = section.after;
        sec.append(div);
      }
      body.append(sec);
    }
  },
};

// =============================================================================
// Data status + draft bar
// =============================================================================

function renderStatus() {
  const d = store.data;
  const errors = store.errors();
  const status = $('#dataStatus');
  if (!store.hasDraft) {
    status.innerHTML = `<span class="pill">Version publiée · v${store.published.version}</span>`;
  } else {
    status.innerHTML = `<span class="pill pill-draft">Brouillon local${store.isDirty ? ' · modifié' : ''}</span>`;
  }
  const bar = $('#draftBar');
  bar.hidden = !store.hasDraft;
  if (!store.hasDraft) return;
  const notes = [];
  if (store.isStale) notes.push(`⚠ Brouillon basé sur la v${d.version}, la version publiée est la v${store.published.version}. Exportez ou abandonnez-le avant de continuer.`);
  if (errors.length) notes.push(`⚠ ${errors.length} erreur(s) à corriger avant l’export : ${errors.slice(0, 2).join(' · ')}`);
  $('#draftText').innerHTML = store.isDirty
    ? `<b>Brouillon non publié</b>. Vos modifications sont enregistrées dans ce navigateur. Exportez le fichier, puis publiez-le sur GitHub (version v${store.published.version + 1}).`
    : 'Brouillon identique à la version publiée.';
  $('#draftNotes').textContent = notes.join(' ');
  $('#downloadBtn').disabled = errors.length > 0;
  $('#copyJsonBtn').disabled = errors.length > 0;
}

function downloadJson() {
  const blob = new Blob([store.exportText()], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: 'morph-icons.json' });
  document.body.append(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 0);
}

function initDraftBar() {
  $('#downloadBtn').addEventListener('click', downloadJson);
  $('#copyJsonBtn').addEventListener('click', (e) => copyText(store.exportText(), e.currentTarget));
  $('#discardBtn').addEventListener('click', () => {
    if (confirm('Abandonner le brouillon ? Toutes les modifications locales seront perdues.')) store.discardDraft();
  });
}

// =============================================================================
// Brand icon: a small MorphDriver demo in the header
// =============================================================================

function initBrand() {
  const view = createIconView(store.published, { size: 22 });
  $('#brandIcon').append(view.el);
  const cycle = ['menu', 'cross', 'plus', 'arrow-right', 'chevron-right', 'check'].filter((n) => store.published.icons[n]);
  if (!cycle.length) return;
  const driver = new MorphDriver(store.published, cycle[0], (f) => view.paint(f));
  if (reduceMotion()) return;
  let i = 0;
  setInterval(() => {
    if (document.hidden) return;
    i = (i + 1) % cycle.length;
    driver.go(cycle[i]);
  }, 1800);
}

// =============================================================================
// Boot
// =============================================================================

async function main() {
  try {
    await store.load();
  } catch (err) {
    document.body.classList.add('load-failed');
    $('#loadError').hidden = false;
    $('#loadError').textContent = `Impossible de charger morph-icons.json (${err.message}). Cette page doit être servie en HTTP : GitHub Pages, ou « npm run serve » en local.`;
    return;
  }
  initBrand();
  pg.init();
  review.init();
  integration.init();
  initDraftBar();
  initEditor({
    onTest: (from, to) => {
      location.hash = '#playground';
      pg.setPair(from, to, true);
    },
  });
  renderStatus();

  store.on((kind) => {
    if (kind === 'live') return; // the editor repaints itself while dragging
    renderStatus();
    pg.refresh();
    review.build();
  });

  window.addEventListener('hashchange', route);
  route();
  document.body.classList.add('ready');
}

main();
