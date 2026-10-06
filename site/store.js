// site/store.js — icon data for the page: the published version + the local draft.
//
// The published version is ./morph-icons.json (what the apps embed). Designer
// edits go into a draft stored in localStorage, never published by the page
// itself: they're exported as a file, then committed to the repo.

import { validate } from '../dist/morph-core.js';

const DRAFT_KEY = 'morph-icons:draft';

export const store = {
  published: null,
  draft: null,
  listeners: new Set(),

  async load() {
    const res = await fetch('morph-icons.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`morph-icons.json: HTTP ${res.status}`);
    this.published = await res.json();
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) this.draft = JSON.parse(saved);
    } catch {
      this.draft = null;
    }
  },

  /** What the page displays: the draft if there is one, else the published version. */
  get data() {
    return this.draft ?? this.published;
  },

  get hasDraft() {
    return this.draft !== null;
  },

  /** The draft differs from the published version (ignoring the version number). */
  get isDirty() {
    if (!this.draft) return false;
    return formatData({ ...this.draft, version: 0 }) !== formatData({ ...this.published, version: 0 });
  },

  /** The draft was started from an older published version. */
  get isStale() {
    return this.draft !== null && this.draft.version !== this.published.version;
  },

  /** Persistent edit: creates the draft if needed, saves it, notifies. */
  edit(mutate) {
    if (!this.draft) this.draft = structuredClone(this.published);
    mutate(this.draft);
    this.save();
    this.emit('edit');
  },

  /** Live edit while dragging: no save, lightweight notification. Call commit() at the end. */
  editLive(mutate) {
    if (!this.draft) this.draft = structuredClone(this.published);
    mutate(this.draft);
    this.emit('live');
  },

  commit() {
    this.save();
    this.emit('edit');
  },

  replaceDraft(data) {
    this.draft = data;
    this.save();
    this.emit('edit');
  },

  discardDraft() {
    this.draft = null;
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {}
    this.emit('edit');
  },

  save() {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(this.draft));
    } catch {}
  },

  /** The file to commit: version bumped if anything changed. */
  exportText() {
    const out = structuredClone(this.data);
    out.version = this.isDirty ? this.published.version + 1 : this.published.version;
    return formatData(out);
  },

  errors() {
    return validate(this.data);
  },

  on(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  },

  emit(kind) {
    for (const l of this.listeners) l(kind);
  },
};

// ---- JSON formatting --------------------------------------------------------
// One line per group / icon / override: a designer's change shows up as a
// one-line diff on GitHub.

function inline(v) {
  if (Array.isArray(v)) return `[${v.map(inline).join(', ')}]`;
  if (v && typeof v === 'object') {
    const entries = Object.entries(v).filter(([, x]) => x !== undefined);
    return entries.length ? `{ ${entries.map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`).join(', ')} }` : '{}';
  }
  return JSON.stringify(v);
}

function block(obj) {
  const entries = Object.entries(obj ?? {});
  if (!entries.length) return '{}';
  return `{\n${entries.map(([k, v]) => `    ${JSON.stringify(k)}: ${inline(v)}`).join(',\n')}\n  }`;
}

export function formatData(d) {
  return (
    '{\n' +
    `  "version": ${d.version},\n` +
    `  "viewBox": ${d.viewBox},\n` +
    `  "strokeWidth": ${d.strokeWidth},\n` +
    `  "duration": ${d.duration},\n` +
    `  "groups": ${block(d.groups)},\n` +
    `  "icons": ${block(d.icons)},\n` +
    `  "overrides": ${block(d.overrides)}\n` +
    '}\n'
  );
}
