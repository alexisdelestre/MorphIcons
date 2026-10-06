// scripts/typecheck.mjs — typechecks the React and React Native components
// exactly as a dev would use them: the 3 files copied into one folder, strict
// TypeScript. React Native gets no DOM types, like its official template.
//
//   npm install --legacy-peer-deps --ignore-scripts   (once; dev dependencies)
//   npm run typecheck

import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'package.json'));
const tsc = require.resolve('typescript/bin/tsc');
// Inside node_modules so the type packages resolve from the repo.
const work = join(root, 'node_modules', '.morph-typecheck');

const usage = {
  web: `
import { useState } from 'react';
import MorphIcon, { type MorphIconName } from './MorphIcon';
export function MenuButton() {
  const [open, setOpen] = useState(false);
  const name: MorphIconName = open ? 'cross' : 'menu';
  return (
    <button onClick={() => setOpen(!open)} aria-label="Menu">
      <MorphIcon name={name} className="icon" style={{ color: 'red' }} size={32} duration={300} title="Menu" />
    </button>
  );
}`,
  native: `
import { useState } from 'react';
import { Pressable } from 'react-native';
import MorphIcon from './MorphIcon';
export function MenuButton() {
  const [open, setOpen] = useState(false);
  return (
    <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityLabel="Menu">
      <MorphIcon name={open ? 'cross' : 'menu'} color="#111" size={28} />
    </Pressable>
  );
}`,
};

const common = {
  strict: true,
  noEmit: true,
  jsx: 'react-jsx',
  module: 'esnext',
  moduleResolution: 'bundler',
  resolveJsonModule: true,
  esModuleInterop: true,
  skipLibCheck: true,
  noUnusedLocals: true,
  noUnusedParameters: true,
  isolatedModules: true,
  target: 'es2019',
};

const targets = [
  { name: 'web', component: 'platforms/react/MorphIcon.tsx', options: { lib: ['es2019', 'dom', 'dom.iterable'] } },
  { name: 'native', component: 'platforms/react-native/MorphIcon.tsx', options: { lib: ['es2019'], types: ['react-native'] } },
];

rmSync(work, { recursive: true, force: true });
let failed = false;
for (const t of targets) {
  const dir = join(work, t.name);
  mkdirSync(dir, { recursive: true });
  copyFileSync(join(root, t.component), join(dir, 'MorphIcon.tsx'));
  copyFileSync(join(root, 'core/morph-core.ts'), join(dir, 'morph-core.ts'));
  copyFileSync(join(root, 'morph-icons.json'), join(dir, 'morph-icons.json'));
  writeFileSync(join(dir, 'Usage.tsx'), usage[t.name]);
  const config = join(work, `tsconfig.${t.name}.json`);
  writeFileSync(config, JSON.stringify({ compilerOptions: { ...common, ...t.options }, include: [t.name] }));
  try {
    execFileSync(process.execPath, [tsc, '-p', config], { stdio: 'inherit' });
    console.log(`${t.component}: OK`);
  } catch {
    console.error(`${t.component}: type errors (above)`);
    failed = true;
  }
}
rmSync(work, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
