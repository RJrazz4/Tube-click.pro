#!/usr/bin/env node
/**
 * Phase G1 — Pre-push verification gates for TubeClick.Pro
 *
 *  Gate 1: api/*.ts relative imports must carry .js extensions (TS2835 guard)
 *  Gate 2: tsc --noEmit for tsconfig.api.json AND tsconfig.app.json
 *  Gate 3: vite production build        (skip with: node scripts/verify.mjs --skip-build)
 *  Gate 4: provider-leak scan of user-visible .tsx strings
 *          (WARN mode until Phase G2 cleanup ships; then it becomes a hard FAIL)
 *
 * Usage:  npm run verify  |  node scripts/verify.mjs [--skip-build] [--leak-warn]
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
let failures = 0, warnings = 0;
const ok   = (m) => console.log(`  ✅ ${m}`);
const bad  = (m) => { failures++; console.log(`  ❌ ${m}`); };
const warn = (m) => { warnings++; console.log(`  ⚠️  ${m}`); };
const run  = (cmd, args) => spawnSync(cmd, args, { cwd: ROOT, stdio: 'pipe', encoding: 'utf8' });

function walk(dir, filter, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (!['node_modules', 'dist', '.git'].includes(e.name)) walk(p, filter, out); }
    else if (filter(e.name)) out.push(p);
  }
  return out;
}

/* ---------------- Gate 1: .js extension on relative imports ---------------- */
console.log('\n[Gate 1] api/ import extensions (TS2835)');
const apiFiles = walk(join(ROOT, 'api'), (n) => n.endsWith('.ts'));
const FROM_RE = /from\s+['"](\.\.?\/[^'"]+)['"]/g;
let gate1Bad = 0;
for (const f of apiFiles) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(FROM_RE)) {
    const spec = m[1];
    if (spec.endsWith('.js') || spec.endsWith('.json')) continue;
    bad(`${f.slice(ROOT.length + 1)}: import "${spec}" missing .js extension`);
    gate1Bad++;
  }
}
if (!gate1Bad) ok(`${apiFiles.length} api files — every relative import carries .js`);

/* ---------------- Gate 2: TypeScript strict checks ---------------- */
console.log('\n[Gate 2] TypeScript strict checks');
if (!existsSync(join(ROOT, 'node_modules/typescript'))) {
  bad('typescript not installed — run `npm install` first');
} else {
  for (const cfg of ['tsconfig.api.json', 'tsconfig.app.json']) {
    const r = run('npx', ['tsc', '-p', cfg, '--noEmit']);
    if (r.status === 0) ok(`${cfg} — 0 errors`);
    else {
      const errs = (r.stdout + r.stderr).split('\n').filter((l) => l.includes('error TS')).slice(0, 10);
      bad(`${cfg}:\n    ${errs.join('\n    ')}`);
    }
  }
}

/* ---------------- Gate 3: vite production build ---------------- */
console.log('\n[Gate 3] Production build (vite)');
if (process.argv.includes('--skip-build')) {
  console.log('  ⏭️  skipped via --skip-build');
} else {
  const r = run('npm', ['run', 'build']);
  if (r.status === 0) ok('vite build passed');
  else bad(`vite build FAILED:\n${(r.stdout + r.stderr).slice(-1500)}`);
}

/* ---------------- Gate 4: provider-leak scan ---------------- */
console.log('\n[Gate 4] Provider-leak scan (.tsx user-facing strings)');
const BANNED = /pollinations|snapgen|fal\.ai|openrouter|gemini|deno|supabase edge|no api|api[\s-]?keys?|server maps/i;
const ALLOWED_FILES = ['src/pages/AdminPanel.tsx', 'src/pages/Privacy.tsx']; // G2 decision: AdminPanel keeps admin-only env names; Privacy lists data processors (legal requirement)
const WL_FILE = join(ROOT, 'scripts/verify-whitelist.txt');
const whitelist = existsSync(WL_FILE)
  ? readFileSync(WL_FILE, 'utf8').split('\n').map((s) => s.trim()).filter((s) => s && !s.startsWith('#'))
  : [];
const LIT_RE = /(["'`])((?:\\.|(?!\1).)*)\1/g;
const hits = [];
for (const f of walk(join(ROOT, 'src'), (n) => n.endsWith('.tsx'))) {
  const rel = f.slice(ROOT.length + 1);
  if (ALLOWED_FILES.includes(rel)) continue;
  readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    if (/^\s*(import\s|export\s+(type|\*))/.test(line)) return; // skip module wiring
    for (const m of line.matchAll(LIT_RE)) {
      const str = m[2];
      if (str.length > 1 && BANNED.test(str)) {
        const id = `${rel}:${i + 1}`;
        if (!whitelist.includes(id)) hits.push(`${id}  "${str.slice(0, 72)}${str.length > 72 ? '…' : ''}"`);
      }
    }
  });
}
const leakFail = !process.argv.includes('--leak-warn'); // hard FAIL by default since Phase G2
if (hits.length) {
  const header = `${hits.length} provider-term string(s) found ${leakFail ? '(FAIL — Gate 4 enforced since Phase G2)' : '(WARN — --leak-warn override)'}`;
  (leakFail ? bad : warn)(`${header}:\n    ${hits.slice(0, 14).join('\n    ')}`);
} else ok('no provider terms in .tsx user-facing strings');

/* ---------------- summary ---------------- */
console.log(`\n${'='.repeat(56)}\nRESULT: ${failures} failed gate(s), ${warnings} warning(s)\n${'='.repeat(56)}`);
process.exit(failures ? 1 : 0);
