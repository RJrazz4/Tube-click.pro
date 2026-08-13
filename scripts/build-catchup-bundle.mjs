#!/usr/bin/env node
/**
 * Build SUPABASE_CATCHUP_GHOST_FULL.sql from SUPABASE_CATCHUP_GHOST.sql
 * plus the Ghost migrations, then harden the result so it survives
 * CLIENT-SIDE STATEMENT SPLITTING.
 *
 * WHY THE HARDENING EXISTS
 * ------------------------
 * The Supabase SQL Editor splits a script into statements before sending it.
 * The first bundle contained comment lines with a literal `$$` (they were
 * documenting the MP7 dollar-quote bug). A splitter counts those as real
 * dollar-quote delimiters, loses track of which function body it is inside,
 * and cuts a later `create function` in half. The tail
 *     select coalesce(rp.black_op_lane, false) into v_black from ...
 * then runs as top-level SQL, where v_black is not a plpgsql variable, so
 * Postgres parses it as a relation and reports:
 *     ERROR: 42P01: relation "v_black" does not exist
 *
 * That is why the file passed `psql -f` and single-query submission but
 * failed in the Editor: only the Editor splits.
 *
 * NOTE: this is NOT a forward-reference problem. plpgsql resolves function
 * calls at runtime, so the order of `create function` statements is
 * irrelevant. Reordering the script does not fix anything.
 *
 * Guarantees produced here:
 *   - every function body gets a unique tag ($fn001$ ...); zero bare `$$`
 *   - no comment line contains `$` or `;`
 *   - decorative dashed rules are shortened
 *
 * Run:  node scripts/build-catchup-bundle.mjs
 * Then: node scripts/build-catchup-bundle.mjs --check   (CI-friendly, no write)
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATE = join(ROOT, "SUPABASE_CATCHUP_GHOST.sql");
const OUT = join(ROOT, "SUPABASE_CATCHUP_GHOST_FULL.sql");
const MIGRATIONS = [
  "202608140001_ghost_intel_ledger.sql",
  "202608140002_ghost_interrogate_memory.sql",
  "202608140003_ghost_squad_briefs.sql",
  "202608140004_ghost_visual_recon.sql",
  "202608140005_ghost_dawn_patrol.sql",
];

const TAG_RE = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/;

/** Tokenise SQL into comment / string / dollar-body / code. */
function lex(s) {
  const out = [];
  let i = 0;
  while (i < s.length) {
    if (s.startsWith("--", i)) {
      let j = s.indexOf("\n", i);
      if (j < 0) j = s.length;
      out.push(["comment", s.slice(i, j)]);
      i = j;
      continue;
    }
    if (s.startsWith("/*", i)) {
      let j = s.indexOf("*/", i);
      j = j < 0 ? s.length : j + 2;
      out.push(["comment", s.slice(i, j)]);
      i = j;
      continue;
    }
    if (s[i] === "'") {
      let j = i + 1;
      while (j < s.length) {
        if (s[j] === "'" && s[j + 1] === "'") { j += 2; continue; }
        if (s[j] === "'") { j += 1; break; }
        j += 1;
      }
      out.push(["string", s.slice(i, j)]);
      i = j;
      continue;
    }
    const m = TAG_RE.exec(s.slice(i));
    if (m) {
      const tag = m[0];
      const bodyStart = i + tag.length;
      const close = s.indexOf(tag, bodyStart);
      if (close < 0) { out.push(["code", s.slice(i)]); break; }
      out.push(["dollar", [tag, s.slice(bodyStart, close)]]);
      i = close + tag.length;
      continue;
    }
    let j = i;
    while (j < s.length) {
      if (s.startsWith("--", j) || s.startsWith("/*", j) || s[j] === "'" || TAG_RE.test(s.slice(j))) break;
      j += 1;
    }
    out.push(["code", s.slice(i, j)]);
    i = j;
  }
  return out;
}

let counter = 0;
function harden(src) {
  return lex(src)
    .map(([kind, val]) => {
      if (kind === "comment") return val.replaceAll("$$", "<dollar-quote>").replaceAll(";", ".");
      if (kind === "string") return val;
      if (kind === "dollar") {
        const [, body] = val;
        counter += 1;
        const tag = `$fn${String(counter).padStart(3, "0")}$`;
        return tag + harden(body) + tag;
      }
      return val;
    })
    .join("");
}

function tidyComments(src) {
  return src
    .split("\n")
    .map((line) => {
      const st = line.trim();
      if (!st.startsWith("--")) return line;
      const body = st.slice(2).trim();
      const decorative = body.length > 8 && [...new Set(body)].every((c) => c === "-" || c === "~");
      if (decorative) return "-- " + "-".repeat(30);
      return line.replaceAll("$", "");
    })
    .join("\n");
}

function build() {
  counter = 0;
  const template = readFileSync(TEMPLATE, "utf8");
  const inline = MIGRATIONS.map((f) => {
    const body = readFileSync(join(ROOT, "supabase", "migrations", f), "utf8");
    return `-- ${"~".repeat(16)} BEGIN ${f} ${"~".repeat(16)}\n${body}\n-- ${"~".repeat(16)} END ${f} ${"~".repeat(16)}\n`;
  }).join("\n");

  const marker = "-- >>>>>>>>>>>>>>>>  PASTE THE FIVE MIGRATION FILES HERE";
  const start = template.indexOf(marker);
  if (start < 0) throw new Error("paste marker not found in " + TEMPLATE);
  const closeIdx = template.indexOf(">".repeat(40), start);
  const end = template.indexOf("\n", closeIdx) + 1;

  let out = template.slice(0, start) + inline + template.slice(end);
  out = out
    .replace("--  SUPABASE_CATCHUP_GHOST_FULL.sql already has them inlined for you)\n", "")
    .replace("-- (see SUPABASE_CATCHUP_STEPS.md — the generated bundle\n", "");

  return tidyComments(harden(out));
}

/** Split like a client would, honouring named dollar tags. */
function splitStatements(s) {
  const re = /\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$/y;
  const stmts = [];
  let cur = "", open = null, i = 0;
  while (i < s.length) {
    re.lastIndex = i;
    const m = re.exec(s);
    if (m) {
      if (open === null) open = m[0];
      else if (open === m[0]) open = null;
      cur += m[0];
      i += m[0].length;
      continue;
    }
    if (s[i] === ";" && open === null) { stmts.push(cur + ";"); cur = ""; i += 1; continue; }
    cur += s[i];
    i += 1;
  }
  if (cur.trim()) stmts.push(cur);
  return stmts;
}

function audit(sql) {
  const lines = sql.split("\n");
  const problems = [];
  if (sql.includes("$$")) problems.push("bare $$ present");
  for (const l of lines) {
    const st = l.trim();
    if (!st.startsWith("--")) continue;
    if (st.includes("$")) problems.push("comment contains $: " + st.slice(0, 60));
    if (st.includes(";")) problems.push("comment contains ;: " + st.slice(0, 60));
  }
  const stmts = splitStatements(sql);
  let orphans = 0;
  for (const f of stmts) {
    const core = f.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n").trim();
    if (!core) continue;
    if (!/^(create|do|alter|drop|grant|revoke|comment|begin|commit|select|insert|update|set)\b/i.test(core)) {
      orphans += 1;
      if (orphans <= 3) problems.push("orphan fragment: " + core.slice(0, 70).replace(/\n/g, " "));
    }
  }
  return { problems, fragments: stmts.length, orphans };
}

const sql = build();
const { problems, fragments, orphans } = audit(sql);

if (process.argv.includes("--check")) {
  const existing = readFileSync(OUT, "utf8");
  const drifted = existing !== sql;
  console.log(`fragments=${fragments} orphans=${orphans} drift=${drifted}`);
  problems.forEach((p) => console.log("  ! " + p));
  if (problems.length || drifted) {
    console.error(drifted ? "FAIL: bundle is stale, re-run without --check" : "FAIL: hardening audit failed");
    process.exit(1);
  }
  console.log("OK: bundle current and splitter-safe");
} else {
  if (problems.length) {
    problems.forEach((p) => console.error("  ! " + p));
    console.error("FAIL: refusing to write an unsafe bundle");
    process.exit(1);
  }
  writeFileSync(OUT, sql);
  console.log(`wrote ${OUT} (${sql.length} bytes) fragments=${fragments} orphans=${orphans}`);
}
