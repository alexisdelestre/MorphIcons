// site/editor.js — icon editor: drag the endpoints, hide lines, manage groups.
// Every edit goes to the local draft (store.edit); nothing is published from here.

import { frameOf, restState } from '../dist/morph-core.js';
import { store } from './store.js';
import { iconThumb, svgEl, SLOT_COLORS } from './render.js';

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

const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DEFAULT_LINE = [8, 12, 16, 12];

const ed = {
  selected: null,
  line: null,
  snap: 0.5,
  drag: null,
  canvas: null,
  onTest: () => {},
};

// ---- Data helpers (always work on the object passed in: draft or published) ----

/** The editable lines of an icon: its own, or its group's template. */
function rawLines(d, name) {
  const def = d.icons[name];
  return def.group ? d.groups[def.group] : def.lines;
}

function groupMembers(d, group) {
  return Object.keys(d.icons).filter((n) => d.icons[n].group === group);
}

const round = (v) => Math.round(v * 100) / 100;

function rotateRaw(raw, deg, c) {
  if (raw === null || !deg) return raw && raw.slice();
  const r = (deg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const p = (x, y) => [round(c + (x - c) * cos - (y - c) * sin), round(c + (x - c) * sin + (y - c) * cos)];
  return [...p(raw[0], raw[1]), ...p(raw[2], raw[3])];
}

/** Lines of `name` as an independent icon (group rotation baked in). */
function standaloneLines(d, name) {
  const def = d.icons[name];
  const c = d.viewBox / 2;
  return rawLines(d, name).map((l) => rotateRaw(l, def.rotation ?? 0, c));
}

function changedFromPublished(name) {
  if (!store.hasDraft) return false;
  const pub = store.published;
  if (!pub.icons[name]) return true;
  const sig = (d) => JSON.stringify([d.icons[name], d.icons[name].group ? d.groups[d.icons[name].group] : null]);
  return sig(store.draft) !== sig(pub);
}

function uniqueName(base, taken) {
  let name = base;
  let i = 2;
  while (taken.has(name)) name = `${base}-${i++}`;
  return name;
}

// ---- Rendering ---------------------------------------------------------------------

function renderAll() {
  const d = store.data;
  if (!ed.selected || !d.icons[ed.selected]) ed.selected = Object.keys(d.icons)[0];
  renderList();
  renderCanvas();
  renderProps();
  renderErrors();
}

function renderErrors() {
  const errors = store.errors();
  const box = $('#edErrors');
  box.hidden = errors.length === 0;
  box.replaceChildren(h('b', {}, 'À corriger avant l’export :'), h('ul', {}, errors.map((e) => h('li', {}, e))));
}

function renderList() {
  const d = store.data;
  $('#edList').replaceChildren(
    ...Object.keys(d.icons).map((n) =>
      h(
        'li',
        {},
        h(
          'button',
          {
            class: `ed-item${n === ed.selected ? ' active' : ''}`,
            onclick: () => {
              ed.selected = n;
              ed.line = null;
              renderAll();
            },
          },
          iconThumb(d, n, 22),
          h('span', { class: 'ed-item-name' }, n),
          d.icons[n].group ? h('span', { class: 'tag' }, `${d.icons[n].group} ${d.icons[n].rotation ?? 0}°`) : null,
          changedFromPublished(n) ? h('span', { class: 'dot', title: 'Modifié dans le brouillon' }) : null,
        ),
      ),
    ),
  );
}

function renderCanvas() {
  const d = store.data;
  const vb = d.viewBox;
  const pad = 2;
  const svg = svgEl('svg', {
    viewBox: `${-pad} ${-pad} ${vb + 2 * pad} ${vb + 2 * pad}`,
    class: 'ed-svg',
    'stroke-linecap': 'round',
    fill: 'none',
  });
  // Grid: 1 unit, a stronger line every 4, the center, the 2-unit margin.
  const grid = svgEl('g', { class: 'ed-grid' }, svg);
  for (let i = 0; i <= vb; i++) {
    const cls = i === vb / 2 ? 'g-center' : i % 4 === 0 ? 'g-major' : 'g-minor';
    svgEl('line', { x1: i, y1: 0, x2: i, y2: vb, class: cls }, grid);
    svgEl('line', { x1: 0, y1: i, x2: vb, y2: i, class: cls }, grid);
  }
  svgEl('rect', { x: 2, y: 2, width: vb - 4, height: vb - 4, class: 'g-safe' }, grid);

  const lines = rawLines(d, ed.selected);
  const body = svgEl('g', {}, svg);
  const handles = svgEl('g', {}, svg);
  lines.forEach((l, k) => {
    const color = SLOT_COLORS[k];
    if (l === null) {
      const ring = svgEl('circle', { cx: vb / 2, cy: vb / 2, r: 1.1 + k * 0.45, stroke: color, 'stroke-width': 0.15, 'stroke-dasharray': '0.4 0.35', class: 'ed-hidden' }, body);
      ring.addEventListener('pointerdown', () => select(k));
      return;
    }
    const [x1, y1, x2, y2] = l;
    if (ed.line === k) svgEl('line', { x1, y1, x2, y2, stroke: color, 'stroke-width': d.strokeWidth + 1.4, opacity: 0.22 }, body);
    svgEl('line', { x1, y1, x2, y2, stroke: 'currentColor', 'stroke-width': d.strokeWidth }, body);
    const hit = svgEl('line', { x1, y1, x2, y2, stroke: 'transparent', 'stroke-width': Math.max(2.4, d.strokeWidth + 1), class: 'ed-hit' }, body);
    hit.addEventListener('pointerdown', (e) => startDrag(e, k, 'line'));
    const start = svgEl('circle', { cx: x1, cy: y1, r: 0.7, fill: color, class: 'ed-handle' }, handles);
    const end = svgEl('circle', { cx: x2, cy: y2, r: 0.62, fill: 'var(--surface)', stroke: color, 'stroke-width': 0.35, class: 'ed-handle' }, handles);
    start.addEventListener('pointerdown', (e) => startDrag(e, k, 'start'));
    end.addEventListener('pointerdown', (e) => startDrag(e, k, 'end'));
  });

  svg.addEventListener('pointermove', onDragMove);
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);
  ed.canvas = svg;
  $('#edCanvas').replaceChildren(svg);

  const def = d.icons[ed.selected];
  $('#edTitle').textContent = ed.selected;
  $('#edGroupNote').textContent = def.group
    ? `Modèle du groupe « ${def.group} » (affiché à 0°) — ce picto l’utilise tourné de ${def.rotation ?? 0}°.`
    : def.rotation
      ? `Affiché sans sa rotation de ${def.rotation}°.`
      : '';
}

function select(k) {
  ed.line = k;
  renderCanvas();
  renderProps();
}

// ---- Dragging --------------------------------------------------------------------

function toSvg(e) {
  const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ed.canvas.getScreenCTM().inverse());
  return [pt.x, pt.y];
}

function snap(v) {
  const vb = store.data.viewBox;
  const s = ed.snap > 0 ? Math.round(v / ed.snap) * ed.snap : round(v);
  return Math.min(vb, Math.max(0, round(s)));
}

function startDrag(e, k, part) {
  e.preventDefault();
  e.stopPropagation();
  ed.canvas.setPointerCapture(e.pointerId);
  ed.line = k;
  ed.drag = { k, part, origin: toSvg(e), orig: rawLines(store.data, ed.selected)[k].slice() };
  renderCanvas();
  ed.canvas.setPointerCapture(e.pointerId);
}

function onDragMove(e) {
  if (!ed.drag) return;
  const [px, py] = toSvg(e);
  const { k, part, origin, orig } = ed.drag;
  let next;
  if (part === 'start') next = [snap(px), snap(py), orig[2], orig[3]];
  else if (part === 'end') next = [orig[0], orig[1], snap(px), snap(py)];
  else {
    const dx = snap(px - origin[0] + orig[0]) - orig[0];
    const dy = snap(py - origin[1] + orig[1]) - orig[1];
    next = [snap(orig[0] + dx), snap(orig[1] + dy), snap(orig[2] + dx), snap(orig[3] + dy)];
  }
  const current = rawLines(store.data, ed.selected)[k];
  if (current && next.every((v, i) => v === current[i])) return;
  store.editLive((d) => {
    rawLines(d, ed.selected)[k] = next;
  });
  renderCanvas();
  syncLineInputs();
}

function endDrag() {
  if (!ed.drag) return;
  ed.drag = null;
  store.commit();
}

// ---- Properties panel --------------------------------------------------------------

function syncLineInputs() {
  const lines = rawLines(store.data, ed.selected);
  document.querySelectorAll('[data-coord]').forEach((input) => {
    const [k, i] = input.dataset.coord.split(':').map(Number);
    if (lines[k] && document.activeElement !== input) input.value = lines[k][i];
  });
}

function renderProps() {
  const d = store.data;
  const name = ed.selected;
  const def = d.icons[name];
  const lines = rawLines(d, name);
  const panel = $('#edProps');

  const nameInput = h('input', { type: 'text', value: name, spellcheck: 'false', 'aria-label': 'Nom du picto' });
  nameInput.addEventListener('change', () => rename(name, nameInput.value.trim()));

  const typeSection = def.group
    ? h(
        'div',
        { class: 'prop-block' },
        h('p', {}, 'Membre du groupe de rotation ', h('code', {}, def.group), '. Modifier ses lignes modifie aussi : ', groupMembers(d, def.group).filter((n) => n !== name).join(', ') || '(aucun autre)', '.'),
        h(
          'label',
          { class: 'inline' },
          'Rotation ',
          h('input', {
            type: 'number',
            step: '15',
            value: def.rotation ?? 0,
            class: 'num',
            onchange: (e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) store.edit((x) => (x.icons[name].rotation = v));
            },
          }),
          ' °',
        ),
        h(
          'div',
          { class: 'row-actions' },
          h('button', { class: 'btn btn-small', onclick: () => addRotatedVariant(name) }, '+ Variante tournée'),
          h('button', { class: 'btn btn-small btn-ghost', onclick: () => detach(name) }, 'Détacher du groupe'),
        ),
      )
    : h(
        'div',
        { class: 'prop-block' },
        h('p', {}, 'Picto indépendant. Pour des pictos qui sont la même forme tournée (flèches, chevrons…), créez un groupe : ils tourneront au lieu de se déformer.'),
        h('div', { class: 'row-actions' }, h('button', { class: 'btn btn-small', onclick: () => makeGroup(name) }, 'Créer un groupe de rotation')),
      );

  const lineRows = lines.map((l, k) =>
    h(
      'div',
      { class: `line-row${ed.line === k ? ' active' : ''}`, onclick: () => ed.line !== k && select(k) },
      h('span', { class: 'swatch', style: `background:${SLOT_COLORS[k]}` }),
      h('span', { class: 'line-label' }, `Ligne ${k + 1}`),
      l === null
        ? h('span', { class: 'line-hidden' }, 'masquée (point invisible au centre)')
        : h(
            'span',
            { class: 'coords' },
            ['x1', 'y1', 'x2', 'y2'].map((label, i) =>
              h(
                'label',
                {},
                h('span', {}, label),
                h('input', {
                  type: 'number',
                  step: '0.5',
                  value: l[i],
                  class: 'num',
                  'data-coord': `${k}:${i}`,
                  onchange: (e) => setCoord(k, i, e.target.value),
                }),
              ),
            ),
          ),
      h(
        'span',
        { class: 'line-actions' },
        h('button', { class: 'btn btn-small', onclick: () => toggleLine(k) }, l === null ? 'Afficher' : 'Masquer'),
        l === null ? null : h('button', { class: 'btn btn-small btn-ghost', title: 'Échange début et fin', onclick: () => reverseLine(k) }, '⇄'),
      ),
    ),
  );

  const others = Object.keys(d.icons).filter((n) => n !== name);
  const testSel = h('select', { 'aria-label': 'Picto cible' }, others.map((n) => h('option', { value: n }, n)));

  panel.replaceChildren(
    h('div', { class: 'prop-block' }, h('label', { class: 'stack' }, h('span', { class: 'prop-label' }, 'Nom'), nameInput)),
    typeSection,
    h('div', { class: 'prop-block' }, h('span', { class: 'prop-label' }, 'Lignes'), ...lineRows, h('p', { class: 'hint' }, '● début, ○ fin. L’ordre et le sens des lignes n’ont pas d’effet sur les transitions automatiques ; ils servent seulement aux corrections manuelles.')),
    h(
      'div',
      { class: 'prop-block' },
      h('span', { class: 'prop-label' }, 'Tester'),
      h('div', { class: 'row-actions' }, testSel, h('button', { class: 'btn btn-small btn-primary', onclick: () => ed.onTest(name, testSel.value) }, 'Voir la transition')),
    ),
    h('div', { class: 'prop-block danger' }, h('button', { class: 'btn btn-small btn-danger', onclick: () => remove(name) }, 'Supprimer ce picto')),
  );
}

// ---- Edit actions ------------------------------------------------------------------

function setCoord(k, i, value) {
  const v = Number(value);
  if (!Number.isFinite(v)) return renderProps();
  store.edit((d) => {
    const l = rawLines(d, ed.selected);
    l[k] = l[k].slice();
    l[k][i] = round(v);
  });
}

function toggleLine(k) {
  ed.line = k;
  store.edit((d) => {
    const l = rawLines(d, ed.selected);
    l[k] = l[k] === null ? DEFAULT_LINE.slice() : null;
  });
}

function reverseLine(k) {
  store.edit((d) => {
    const l = rawLines(d, ed.selected);
    const [x1, y1, x2, y2] = l[k];
    l[k] = [x2, y2, x1, y1];
  });
}

function rename(from, to) {
  if (to === from) return;
  const d = store.data;
  if (!NAME_RE.test(to)) {
    alert('Nom invalide : minuscules, chiffres et tirets uniquement (ex. « arrow-up-right »).');
    return renderProps();
  }
  if (d.icons[to]) {
    alert(`Le nom « ${to} » est déjà pris.`);
    return renderProps();
  }
  if (!confirm(`Renommer « ${from} » en « ${to} » ?\nLes développeurs devront mettre à jour leur code s’ils utilisent ce nom.`)) return renderProps();
  ed.selected = to;
  store.edit((x) => {
    x.icons = Object.fromEntries(Object.entries(x.icons).map(([k, v]) => [k === from ? to : k, v]));
    if (x.overrides) {
      x.overrides = Object.fromEntries(
        Object.entries(x.overrides).map(([key, v]) => [key.split('>').map((n) => (n === from ? to : n)).join('>'), v]),
      );
    }
  });
}

function remove(name) {
  const d = store.data;
  if (Object.keys(d.icons).length <= 1) return alert('Impossible de supprimer le dernier picto.');
  if (!confirm(`Supprimer « ${name} » ?\nLes apps qui l’utilisent afficheront une erreur après la mise à jour du JSON.`)) return;
  ed.selected = null;
  store.edit((x) => {
    const group = x.icons[name].group;
    delete x.icons[name];
    if (group && groupMembers(x, group).length === 0) delete x.groups[group];
    for (const key of Object.keys(x.overrides ?? {})) if (key.split('>').includes(name)) delete x.overrides[key];
  });
}

function makeGroup(name) {
  const d = store.data;
  const group = uniqueName(name, new Set(Object.keys(d.groups)));
  store.edit((x) => {
    const def = x.icons[name];
    x.groups[group] = def.lines.map((l) => l && l.slice());
    x.icons[name] = { group, rotation: def.rotation ?? 0 };
  });
}

function addRotatedVariant(name) {
  const d = store.data;
  const def = d.icons[name];
  const proposed = uniqueName(`${name}-${((def.rotation ?? 0) + 90) % 360}`, new Set(Object.keys(d.icons)));
  const newName = prompt('Nom de la variante (minuscules, chiffres, tirets) :', proposed)?.trim();
  if (!newName) return;
  if (!NAME_RE.test(newName) || d.icons[newName]) return alert('Nom invalide ou déjà pris.');
  const rotation = Number(prompt('Rotation en degrés (sens horaire) :', String(((def.rotation ?? 0) + 90) % 360)));
  if (!Number.isFinite(rotation)) return;
  ed.selected = newName;
  store.edit((x) => {
    x.icons[newName] = { group: def.group, rotation };
  });
}

function detach(name) {
  const d = store.data;
  const lines = standaloneLines(d, name);
  store.edit((x) => {
    const group = x.icons[name].group;
    x.icons[name] = { lines };
    if (groupMembers(x, group).length === 0) delete x.groups[group];
  });
}

function createIcon(name, from) {
  const d = store.data;
  if (!NAME_RE.test(name)) return alert('Nom invalide : minuscules, chiffres et tirets uniquement.');
  if (d.icons[name]) return alert(`Le nom « ${name} » est déjà pris.`);
  const lines = from ? standaloneLines(d, from) : [[4, 12, 20, 12], null, null];
  ed.selected = name;
  ed.line = null;
  store.edit((x) => {
    x.icons[name] = { lines };
  });
}

// ---- Static parts ------------------------------------------------------------------

function renderNewForm() {
  const d = store.data;
  const nameInput = h('input', { type: 'text', placeholder: 'ex. arrow-up-right', spellcheck: 'false' });
  const fromSel = h('select', {}, h('option', { value: '' }, 'Vierge'), Object.keys(d.icons).map((n) => h('option', { value: n }, `Copie de ${n}`)));
  const form = h(
    'form',
    {
      class: 'ed-new',
      onsubmit: (e) => {
        e.preventDefault();
        createIcon(nameInput.value.trim(), fromSel.value || null);
        $('#edNew').hidden = true;
      },
    },
    h('label', { class: 'stack' }, h('span', { class: 'prop-label' }, 'Nom'), nameInput),
    h('label', { class: 'stack' }, h('span', { class: 'prop-label' }, 'Partir de'), fromSel),
    h('div', { class: 'row-actions' }, h('button', { class: 'btn btn-small btn-primary', type: 'submit' }, 'Créer'), h('button', { class: 'btn btn-small btn-ghost', type: 'button', onclick: () => ($('#edNew').hidden = true) }, 'Annuler')),
  );
  $('#edNew').replaceChildren(form);
  $('#edNew').hidden = false;
  nameInput.focus();
}

function renderSettings() {
  const d = store.data;
  $('#edDuration').value = d.duration;
  $('#edStroke').value = d.strokeWidth;
}

export function initEditor({ onTest }) {
  ed.onTest = onTest;
  $('#newIconBtn').addEventListener('click', renderNewForm);
  $('#snapSel').addEventListener('change', (e) => (ed.snap = Number(e.target.value)));
  $('#edDuration').addEventListener('change', (e) => {
    const v = Math.round(Number(e.target.value));
    if (Number.isFinite(v) && v >= 50) store.edit((x) => (x.duration = v));
    else renderSettings();
  });
  $('#edStroke').addEventListener('change', (e) => {
    const v = Number(e.target.value);
    if (Number.isFinite(v) && v > 0) store.edit((x) => (x.strokeWidth = v));
    else renderSettings();
  });
  $('#importInput').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch {
      return alert('Ce fichier n’est pas un JSON valide.');
    }
    const { validate } = await import('../dist/morph-core.js');
    const errors = validate(data);
    if (errors.length) return alert(`Fichier refusé :\n${errors.slice(0, 8).join('\n')}`);
    if (store.hasDraft && store.isDirty && !confirm('Remplacer votre brouillon actuel par ce fichier ?')) return;
    store.replaceDraft(data);
  });
  store.on((kind) => {
    if (kind !== 'edit') return;
    renderAll();
    renderSettings();
  });
  renderAll();
  renderSettings();
}

// Keep frameOf/restState imported for future previews without a lint warning.
void frameOf;
void restState;
