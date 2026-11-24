#!/usr/bin/env node

// cli/src/index.ts
import { homedir } from "node:os";
import { createInterface } from "node:readline/promises";
import { basename, dirname, join as join5, resolve as resolve2 } from "node:path";
import { mkdirSync as mkdirSync2, readFileSync as readFileSync6, realpathSync, writeFileSync as writeFileSync4 } from "node:fs";
import { fileURLToPath } from "node:url";

// cli/src/config.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
var DEFAULT_APP_URL = "https://validai.lukantan.com";
function configPath(home) {
  return join(home, ".validai", "config.json");
}
function readFileConfig(home) {
  try {
    const raw = JSON.parse(readFileSync(configPath(home), "utf-8"));
    return { token: raw.token ?? null, appUrl: raw.appUrl };
  } catch {
    return { token: null, appUrl: void 0 };
  }
}
function loadConfig(argv, env, home) {
  const file = readFileConfig(home);
  const token = env.VALIDAI_TOKEN || file.token || null;
  const appUrl = argv.url || env.VALIDAI_URL || file.appUrl || DEFAULT_APP_URL;
  return { token, appUrl };
}
function saveConfig(token, appUrl, home) {
  const dir = join(home, ".validai");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 448 });
  writeFileSync(configPath(home), JSON.stringify({ token, appUrl }, null, 2), { mode: 384 });
}

// cli/src/project.ts
import { readFileSync as readFileSync2, writeFileSync as writeFileSync2 } from "node:fs";
import { join as join2 } from "node:path";
function refPath(cwd) {
  return join2(cwd, ".validai.json");
}
function readProjectRef(cwd) {
  try {
    const raw = JSON.parse(readFileSync2(refPath(cwd), "utf-8"));
    if (typeof raw.prototypeId === "string" && raw.prototypeId) {
      return { prototypeId: raw.prototypeId, name: raw.name ?? "" };
    }
    return null;
  } catch {
    return null;
  }
}
function writeProjectRef(cwd, ref) {
  writeFileSync2(refPath(cwd), JSON.stringify(ref, null, 2) + "\n");
}

// cli/src/bundle.ts
import { existsSync as existsSync2, readdirSync, readFileSync as readFileSync3, statSync } from "node:fs";
import { join as join3, relative, sep } from "node:path";

// src/shared/pathToken.ts
function isReservedBundlePath(relPath) {
  return relPath.split("/").some((seg) => seg.startsWith("~"));
}

// src/shared/rootAbsoluteRefs.ts
var MAX_LISTED = 5;
var TAG = /<([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
var URL_ATTR = /(?<![\w:-])(src|href|poster|srcset|style)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi;
var NAVIGATION_TAGS = /* @__PURE__ */ new Set(["a", "base"]);
var CSS_URL = /url\(\s*(["']?)([^"')]*?)\1\s*\)/gi;
var CSS_IMPORT_STRING = /@import\s+(["'])([^"']*)\1/gi;
var isRootAbsolute = (value) => value.startsWith("/") && !value.startsWith("//");
function findRootAbsoluteCssRefs(css) {
  const text = css.replace(/\/\*[\s\S]*?(?:\*\/|$)/g, " ");
  const found = [];
  for (const re of [CSS_URL, CSS_IMPORT_STRING]) {
    for (const m of text.matchAll(re)) {
      const ref = m[2].trim();
      if (isRootAbsolute(ref)) found.push({ at: m.index ?? 0, ref });
    }
  }
  found.sort((a, b) => a.at - b.at);
  return [...new Set(found.map((f) => f.ref))];
}
function srcsetUrls(srcset) {
  return srcset.split(/,(?=\s|\/|\.|[a-zA-Z])/).map((candidate) => candidate.trim().split(/\s+/)[0]).filter(Boolean);
}
function findRootAbsoluteRefs(html) {
  const found = /* @__PURE__ */ new Set();
  const add = (ref) => {
    if (isRootAbsolute(ref)) found.add(ref);
  };
  const text = html.replace(/<!--[\s\S]*?(?:-->|$)/g, " ").replace(/(<script\b(?:[^>"']|"[^"]*"|'[^']*')*>)[\s\S]*?(?:<\/script\s*>|$)/gi, "$1");
  for (const tag of text.matchAll(TAG)) {
    const name = tag[1].toLowerCase();
    for (const attr of tag[2].matchAll(URL_ATTR)) {
      const attrName = attr[1].toLowerCase();
      const value = attr[2] ?? attr[3] ?? attr[4] ?? "";
      if (attrName === "href" && NAVIGATION_TAGS.has(name)) continue;
      if (attrName === "srcset") srcsetUrls(value).forEach(add);
      else if (attrName === "style") findRootAbsoluteCssRefs(value).forEach(add);
      else add(value.trim());
    }
    if (name === "style") {
      const from = (tag.index ?? 0) + tag[0].length;
      const close = text.slice(from).search(/<\/style\s*>/i);
      findRootAbsoluteCssRefs(close === -1 ? text.slice(from) : text.slice(from, from + close)).forEach(add);
    }
  }
  return [...found];
}
function bundleRootAbsoluteWarning(files) {
  const scanned = [
    ...files.filter((f) => f.path === "index.html").map((f) => ({ path: f.path, refs: findRootAbsoluteRefs(f.text) })),
    ...files.filter((f) => /\.css$/i.test(f.path)).sort((a, b) => a.path.localeCompare(b.path)).map((f) => ({ path: f.path, refs: findRootAbsoluteCssRefs(f.text) }))
  ].filter((s) => s.refs.length > 0);
  if (scanned.length === 0) return null;
  const refs = [...new Set(scanned.flatMap((s) => s.refs))];
  const shown = refs.slice(0, MAX_LISTED).join(", ");
  const more = refs.length > MAX_LISTED ? ` (+${refs.length - MAX_LISTED} more)` : "";
  const sources = scanned.map((s) => s.path);
  const shownSources = sources.length <= 3 ? sources.join(sources.length === 2 ? " and " : ", ") : `${sources.slice(0, 2).join(", ")} and ${sources.length - 2} more files`;
  const verb = sources.length === 1 ? "loads" : "load";
  return `${shownSources} ${verb} ${shown}${more} from the site root; root-absolute paths don't load in ValidAI. Use relative paths (for Vite, set base: './' and rebuild).`;
}

// cli/src/bundle.ts
var MAX_FILE = 10 * 1024 * 1024;
var MAX_TOTAL = 50 * 1024 * 1024;
function isDir(path) {
  return existsSync2(path) && statSync(path).isDirectory();
}
function looksLikeProjectRoot(dir) {
  if (existsSync2(join3(dir, "validai-flows.json")) || existsSync2(join3(dir, ".validai.json"))) return true;
  if (!existsSync2(join3(dir, "package.json")) || !isDir(join3(dir, "src"))) return false;
  const index = join3(dir, "index.html");
  if (!existsSync2(index)) return true;
  const html = readFileSync3(index, "utf-8");
  return /\bsrc\s*=\s*["']?\/?src\//i.test(html) || /\bsrc\s*=\s*["']?[^"'\s>]+\.(?:tsx?|jsx|mts)(?:[?#"'\s>]|$)/i.test(html);
}
function resolveBundleDir(explicit, cwd, opts = {}) {
  let dir;
  if (explicit) {
    dir = join3(cwd, explicit);
    if (!isDir(dir)) throw new Error(`Directory not found: ${explicit}`);
  } else {
    dir = ["dist", "build", "out"].map((c) => join3(cwd, c)).find(isDir);
    if (!dir) {
      throw new Error("No build output found (looked for dist/, build/, out/). Build your prototype first, or pass a directory.");
    }
  }
  if (!opts.allowRoot && looksLikeProjectRoot(dir)) {
    throw new Error(
      `${explicit ?? relative(cwd, dir)} looks like your project folder, not its build output (it has validai-flows.json/.validai.json, or package.json and src/ but no built index.html), and testers can download every file in the bundle. Build the prototype (e.g. \`npm run build\`) and pass the output folder (usually dist/); for a static prototype, copy only the files the page loads into dist/. If this folder really holds only what testers should load, pass --allow-root.`
    );
  }
  return dir;
}
var HELPER_FILES = /* @__PURE__ */ new Set(["validai-flows.json", "validai-share.mjs", "AGENTS.md", "validai-dryrun.json"]);
function excludedDir(name) {
  return name.startsWith(".") && name !== ".well-known" || name === "node_modules";
}
function excludedFile(name, allowSourceMaps) {
  if (name.startsWith(".")) return true;
  if (/\.(?:validai|pem|key)$/i.test(name)) return true;
  if (!allowSourceMaps && /\.map$/i.test(name)) return true;
  return HELPER_FILES.has(name);
}
function walk(dir, base, acc, skipped, allowSourceMaps) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join3(dir, entry.name);
    const rel = relative(base, full).split(sep).join("/");
    if (entry.isDirectory()) {
      if (excludedDir(entry.name)) skipped.push(`${rel}/`);
      else walk(full, base, acc, skipped, allowSourceMaps);
    } else if (entry.isFile()) {
      if (excludedFile(entry.name, allowSourceMaps)) skipped.push(rel);
      else acc.push(full);
    }
  }
}
function collectBundle(dir, opts = {}) {
  const absFiles = [];
  walk(dir, dir, absFiles, opts.skipped ?? [], opts.allowSourceMaps === true);
  const files = [];
  let total = 0;
  for (const abs of absFiles) {
    const rel = relative(dir, abs).split(sep).join("/");
    if (isReservedBundlePath(rel)) {
      throw new Error(`${rel}: names starting with "~" are reserved by ValidAI; rename it before uploading.`);
    }
    const size = statSync(abs).size;
    if (size > MAX_FILE) {
      throw new Error(`File exceeds the 10 MB limit: ${rel}`);
    }
    total += size;
    if (total > MAX_TOTAL) {
      throw new Error(`Bundle is ${Math.round(total / 1024 / 1024)} MB, over the 50 MB limit.`);
    }
    files.push({ path: rel, contentBase64: readFileSync3(abs).toString("base64") });
  }
  if (!files.some((f) => f.path === "index.html")) {
    throw new Error("No index.html at the bundle root \u2014 the build output must contain index.html.");
  }
  return files;
}
function describeSkipped(skipped) {
  if (skipped.length === 0) return null;
  const shown = skipped.slice(0, 8).join(", ");
  const more = skipped.length > 8 ? `, \u2026 (+${skipped.length - 8} more)` : "";
  return `Left out ${skipped.length} ${skipped.length === 1 ? "file" : "files/folders"} (hidden, secrets, packages, source maps, ValidAI files): ${shown}${more}`;
}
function describeRootAbsolute(files) {
  return bundleRootAbsoluteWarning(
    files.filter((f) => f.path === "index.html" || /\.css$/i.test(f.path)).map((f) => ({ path: f.path, text: Buffer.from(f.contentBase64, "base64").toString("utf-8") }))
  );
}

// cli/src/version.ts
var HELPER_VERSION = true ? "2026.11.24" : "dev";
var CLIENT_HEADER = { "X-ValidAI-Client": `validai-share/${HELPER_VERSION}` };

// cli/src/api.ts
var AUTH_HELP = "Your ValidAI CLI token is missing or was revoked. Generate a new one in ValidAI \u2192 Settings \u2192 CLI token, then run `validai-share login` (or set VALIDAI_TOKEN).";
var ImportError = class extends Error {
  constructor(message, warnings = [], skillNotice) {
    super(message);
    this.warnings = warnings;
    this.skillNotice = skillNotice;
    this.name = "ImportError";
  }
  warnings;
  skillNotice;
};
async function errorBody(res) {
  if (res.status === 401) return { message: AUTH_HELP, warnings: [] };
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  const message = data && Array.isArray(data.errors) && data.errors.length > 0 ? data.errors.join("; ") : data?.error || `Request failed with status ${res.status}`;
  return { message, warnings: Array.isArray(data?.warnings) ? data.warnings : [], skillNotice: data?.skillNotice };
}
async function errorDetail(res) {
  return (await errorBody(res)).message;
}
async function createPrototype(baseUrl, token, name) {
  const res = await fetch(`${baseUrl}/__api/prototypes/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...CLIENT_HEADER },
    body: JSON.stringify({ name })
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return (await res.json()).prototypeId;
}
async function ingest(baseUrl, token, prototypeId, files, iteration) {
  const res = await fetch(`${baseUrl}/__api/prototypes/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...CLIENT_HEADER },
    body: JSON.stringify({ prototypeId, files, ...iteration ? { iteration } : {} })
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return await res.json();
}
async function importFlows(baseUrl, token, prototypeId, manifestText, dryRun = false) {
  const res = await fetch(
    `${baseUrl}/__api/prototypes/${encodeURIComponent(prototypeId)}/task-flows/import${dryRun ? "?dryRun=1" : ""}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...CLIENT_HEADER },
      body: manifestText
    }
  );
  if (!res.ok) {
    const { message, warnings, skillNotice } = await errorBody(res);
    throw new ImportError(message, warnings, skillNotice);
  }
  return await res.json();
}
async function exportAnalysis(baseUrl, token, body) {
  const res = await fetch(`${baseUrl}/__api/analysis/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...CLIENT_HEADER },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return await res.json();
}
async function importAnalysis(baseUrl, token, answer) {
  const res = await fetch(`${baseUrl}/__api/analysis/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...CLIENT_HEADER },
    body: answer
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return await res.json();
}
async function createInvite(baseUrl, token, prototypeId, body) {
  const res = await fetch(`${baseUrl}/__api/prototypes/${encodeURIComponent(prototypeId)}/invites`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...CLIENT_HEADER },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return await res.json();
}
async function listFindings(baseUrl, token, prototypeId) {
  const res = await fetch(`${baseUrl}/__api/prototypes/${encodeURIComponent(prototypeId)}/findings`, {
    headers: { Authorization: `Bearer ${token}`, ...CLIENT_HEADER }
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return await res.json();
}

// cli/src/flows.ts
import { existsSync as existsSync3, readFileSync as readFileSync4 } from "node:fs";
import { resolve } from "node:path";

// src/shared/flowManifest/types.ts
var SCHEMA_VERSION = 1;
var DRY_RUN_STATES = ["passed", "skipped", "issues-accepted"];

// src/shared/iteration.ts
var ITERATION_LIMITS = { changes: 2e3, findings: 100 };
var FINDING_ID_RE = /^[A-Za-z0-9_-]{1,200}$/;

// src/shared/flowManifest/validate.ts
var KEY_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
var RESERVED_SUFFIX_RE = /--v\d+$/;
var LIMITS = {
  flows: 50,
  steps: 100,
  name: 120,
  instruction: 500,
  completionMessage: 200,
  hint: 300,
  question: 500,
  rationale: 1e3,
  testTitle: 120,
  testIntro: 2e3,
  notes: 500,
  builtWith: 60,
  generatorName: 40,
  generatorVersion: 40
};
var COMPLETION_TYPES = ["interaction", "appearance", "checklist", "self-report"];
var RESPONSE_TYPES = ["scale", "choice", "reaction", "text"];
var SOURCE_KINDS = ["in-person-validation", "transcript", "prd", "prototype-analysis", "other"];
var TOP_KEYS = ["schemaVersion", "prototype", "generator", "source", "iteration", "dryRun", "taskFlows"];
var ITERATION_KEYS = ["changes", "addressedFindings"];
var FLOW_KEYS = ["key", "name", "description", "rationale", "testTitle", "testIntro", "steps", "endIntercepts"];
var STEP_KEYS = ["key", "instruction", "completionMessage", "hint", "completionType", "target", "targets", "threshold", "intercept"];
var TARGET_KEYS = ["tag", "label", "context"];
var INTERCEPT_KEYS = ["trigger", "question", "responseType", "choices", "escalateOnLowScore", "followUpQuestion", "purpose"];
var isObj = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
var join4 = (path, field) => path ? `${path}.${field}` : field;
function formatIssue(issue) {
  return issue.path ? `${issue.path} ${issue.message}` : issue.message;
}
function stripBom(text) {
  return text.charCodeAt(0) === 65279 ? text.slice(1) : text;
}
function suggestKey(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
}
function validateManifest(raw) {
  const errors = [];
  const warnings = [];
  const err2 = (code, path, message) => {
    errors.push({ code, path, message });
  };
  const warn = (code, path, message) => {
    warnings.push({ code, path, message });
  };
  function unknownKeys(o, allowed, path) {
    for (const k of Object.keys(o)) {
      if (!allowed.includes(k)) warn("unknown-key", join4(path, k), "is not a known field (ignored)");
    }
  }
  function text(o, field, path, max, required) {
    const p = join4(path, field);
    const v = o[field];
    if (v === void 0) {
      if (required) err2("required", p, "is required");
      return;
    }
    if (typeof v !== "string") {
      err2("type", p, "must be a string");
      return;
    }
    if (required && v.trim() === "") {
      err2("required", p, "must not be blank");
      return;
    }
    if (v.length > max) err2("too-long", p, `must be at most ${max} characters (got ${v.length})`);
  }
  function key(o, field, path, reserveSuffix) {
    const p = join4(path, field);
    const v = o[field];
    if (v === void 0) {
      err2("required", p, "is required");
      return null;
    }
    if (typeof v !== "string") {
      err2("type", p, "must be a string");
      return null;
    }
    if (!KEY_RE.test(v)) {
      const hint = suggestKey(v);
      err2("key-format", p, `"${v}": must be lowercase kebab-case${hint ? ` (e.g. "${hint}")` : ""}`);
      return null;
    }
    if (reserveSuffix && RESERVED_SUFFIX_RE.test(v)) {
      err2("reserved-suffix", p, `"${v}": must not end in "--v<number>" (reserved for imported versions)`);
      return null;
    }
    return v;
  }
  function target(t, path) {
    if (!isObj(t)) {
      err2("type", path, "must be an object");
      return;
    }
    unknownKeys(t, TARGET_KEYS, path);
    if (t.tag !== void 0) key(t, "tag", path, false);
    text(t, "label", path, Infinity, false);
    text(t, "context", path, Infinity, false);
    const hasTag = typeof t.tag === "string" && t.tag !== "";
    const hasLabel = typeof t.label === "string" && t.label.trim() !== "";
    if (!hasTag && !hasLabel) err2("target-required", path, 'needs a "tag" or a "label"');
  }
  function intercept(ic, path, triggers, allowPurpose = false) {
    if (!isObj(ic)) {
      err2("type", path, "must be an object");
      return;
    }
    unknownKeys(ic, INTERCEPT_KEYS, path);
    if (!triggers.includes(ic.trigger)) {
      err2("trigger-invalid", join4(path, "trigger"), `must be ${triggers.map((t) => `"${t}"`).join(" or ")}`);
    }
    text(ic, "question", path, LIMITS.question, true);
    if (!RESPONSE_TYPES.includes(ic.responseType)) {
      err2("response-type", join4(path, "responseType"), `must be one of ${RESPONSE_TYPES.join(", ")}`);
    }
    if (ic.responseType === "choice") {
      const choices = Array.isArray(ic.choices) ? ic.choices.filter((c) => typeof c === "string" && c.trim() !== "") : [];
      if (choices.length < 2) err2("choices-required", join4(path, "choices"), 'needs at least 2 non-blank choices for a "choice" question');
    } else if (ic.choices !== void 0 && !Array.isArray(ic.choices)) {
      err2("type", join4(path, "choices"), "must be an array of strings");
    }
    if (Array.isArray(ic.choices)) {
      ic.choices.forEach((c, i2) => {
        if (typeof c !== "string") err2("type", `${join4(path, "choices")}[${i2}]`, "must be a string");
      });
    }
    if (ic.escalateOnLowScore !== void 0 && typeof ic.escalateOnLowScore !== "boolean") {
      err2("type", join4(path, "escalateOnLowScore"), "must be true or false");
    }
    text(ic, "followUpQuestion", path, LIMITS.question, false);
    if (ic.purpose !== void 0 && (!allowPurpose || ic.purpose !== "context")) {
      err2("purpose-invalid", join4(path, "purpose"), allowPurpose ? 'must be "context"' : "is only allowed on session-end questions (endIntercepts)");
    }
  }
  function step(s, path) {
    if (!isObj(s)) {
      err2("type", path, "must be an object");
      return null;
    }
    unknownKeys(s, STEP_KEYS, path);
    const k = key(s, "key", path, false);
    text(s, "instruction", path, LIMITS.instruction, true);
    text(s, "completionMessage", path, LIMITS.completionMessage, false);
    text(s, "hint", path, LIMITS.hint, false);
    const type = s.completionType ?? "interaction";
    if (!COMPLETION_TYPES.includes(type)) {
      err2("completion-type", join4(path, "completionType"), `must be one of ${COMPLETION_TYPES.join(", ")}`);
      return k;
    }
    const forbid = (field) => {
      if (s[field] !== void 0) err2("target-forbidden", join4(path, field), `is not allowed when completionType is "${type}"`);
    };
    if (type === "interaction" || type === "appearance") {
      if (s.target === void 0) err2("target-required", join4(path, "target"), `is required when completionType is "${type}"`);
      else target(s.target, join4(path, "target"));
      forbid("targets");
      forbid("threshold");
    } else if (type === "checklist") {
      forbid("target");
      if (!Array.isArray(s.targets) || s.targets.length === 0) {
        err2("target-required", join4(path, "targets"), "needs at least 1 target for a checklist step");
      } else {
        const n = s.targets.length;
        s.targets.forEach((t, i2) => target(t, `${join4(path, "targets")}[${i2}]`));
        const th = s.threshold;
        if (th !== void 0 && !(typeof th === "number" && Number.isInteger(th) && th >= 1 && th <= n)) {
          err2("threshold-range", join4(path, "threshold"), `must be a whole number from 1 to ${n}`);
        }
      }
    } else {
      forbid("target");
      forbid("targets");
      forbid("threshold");
    }
    if (s.intercept !== void 0) intercept(s.intercept, join4(path, "intercept"), ["step-complete", "struggle"]);
    return k;
  }
  function flow(f, path) {
    if (!isObj(f)) {
      err2("type", path, "must be an object");
      return null;
    }
    unknownKeys(f, FLOW_KEYS, path);
    const k = key(f, "key", path, true);
    text(f, "name", path, LIMITS.name, true);
    text(f, "description", path, Infinity, false);
    text(f, "rationale", path, LIMITS.rationale, false);
    text(f, "testTitle", path, LIMITS.testTitle, false);
    text(f, "testIntro", path, LIMITS.testIntro, false);
    const sp = join4(path, "steps");
    if (!Array.isArray(f.steps) || f.steps.length === 0) {
      err2("empty-list", sp, "needs at least 1 step");
    } else {
      if (f.steps.length > LIMITS.steps) err2("too-many", sp, `allows at most ${LIMITS.steps} steps (got ${f.steps.length})`);
      const seen = /* @__PURE__ */ new Set();
      f.steps.forEach((s, i2) => {
        const sk = step(s, `${sp}[${i2}]`);
        if (!sk) return;
        if (seen.has(sk)) err2("duplicate-key", `${sp}[${i2}].key`, `"${sk}": is already used by another step in this flow`);
        seen.add(sk);
      });
    }
    if (f.endIntercepts !== void 0) {
      const ep = join4(path, "endIntercepts");
      if (!Array.isArray(f.endIntercepts)) err2("type", ep, "must be an array");
      else f.endIntercepts.forEach((ic, i2) => intercept(ic, `${ep}[${i2}]`, ["session-end"], true));
    }
    return k;
  }
  if (!isObj(raw)) {
    err2("not-object", "", "The manifest must be a JSON object");
    return { manifest: null, errors, warnings };
  }
  unknownKeys(raw, TOP_KEYS, "");
  if (raw.schemaVersion !== SCHEMA_VERSION) {
    err2("schema-version", "schemaVersion", `must be ${SCHEMA_VERSION} (got ${JSON.stringify(raw.schemaVersion) ?? "nothing"})`);
  }
  if (raw.prototype !== void 0) {
    if (!isObj(raw.prototype)) err2("type", "prototype", "must be an object");
    else {
      text(raw.prototype, "name", "prototype", Infinity, false);
      text(raw.prototype, "builtWith", "prototype", LIMITS.builtWith, false);
    }
  }
  if (raw.generator !== void 0) {
    if (!isObj(raw.generator)) err2("type", "generator", "must be an object");
    else {
      text(raw.generator, "name", "generator", LIMITS.generatorName, false);
      text(raw.generator, "version", "generator", LIMITS.generatorVersion, false);
    }
  }
  if (raw.source !== void 0) {
    if (!isObj(raw.source)) err2("type", "source", "must be an object");
    else {
      if (!SOURCE_KINDS.includes(raw.source.kind)) {
        err2("source-kind", "source.kind", `must be one of ${SOURCE_KINDS.join(", ")}`);
      }
      text(raw.source, "notes", "source", LIMITS.notes, false);
    }
  }
  if (raw.iteration !== void 0) {
    if (!isObj(raw.iteration)) err2("type", "iteration", "must be an object");
    else {
      unknownKeys(raw.iteration, ITERATION_KEYS, "iteration");
      text(raw.iteration, "changes", "iteration", ITERATION_LIMITS.changes, true);
      const ids = raw.iteration.addressedFindings;
      if (ids !== void 0) {
        if (!Array.isArray(ids)) err2("type", "iteration.addressedFindings", "must be an array of finding ids");
        else {
          if (ids.length > ITERATION_LIMITS.findings) {
            err2("too-many", "iteration.addressedFindings", `allows at most ${ITERATION_LIMITS.findings} findings (got ${ids.length})`);
          }
          ids.forEach((id, i2) => {
            if (typeof id !== "string" || !FINDING_ID_RE.test(id)) {
              err2("finding-id", `iteration.addressedFindings[${i2}]`, `${JSON.stringify(id)}: must be a finding id from the findings brief (e.g. "ai_x3Lk9_f1a2b3c4")`);
            }
          });
        }
      }
    }
  }
  if (raw.dryRun !== void 0 && !DRY_RUN_STATES.includes(raw.dryRun)) {
    err2("dryrun-invalid", "dryRun", `must be one of ${DRY_RUN_STATES.join(", ")}`);
  }
  if (!Array.isArray(raw.taskFlows) || raw.taskFlows.length === 0) {
    err2("empty-list", "taskFlows", "must list at least 1 task flow");
  } else {
    if (raw.taskFlows.length > LIMITS.flows) err2("too-many", "taskFlows", `allows at most ${LIMITS.flows} task flows (got ${raw.taskFlows.length})`);
    const seen = /* @__PURE__ */ new Set();
    raw.taskFlows.forEach((f, i2) => {
      const k = flow(f, `taskFlows[${i2}]`);
      if (!k) return;
      if (seen.has(k)) err2("duplicate-key", `taskFlows[${i2}].key`, `"${k}": is already used by another task flow in this file`);
      seen.add(k);
    });
  }
  return { manifest: errors.length === 0 ? raw : null, errors, warnings };
}

// src/shared/flowManifest/map.ts
function expectedActionFor(label, context) {
  return context && context !== label ? `Click "${label}" in ${context.split("\n")[0].trim().slice(0, 80)}` : `Click "${label}"`;
}
function targetTextFor(label, context) {
  if (!label) return void 0;
  return context ? `${context}|${label}` : label;
}
function compact(o) {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== void 0));
}
function mapIntercept(ic, newId) {
  return compact({
    id: newId(),
    trigger: ic.trigger,
    question: ic.question.trim(),
    responseType: ic.responseType,
    choices: ic.responseType === "choice" ? (ic.choices ?? []).map((c) => c.trim()).filter((c) => c.length > 0) : void 0,
    escalateOnLowScore: ic.responseType === "scale" ? ic.escalateOnLowScore : void 0,
    followUpQuestion: ic.followUpQuestion?.trim() || void 0,
    purpose: ic.purpose === "context" ? "context" : void 0
  });
}
function mapChecklistTarget(t) {
  return compact({ tag: t.tag, label: t.label, context: t.context, text: targetTextFor(t.label, t.context) });
}
function mapFlow(flow, target, ctx) {
  const reuse = new Map(
    (ctx.existing?.steps ?? []).filter((s) => s.importKey).map((s) => [s.importKey, s.id])
  );
  const steps = flow.steps.map((s, i2) => {
    const type = s.completionType ?? "interaction";
    const step = {
      id: reuse.get(s.key) ?? ctx.newId(),
      order: i2 + 1,
      instruction: s.instruction.trim(),
      expectedAction: "",
      importKey: s.key,
      completionType: type
    };
    const completionMessage = s.completionMessage?.trim();
    if (completionMessage) step.completionMessage = completionMessage;
    const hint = s.hint?.trim();
    if (hint) step.hint = hint;
    if ((type === "interaction" || type === "appearance") && s.target) {
      const t = s.target;
      Object.assign(step, compact({
        targetTag: t.tag,
        targetLabel: t.label,
        targetContext: t.context,
        targetText: targetTextFor(t.label, t.context)
      }));
      step.expectedAction = expectedActionFor(t.label || t.tag, t.context);
    } else if (type === "checklist" && s.targets) {
      step.checklistTargets = s.targets.map(mapChecklistTarget);
      step.checklistThreshold = s.threshold ?? s.targets.length;
    }
    if (s.intercept) step.intercept = mapIntercept(s.intercept, ctx.newId);
    return step;
  });
  return compact({
    name: target.name,
    description: flow.description?.trim() ?? "",
    prototypeId: ctx.prototypeId,
    steps,
    endIntercepts: (flow.endIntercepts ?? []).map((ic) => mapIntercept(ic, ctx.newId)),
    importKey: target.importKey,
    importSource: ctx.source ? compact({ kind: ctx.source.kind, notes: ctx.source.notes?.trim() || void 0, importedAt: ctx.now }) : { kind: "other", importedAt: ctx.now },
    rationale: flow.rationale?.trim() || void 0,
    testTitle: flow.testTitle?.trim() || void 0,
    testIntro: flow.testIntro?.trim() || void 0,
    createdBy: ctx.uid,
    createdAt: ctx.existing?.createdAt ?? ctx.now,
    updatedAt: ctx.now
  });
}

// src/shared/flowManifest/tagScan.ts
var SCANNABLE_RE = /\.(html?|m?js|cjs|jsx)$/i;
function isScannable(path) {
  return SCANNABLE_RE.test(path);
}
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function tagPatterns(tag) {
  const t = escapeRe(tag);
  const q = (c) => `\\\\?${c}`;
  const quoted = `(?:${q('"')}${t}${q('"')}|${q("'")}${t}${q("'")}|\`${t}\`)`;
  const name = `${q(`["']`)}data-validai-target${q(`["']`)}`;
  return [
    // HTML / JSX attribute: data-validai-target="x" | 'x' | x (quotes optionally escaped)
    new RegExp(`data-validai-target\\s*=\\s*(?:${quoted}|${t}(?=[\\s/>]))`),
    // JSX expression container: data-validai-target={"x"}
    new RegExp(`data-validai-target\\s*=\\s*\\{\\s*${quoted}\\s*\\}`),
    // Compiled props / object literal: "data-validai-target":"x" (or \"…\":\"x\" in a string)
    new RegExp(`data-validai-target(?:\\\\?["']?)\\s*:\\s*${quoted}`),
    // Call arguments: setAttribute("data-validai-target","x"), attr(el,'data-validai-target','x')
    new RegExp(`${name}\\s*,\\s*${quoted}`)
  ];
}
function findMissingTags(files, tags) {
  const contents = [...files.values()];
  return [...new Set(tags)].filter((tag) => {
    const patterns = tagPatterns(tag);
    return !contents.some((c) => patterns.some((p) => p.test(c)));
  }).sort();
}
function tagReferences(m) {
  const refs = [];
  m.taskFlows.forEach((f, i2) => {
    f.steps.forEach((s, j) => {
      const base = `taskFlows[${i2}].steps[${j}]`;
      if (s.target?.tag) refs.push({ tag: s.target.tag, path: `${base}.target.tag` });
      s.targets?.forEach((t, k) => {
        if (t.tag) refs.push({ tag: t.tag, path: `${base}.targets[${k}].tag` });
      });
    });
  });
  return refs;
}
function checkTags(m, files) {
  const refs = tagReferences(m);
  const missing = new Set(findMissingTags(files, refs.map((r) => r.tag)));
  return refs.filter((r) => missing.has(r.tag)).map((r) => ({
    code: "missing-tag",
    path: r.path,
    message: `"${r.tag}": was not found in the prototype build \u2014 add data-validai-target="${r.tag}" to the element`
  }));
}

// src/shared/skillVersion.ts
var PLUGIN_REPO = "fortandr/validai-skill";
var MARKETPLACE_NAME = "lukantan";
var PLUGIN_ID = `validai@${MARKETPLACE_NAME}`;
var VERSION_RE = /^(\d{4})\.(\d{1,2})\.(\d{1,2})(?:-(\d+))?$/;
function parseSkillVersion(v) {
  const m = VERSION_RE.exec(v.trim());
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === void 0 ? 0 : Number(m[4])];
}
function compareSkillVersions(a, b) {
  const pa = parseSkillVersion(a);
  const pb = parseSkillVersion(b);
  if (!pa || !pb) return pa ? 1 : pb ? -1 : 0;
  for (let i2 = 0; i2 < 4; i2 += 1) {
    if (pa[i2] !== pb[i2]) return pa[i2] < pb[i2] ? -1 : 1;
  }
  return 0;
}
function parseSkillLatest(raw) {
  if (typeof raw !== "object" || raw === null) return null;
  const { latest, summary, updateUrl } = raw;
  if (typeof latest !== "string" || !parseSkillVersion(latest)) return null;
  if (typeof updateUrl !== "string") return null;
  return { latest, summary: typeof summary === "string" ? summary : "", updateUrl };
}
var SWITCH_TO_PLUGIN = `Installed from a zip? Switch to the plugin to get updates automatically: in Claude Code run /plugin marketplace add ${PLUGIN_REPO}, then /plugin install ${PLUGIN_ID}; in Claude.ai or Cowork use Customize \u2192 Plugins \u2192 Add \u2192 ${PLUGIN_REPO}.`;

// cli/src/flows.ts
var DEFAULT_FLOWS_FILE = "validai-flows.json";
function loadManifest(cwd, file = DEFAULT_FLOWS_FILE) {
  const path = resolve(cwd, file);
  if (!existsSync3(path)) throw new Error(`Flows file not found: ${file}`);
  const text = stripBom(readFileSync4(path, "utf-8"));
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (err2) {
    throw new Error(`${file} is not valid JSON: ${err2.message}`);
  }
  const { manifest, errors, warnings } = validateManifest(raw);
  if (!manifest) {
    const n = errors.length;
    throw new Error(`${file} has ${n} problem${n === 1 ? "" : "s"}:
${errors.map((e) => `  \u2022 ${formatIssue(e)}`).join("\n")}`);
  }
  return { manifest, text, warnings: warnings.map(formatIssue) };
}
function localTagIssues(manifest, files) {
  const texts = /* @__PURE__ */ new Map();
  for (const f of files) {
    if (isScannable(f.path)) texts.set(f.path, Buffer.from(f.contentBase64, "base64").toString("utf-8"));
  }
  return checkTags(manifest, texts).map(formatIssue);
}
var ACTION_TEXT = {
  create: "created",
  replace: "replaced (untested)",
  "create-version": "created as a new version"
};
function printTagIssues(issues, out, withHint = true) {
  out.error("\u2717 Tags in the flows file are missing from the build:");
  for (const i2 of issues) out.error(`  \u2022 ${i2}`);
  if (withHint) out.error("  Add the data-validai-target attributes, rebuild, and try again.");
}
function printReport(report, out, printNotice = true) {
  for (const f of report.flows) out.log(`  \u2713 ${f.name} \u2014 ${ACTION_TEXT[f.action]}${f.reason ? ` (${f.reason})` : ""}`);
  const notice = report.skillNotice;
  for (const w of report.warnings) if (w !== notice?.message) out.log(`  \u26A0 ${w}`);
  if (notice && printNotice) out.log(`  \u2B06 Update available: ${notice.message}`);
}
async function printServerNotice(notice, out, local) {
  if (!notice) return;
  const l = local ? await local : null;
  if (l && compareSkillVersions(notice.latest, l.latest) <= 0) return;
  out.log(`  \u2B06 Update available: ${notice.message}`);
}
async function runShare(files, flows, api, out, localUpdate) {
  if (flows && files) {
    const issues = localTagIssues(flows.manifest, files);
    if (issues.length > 0) {
      printTagIssues(issues, out);
      return 1;
    }
  }
  for (const w of flows?.warnings ?? []) out.log(`  \u26A0 ${w}`);
  const it = flows?.manifest.iteration;
  let uploaded = null;
  if (files && it) {
    const result = await api.ingest(files, { changes: it.changes, findingIds: it.addressedFindings ?? [] });
    const v = result.iteration ?? "?";
    uploaded = `iteration v${v}`;
    const n = (result.findingIds ?? it.addressedFindings ?? []).length;
    out.log(`\u2713 Started iteration v${v}${n ? `, addressing ${n} finding${n === 1 ? "" : "s"}` : ""}`);
    for (const w of result.warnings) out.log(`  \u26A0 ${w}`);
    if (n === 0) {
      out.log(`  \u26A0 Iteration v${v} isn't linked to any findings, so ValidAI can't check whether the fixes worked.`);
      out.log("    See the open findings with `validai-share findings`, then link them in ValidAI \u2192 Insights \u2192 Link findings.");
    }
  }
  if (files && !it) {
    const result = await api.ingest(files);
    uploaded = `v${result.version}`;
    out.log(`\u2713 Uploaded v${result.version}`);
    for (const w of result.warnings) out.log(`  \u26A0 ${w}`);
  }
  if (!flows) return 0;
  try {
    const report = await api.importFlows(flows.text);
    const n = report.flows.length;
    out.log(`\u2713 Imported ${n} task flow${n === 1 ? "" : "s"}`);
    printReport(report, out, false);
    await printServerNotice(report.skillNotice, out, localUpdate);
    return 0;
  } catch (err2) {
    out.error(`\u2717 Flow import failed: ${err2.message}`);
    const failure = err2;
    for (const w of failure.warnings ?? []) if (w !== failure.skillNotice?.message) out.error(`  \u26A0 ${w}`);
    await printServerNotice(failure.skillNotice, out, localUpdate);
    if (uploaded !== null) {
      out.error(`  The upload (${uploaded}) succeeded. Fix the flows file, then re-run: validai-share --flows-only`);
    }
    return 1;
  }
}

// node_modules/fflate/esm/index.mjs
import { createRequire } from "module";
var require2 = createRequire("/");
var _a;
var Worker;
var isMarkedAsUntransferable;
try {
  _a = require2("worker_threads"), Worker = _a.Worker, isMarkedAsUntransferable = _a.isMarkedAsUntransferable;
} catch (e) {
}
var u8 = Uint8Array;
var u16 = Uint16Array;
var i32 = Int32Array;
var fleb = new u8([
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  1,
  1,
  1,
  1,
  2,
  2,
  2,
  2,
  3,
  3,
  3,
  3,
  4,
  4,
  4,
  4,
  5,
  5,
  5,
  5,
  0,
  /* unused */
  0,
  0,
  /* impossible */
  0
]);
var fdeb = new u8([
  0,
  0,
  0,
  0,
  1,
  1,
  2,
  2,
  3,
  3,
  4,
  4,
  5,
  5,
  6,
  6,
  7,
  7,
  8,
  8,
  9,
  9,
  10,
  10,
  11,
  11,
  12,
  12,
  13,
  13,
  /* unused */
  0,
  0
]);
var clim = new u8([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
var freb = function(eb, start) {
  var b = new u16(31);
  for (var i2 = 0; i2 < 31; ++i2) {
    b[i2] = start += 1 << eb[i2 - 1];
  }
  var r = new i32(b[30]);
  for (var i2 = 1; i2 < 30; ++i2) {
    for (var j = b[i2]; j < b[i2 + 1]; ++j) {
      r[j] = j - b[i2] << 5 | i2;
    }
  }
  return { b, r };
};
var _a = freb(fleb, 2);
var fl = _a.b;
var revfl = _a.r;
fl[28] = 258, revfl[258] = 28;
var _b = freb(fdeb, 0);
var fd = _b.b;
var revfd = _b.r;
var rev = new u16(32768);
for (i = 0; i < 32768; ++i) {
  x = (i & 43690) >> 1 | (i & 21845) << 1;
  x = (x & 52428) >> 2 | (x & 13107) << 2;
  x = (x & 61680) >> 4 | (x & 3855) << 4;
  rev[i] = ((x & 65280) >> 8 | (x & 255) << 8) >> 1;
}
var x;
var i;
var hMap = (function(cd, mb, r) {
  var s = cd.length;
  var i2 = 0;
  var l = new u16(mb);
  for (; i2 < s; ++i2) {
    if (cd[i2])
      ++l[cd[i2] - 1];
  }
  var le = new u16(mb);
  for (i2 = 1; i2 < mb; ++i2) {
    le[i2] = le[i2 - 1] + l[i2 - 1] << 1;
  }
  var co;
  if (r) {
    co = new u16(1 << mb);
    var rvb = 15 - mb;
    for (i2 = 0; i2 < s; ++i2) {
      if (cd[i2]) {
        var sv = i2 << 4 | cd[i2];
        var r_1 = mb - cd[i2];
        var v = le[cd[i2] - 1]++ << r_1;
        for (var m = v | (1 << r_1) - 1; v <= m; ++v) {
          co[rev[v] >> rvb] = sv;
        }
      }
    }
  } else {
    co = new u16(s);
    for (i2 = 0; i2 < s; ++i2) {
      if (cd[i2]) {
        co[i2] = rev[le[cd[i2] - 1]++] >> 15 - cd[i2];
      }
    }
  }
  return co;
});
var flt = new u8(288);
for (i = 0; i < 144; ++i)
  flt[i] = 8;
var i;
for (i = 144; i < 256; ++i)
  flt[i] = 9;
var i;
for (i = 256; i < 280; ++i)
  flt[i] = 7;
var i;
for (i = 280; i < 288; ++i)
  flt[i] = 8;
var i;
var fdt = new u8(32);
for (i = 0; i < 32; ++i)
  fdt[i] = 5;
var i;
var flm = /* @__PURE__ */ hMap(flt, 9, 0);
var fdm = /* @__PURE__ */ hMap(fdt, 5, 0);
var shft = function(p) {
  return (p + 7) / 8 | 0;
};
var slc = function(v, s, e) {
  if (s == null || s < 0)
    s = 0;
  if (e == null || e > v.length)
    e = v.length;
  return new u8(v.subarray(s, e));
};
var ec = [
  "unexpected EOF",
  "invalid block type",
  "invalid length/literal",
  "invalid distance",
  "stream finished",
  "no stream handler",
  ,
  // determined by compression function
  "no callback",
  "invalid UTF-8 data",
  "extra field too long",
  "date not in range 1980-2099",
  "filename too long",
  "stream finishing",
  "invalid zip data"
  // determined by unknown compression method
];
var err = function(ind, msg, nt) {
  var e = new Error(msg || ec[ind]);
  e.code = ind;
  if (Error.captureStackTrace)
    Error.captureStackTrace(e, err);
  if (!nt)
    throw e;
  return e;
};
var wbits = function(d, p, v) {
  v <<= p & 7;
  var o = p / 8 | 0;
  d[o] |= v;
  d[o + 1] |= v >> 8;
};
var wbits16 = function(d, p, v) {
  v <<= p & 7;
  var o = p / 8 | 0;
  d[o] |= v;
  d[o + 1] |= v >> 8;
  d[o + 2] |= v >> 16;
};
var hTree = function(d, mb) {
  var t = [];
  for (var i2 = 0; i2 < d.length; ++i2) {
    if (d[i2])
      t.push({ s: i2, f: d[i2] });
  }
  var s = t.length;
  var t2 = t.slice();
  if (!s)
    return { t: et, l: 0 };
  if (s == 1) {
    var v = new u8(t[0].s + 1);
    v[t[0].s] = 1;
    return { t: v, l: 1 };
  }
  t.sort(function(a, b) {
    return a.f - b.f;
  });
  t.push({ s: -1, f: 25001 });
  var l = t[0], r = t[1], i0 = 0, i1 = 1, i22 = 2;
  t[0] = { s: -1, f: l.f + r.f, l, r };
  while (i1 != s - 1) {
    l = t[t[i0].f < t[i22].f ? i0++ : i22++];
    r = t[i0 != i1 && t[i0].f < t[i22].f ? i0++ : i22++];
    t[i1++] = { s: -1, f: l.f + r.f, l, r };
  }
  var maxSym = t2[0].s;
  for (var i2 = 1; i2 < s; ++i2) {
    if (t2[i2].s > maxSym)
      maxSym = t2[i2].s;
  }
  var tr = new u16(maxSym + 1);
  var mbt = ln(t[i1 - 1], tr, 0);
  if (mbt > mb) {
    var i2 = 0, dt = 0;
    var lft = mbt - mb, cst = 1 << lft;
    t2.sort(function(a, b) {
      return tr[b.s] - tr[a.s] || a.f - b.f;
    });
    for (; i2 < s; ++i2) {
      var i2_1 = t2[i2].s;
      if (tr[i2_1] > mb) {
        dt += cst - (1 << mbt - tr[i2_1]);
        tr[i2_1] = mb;
      } else
        break;
    }
    dt >>= lft;
    while (dt > 0) {
      var i2_2 = t2[i2].s;
      if (tr[i2_2] < mb)
        dt -= 1 << mb - tr[i2_2]++ - 1;
      else
        ++i2;
    }
    for (; i2 >= 0 && dt; --i2) {
      var i2_3 = t2[i2].s;
      if (tr[i2_3] == mb) {
        --tr[i2_3];
        ++dt;
      }
    }
    mbt = mb;
  }
  return { t: new u8(tr), l: mbt };
};
var ln = function(n, l, d) {
  return n.s == -1 ? Math.max(ln(n.l, l, d + 1), ln(n.r, l, d + 1)) : l[n.s] = d;
};
var lc = function(c) {
  var s = c.length;
  while (s && !c[--s])
    ;
  var cl = new u16(++s);
  var cli = 0, cln = c[0], cls = 1;
  var w = function(v) {
    cl[cli++] = v;
  };
  for (var i2 = 1; i2 <= s; ++i2) {
    if (c[i2] == cln && i2 != s)
      ++cls;
    else {
      if (!cln && cls > 2) {
        for (; cls > 138; cls -= 138)
          w(32754);
        if (cls > 2) {
          w(cls > 10 ? cls - 11 << 5 | 28690 : cls - 3 << 5 | 12305);
          cls = 0;
        }
      } else if (cls > 3) {
        w(cln), --cls;
        for (; cls > 6; cls -= 6)
          w(8304);
        if (cls > 2)
          w(cls - 3 << 5 | 8208), cls = 0;
      }
      while (cls--)
        w(cln);
      cls = 1;
      cln = c[i2];
    }
  }
  return { c: cl.subarray(0, cli), n: s };
};
var clen = function(cf, cl) {
  var l = 0;
  for (var i2 = 0; i2 < cl.length; ++i2)
    l += cf[i2] * cl[i2];
  return l;
};
var wfblk = function(out, pos, dat) {
  var s = dat.length;
  var o = shft(pos + 2);
  out[o] = s & 255;
  out[o + 1] = s >> 8;
  out[o + 2] = out[o] ^ 255;
  out[o + 3] = out[o + 1] ^ 255;
  for (var i2 = 0; i2 < s; ++i2)
    out[o + i2 + 4] = dat[i2];
  return (o + 4 + s) * 8;
};
var wblk = function(dat, out, final, syms, lf, df, eb, li, bs, bl, p) {
  wbits(out, p++, final);
  ++lf[256];
  var _a2 = hTree(lf, 15), dlt = _a2.t, mlb = _a2.l;
  var _b2 = hTree(df, 15), ddt = _b2.t, mdb = _b2.l;
  var _c = lc(dlt), lclt = _c.c, nlc = _c.n;
  var _d = lc(ddt), lcdt = _d.c, ndc = _d.n;
  var lcfreq = new u16(19);
  for (var i2 = 0; i2 < lclt.length; ++i2)
    ++lcfreq[lclt[i2] & 31];
  for (var i2 = 0; i2 < lcdt.length; ++i2)
    ++lcfreq[lcdt[i2] & 31];
  var _e = hTree(lcfreq, 7), lct = _e.t, mlcb = _e.l;
  var nlcc = 19;
  for (; nlcc > 4 && !lct[clim[nlcc - 1]]; --nlcc)
    ;
  var flen = bl + 5 << 3;
  var ftlen = clen(lf, flt) + clen(df, fdt) + eb;
  var dtlen = clen(lf, dlt) + clen(df, ddt) + eb + 14 + 3 * nlcc + clen(lcfreq, lct) + 2 * lcfreq[16] + 3 * lcfreq[17] + 7 * lcfreq[18];
  if (bs >= 0 && flen <= ftlen && flen <= dtlen)
    return wfblk(out, p, dat.subarray(bs, bs + bl));
  var lm, ll, dm, dl;
  wbits(out, p, 1 + (dtlen < ftlen)), p += 2;
  if (dtlen < ftlen) {
    lm = hMap(dlt, mlb, 0), ll = dlt, dm = hMap(ddt, mdb, 0), dl = ddt;
    var llm = hMap(lct, mlcb, 0);
    wbits(out, p, nlc - 257);
    wbits(out, p + 5, ndc - 1);
    wbits(out, p + 10, nlcc - 4);
    p += 14;
    for (var i2 = 0; i2 < nlcc; ++i2)
      wbits(out, p + 3 * i2, lct[clim[i2]]);
    p += 3 * nlcc;
    var lcts = [lclt, lcdt];
    for (var it = 0; it < 2; ++it) {
      var clct = lcts[it];
      for (var i2 = 0; i2 < clct.length; ++i2) {
        var len = clct[i2] & 31;
        wbits(out, p, llm[len]), p += lct[len];
        if (len > 15)
          wbits(out, p, clct[i2] >> 5 & 127), p += clct[i2] >> 12;
      }
    }
  } else {
    lm = flm, ll = flt, dm = fdm, dl = fdt;
  }
  for (var i2 = 0; i2 < li; ++i2) {
    var sym = syms[i2];
    if (sym > 255) {
      var len = sym >> 18 & 31;
      wbits16(out, p, lm[len + 257]), p += ll[len + 257];
      if (len > 7)
        wbits(out, p, sym >> 23 & 31), p += fleb[len];
      var dst = sym & 31;
      wbits16(out, p, dm[dst]), p += dl[dst];
      if (dst > 3)
        wbits16(out, p, sym >> 5 & 8191), p += fdeb[dst];
    } else {
      wbits16(out, p, lm[sym]), p += ll[sym];
    }
  }
  wbits16(out, p, lm[256]);
  return p + ll[256];
};
var deo = /* @__PURE__ */ new i32([65540, 131080, 131088, 131104, 262176, 1048704, 1048832, 2114560, 2117632]);
var et = /* @__PURE__ */ new u8(0);
var dflt = function(dat, lvl, plvl, pre, post, st) {
  var s = st.z || dat.length;
  var o = new u8(pre + s + 5 * (1 + Math.ceil(s / 7e3)) + post);
  var w = o.subarray(pre, o.length - post);
  var lst = st.l;
  var pos = (st.r || 0) & 7;
  if (lvl) {
    if (pos)
      w[0] = st.r >> 3;
    var opt = deo[lvl - 1];
    var n = opt >> 13, c = opt & 8191;
    var msk_1 = (1 << plvl) - 1;
    var prev = st.p || new u16(32768), head = st.h || new u16(msk_1 + 1);
    var bs1_1 = Math.ceil(plvl / 3), bs2_1 = 2 * bs1_1;
    var hsh = function(i3) {
      return (dat[i3] ^ dat[i3 + 1] << bs1_1 ^ dat[i3 + 2] << bs2_1) & msk_1;
    };
    var syms = new i32(25e3);
    var lf = new u16(288), df = new u16(32);
    var lc_1 = 0, eb = 0, i2 = st.i || 0, li = 0, wi = st.w || 0, bs = 0;
    for (; i2 + 2 < s; ++i2) {
      var hv = hsh(i2);
      var imod = i2 & 32767, pimod = head[hv];
      prev[imod] = pimod;
      head[hv] = imod;
      if (wi <= i2) {
        var rem = s - i2;
        if ((lc_1 > 7e3 || li > 24576) && (rem > 423 || !lst)) {
          pos = wblk(dat, w, 0, syms, lf, df, eb, li, bs, i2 - bs, pos);
          li = lc_1 = eb = 0, bs = i2;
          for (var j = 0; j < 286; ++j)
            lf[j] = 0;
          for (var j = 0; j < 30; ++j)
            df[j] = 0;
        }
        var l = 2, d = 0, ch_1 = c, dif = imod - pimod & 32767;
        if (rem > 2 && hv == hsh(i2 - dif)) {
          var maxn = Math.min(n, rem) - 1;
          var maxd = Math.min(32767, i2);
          var ml = Math.min(258, rem);
          while (dif <= maxd && --ch_1 && imod != pimod) {
            if (dat[i2 + l] == dat[i2 + l - dif]) {
              var nl = 0;
              for (; nl < ml && dat[i2 + nl] == dat[i2 + nl - dif]; ++nl)
                ;
              if (nl > l) {
                l = nl, d = dif;
                if (nl > maxn)
                  break;
                var mmd = Math.min(dif, nl - 2);
                var md = 0;
                for (var j = 0; j < mmd; ++j) {
                  var ti = i2 - dif + j & 32767;
                  var pti = prev[ti];
                  var cd = ti - pti & 32767;
                  if (cd > md)
                    md = cd, pimod = ti;
                }
              }
            }
            imod = pimod, pimod = prev[imod];
            dif += imod - pimod & 32767;
          }
        }
        if (d) {
          syms[li++] = 268435456 | revfl[l] << 18 | revfd[d];
          var lin = revfl[l] & 31, din = revfd[d] & 31;
          eb += fleb[lin] + fdeb[din];
          ++lf[257 + lin];
          ++df[din];
          wi = i2 + l;
          ++lc_1;
        } else {
          syms[li++] = dat[i2];
          ++lf[dat[i2]];
        }
      }
    }
    for (i2 = Math.max(i2, wi); i2 < s; ++i2) {
      syms[li++] = dat[i2];
      ++lf[dat[i2]];
    }
    pos = wblk(dat, w, lst, syms, lf, df, eb, li, bs, i2 - bs, pos);
    if (!lst) {
      st.r = pos & 7 | w[pos / 8 | 0] << 3;
      pos -= 7;
      st.h = head, st.p = prev, st.i = i2, st.w = wi;
    }
  } else {
    for (var i2 = st.w || 0; i2 < s + lst; i2 += 65535) {
      var e = i2 + 65535;
      if (e >= s) {
        w[pos / 8 | 0] = lst;
        e = s;
      }
      pos = wfblk(w, pos + 1, dat.subarray(i2, e));
    }
    st.i = s;
  }
  return slc(o, 0, pre + shft(pos) + post);
};
var crct = /* @__PURE__ */ (function() {
  var t = new Int32Array(256);
  for (var i2 = 0; i2 < 256; ++i2) {
    var c = i2, k = 9;
    while (--k)
      c = (c & 1 && -306674912) ^ c >>> 1;
    t[i2] = c;
  }
  return t;
})();
var crc = function() {
  var c = -1;
  return {
    p: function(d) {
      var cr = c;
      for (var i2 = 0; i2 < d.length; ++i2)
        cr = crct[cr & 255 ^ d[i2]] ^ cr >>> 8;
      c = cr;
    },
    d: function() {
      return ~c;
    }
  };
};
var dopt = function(dat, opt, pre, post, st) {
  if (!st) {
    st = { l: 1 };
    if (opt.dictionary) {
      var dict = opt.dictionary.subarray(-32768);
      var newDat = new u8(dict.length + dat.length);
      newDat.set(dict);
      newDat.set(dat, dict.length);
      dat = newDat;
      st.w = dict.length;
    }
  }
  return dflt(dat, opt.level == null ? 6 : opt.level, opt.mem == null ? st.l ? Math.ceil(Math.max(8, Math.min(13, Math.log(dat.length))) * 1.5) : 20 : 12 + opt.mem, pre, post, st);
};
var mrg = function(a, b) {
  var o = {};
  for (var k in a)
    o[k] = a[k];
  for (var k in b)
    o[k] = b[k];
  return o;
};
var wbytes = function(d, b, v) {
  for (; v; ++b)
    d[b] = v, v >>>= 8;
};
function deflateSync(data, opts) {
  return dopt(data, opts || {}, 0, 0);
}
var fltn = function(d, p, t, o) {
  for (var k in d) {
    var val = d[k], n = p + k, op = o;
    if (Array.isArray(val))
      op = mrg(o, val[1]), val = val[0];
    if (ArrayBuffer.isView(val))
      t[n] = [val, op];
    else {
      t[n += "/"] = [new u8(0), op];
      fltn(val, n, t, o);
    }
  }
};
var te = typeof TextEncoder != "undefined" && /* @__PURE__ */ new TextEncoder();
var td = typeof TextDecoder != "undefined" && /* @__PURE__ */ new TextDecoder();
var tds = 0;
try {
  td.decode(et, { stream: true });
  tds = 1;
} catch (e) {
}
function strToU8(str, latin1) {
  if (latin1) {
    var ar_1 = new u8(str.length);
    for (var i2 = 0; i2 < str.length; ++i2)
      ar_1[i2] = str.charCodeAt(i2);
    return ar_1;
  }
  if (te)
    return te.encode(str);
  var l = str.length;
  var ar = new u8(str.length + (str.length >> 1));
  var ai = 0;
  var w = function(v) {
    ar[ai++] = v;
  };
  for (var i2 = 0; i2 < l; ++i2) {
    if (ai + 5 > ar.length) {
      var n = new u8(ai + 8 + (l - i2 << 1));
      n.set(ar);
      ar = n;
    }
    var c = str.charCodeAt(i2);
    if (c < 128 || latin1)
      w(c);
    else if (c < 2048)
      w(192 | c >> 6), w(128 | c & 63);
    else if (c > 55295 && c < 57344)
      c = 65536 + (c & 1023 << 10) | str.charCodeAt(++i2) & 1023, w(240 | c >> 18), w(128 | c >> 12 & 63), w(128 | c >> 6 & 63), w(128 | c & 63);
    else
      w(224 | c >> 12), w(128 | c >> 6 & 63), w(128 | c & 63);
  }
  return slc(ar, 0, ai);
}
var exfl = function(ex) {
  var le = 0;
  if (ex) {
    for (var k in ex) {
      var l = ex[k].length;
      if (l > 65535)
        err(9);
      le += l + 4;
    }
  }
  return le;
};
var wzh = function(d, b, f, fn, u, c, ce, co) {
  var fl2 = fn.length, ex = f.extra, col = co && co.length;
  var exl = exfl(ex);
  wbytes(d, b, ce != null ? 33639248 : 67324752), b += 4;
  if (ce != null)
    d[b++] = 20, d[b++] = f.os;
  d[b] = 20, b += 2;
  d[b++] = f.flag << 1 | (c < 0 && 8), d[b++] = u && 8;
  d[b++] = f.compression & 255, d[b++] = f.compression >> 8;
  var dt = new Date(f.mtime == null ? Date.now() : f.mtime), y = dt.getFullYear() - 1980;
  if (y < 0 || y > 119)
    err(10);
  wbytes(d, b, y << 25 | dt.getMonth() + 1 << 21 | dt.getDate() << 16 | dt.getHours() << 11 | dt.getMinutes() << 5 | dt.getSeconds() >> 1), b += 4;
  if (c != -1) {
    wbytes(d, b, f.crc);
    wbytes(d, b + 4, c < 0 ? -c - 2 : c);
    wbytes(d, b + 8, f.size);
  }
  wbytes(d, b + 12, fl2);
  wbytes(d, b + 14, exl), b += 16;
  if (ce != null) {
    wbytes(d, b, col);
    wbytes(d, b + 6, f.attrs);
    wbytes(d, b + 10, ce), b += 14;
  }
  d.set(fn, b);
  b += fl2;
  if (exl) {
    for (var k in ex) {
      var exf = ex[k], l = exf.length;
      wbytes(d, b, +k);
      wbytes(d, b + 2, l);
      d.set(exf, b + 4), b += 4 + l;
    }
  }
  if (col)
    d.set(co, b), b += col;
  return b;
};
var wzf = function(o, b, c, d, e) {
  wbytes(o, b, 101010256);
  wbytes(o, b + 8, c);
  wbytes(o, b + 10, c);
  wbytes(o, b + 12, d);
  wbytes(o, b + 16, e);
};
function zipSync(data, opts) {
  if (!opts)
    opts = {};
  var r = {};
  var files = [];
  fltn(data, "", r, opts);
  var o = 0;
  var tot = 0;
  for (var fn in r) {
    var _a2 = r[fn], file = _a2[0], p = _a2[1];
    var compression = p.level == 0 ? 0 : 8;
    var f = strToU8(fn), s = f.length;
    var com = p.comment, m = com && strToU8(com), ms = m && m.length;
    var exl = exfl(p.extra);
    if (s > 65535)
      err(11);
    var d = compression ? deflateSync(file, p) : file, l = d.length;
    var c = crc();
    c.p(file);
    files.push(mrg(p, {
      size: file.length,
      crc: c.d(),
      c: d,
      f,
      m,
      u: s != fn.length || m && com.length != ms,
      o,
      compression
    }));
    o += 30 + s + exl + l;
    tot += 76 + 2 * (s + exl) + (ms || 0) + l;
  }
  var out = new u8(tot + 22), oe = o, cdl = tot - o;
  for (var i2 = 0; i2 < files.length; ++i2) {
    var f = files[i2];
    wzh(out, f.o, f, f.f, f.u, f.c.length);
    var badd = 30 + f.f.length + exfl(f.extra);
    out.set(f.c, f.o + badd);
    wzh(out, o, f, f.f, f.u, f.c.length, f.o, f.m), o += 16 + badd + (f.m ? f.m.length : 0);
  }
  wzf(out, o, files.length, cdl, oe);
  return out;
}

// cli/src/pack.ts
var FIXED_MTIME = new Date(2026, 0, 1, 0, 0, 0);
function stampGenerator(manifestText, helperVersion) {
  let raw;
  try {
    raw = JSON.parse(manifestText);
  } catch {
    return manifestText;
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw) || "generator" in raw) return manifestText;
  return JSON.stringify({ ...raw, generator: { name: "validai-share", version: helperVersion } }, null, 2) + "\n";
}
function buildPackage(manifestText, files, helperVersion) {
  const text = helperVersion ? stampGenerator(manifestText, helperVersion) : manifestText;
  const entries = { "validai-flows.json": strToU8(text) };
  for (const f of files) entries[`bundle/${f.path}`] = new Uint8Array(Buffer.from(f.contentBase64, "base64"));
  return zipSync(entries, { level: 6, mtime: FIXED_MTIME });
}
function packageFileName(manifest, fallbackName) {
  return `${suggestKey(manifest.prototype?.name || fallbackName) || "prototype"}.validai`;
}

// cli/src/serve.ts
import { createServer } from "node:http";

// cli/src/dryrun/record.ts
import { existsSync as existsSync4, readFileSync as readFileSync5, writeFileSync as writeFileSync3 } from "node:fs";
var RECORD_FILE = "validai-dryrun.json";
function emptyRecord() {
  return { version: 1, flows: [] };
}
function applyEvent(file, event, now) {
  const flows = file.flows.map((f) => ({ ...f, steps: [...f.steps] }));
  if (event.type === "flow-start") {
    const fresh = { flowKey: event.flowKey, startedAt: now, steps: [] };
    const i2 = flows.findIndex((f) => f.flowKey === event.flowKey);
    if (i2 >= 0) flows[i2] = fresh;
    else flows.push(fresh);
    return { version: 1, flows };
  }
  let flow = flows.find((f) => f.flowKey === event.flowKey);
  if (!flow) {
    flow = { flowKey: event.flowKey, startedAt: now, steps: [] };
    flows.push(flow);
  }
  if (event.type === "step") {
    const j = flow.steps.findIndex((s) => s.stepKey === event.step.stepKey);
    if (j >= 0) flow.steps[j] = event.step;
    else flow.steps.push(event.step);
  } else if (event.type === "tracker-missing") {
    flow.trackerMissing = true;
  } else {
    flow.finishedAt = now;
  }
  return { version: 1, flows };
}
var OUTCOME_TEXT = { completed: "completed", skipped: "skipped", "self-reported": "marked done" };
function formatEventLine(event, flow) {
  const name = `Flow "${flow?.name ?? event.flowKey}"`;
  if (event.type === "flow-start") return `${name} started`;
  if (event.type === "flow-end") return `${name} finished`;
  if (event.type === "tracker-missing") return `${name} \u26A0 tracking isn't loading in this build`;
  const s = event.step;
  const n = (flow?.steps.findIndex((x2) => x2.key === s.stepKey) ?? -1) + 1;
  const mark = s.outcome === "skipped" ? "\u2717" : "\u2713";
  const hint = s.hintUsed ? ", needed the hint" : "";
  const click = [...s.events].reverse().find((e) => e.type === "click" && (e.tag || e.label));
  const clicked = s.outcome === "completed" && click ? ` (clicked ${click.tag ?? `"${click.label}"`})` : "";
  const problems = s.problems.length > 0 ? ` \u26A0 ${s.problems.join("; ")}` : "";
  return `${name} \xB7 step ${n > 0 ? n : s.stepKey} ${mark} ${OUTCOME_TEXT[s.outcome]}${hint}${clicked}${problems}`;
}
function readRecord(path) {
  if (!existsSync4(path)) return emptyRecord();
  try {
    const parsed = JSON.parse(readFileSync5(path, "utf-8"));
    return parsed && parsed.version === 1 && Array.isArray(parsed.flows) ? parsed : emptyRecord();
  } catch {
    return emptyRecord();
  }
}
function writeRecord(path, file) {
  writeFileSync3(path, JSON.stringify(file, null, 2) + "\n");
}

// cli/src/dryrun/screenFlow.ts
function buildScreenFlow(flow) {
  let n = 0;
  const mapped = mapFlow(flow, { importKey: flow.key, name: flow.name }, {
    uid: "dry-run",
    prototypeId: "dry-run",
    now: 0,
    newId: () => `s${++n}`
  });
  const stepQuestions = {};
  for (const s of flow.steps) if (s.intercept) stepQuestions[s.key] = [s.intercept.question];
  return {
    key: flow.key,
    title: flow.testTitle?.trim() || flow.name,
    ...flow.testIntro?.trim() ? { intro: flow.testIntro.trim() } : {},
    steps: mapped.steps,
    stepQuestions,
    endQuestions: (flow.endIntercepts ?? []).map((q) => q.question)
  };
}

// cli/src/serve.ts
var DEFAULT_PORT = 4317;
var PORT_TRIES = 20;
var DEFAULT_IDLE_MS = 30 * 60 * 1e3;
var MAX_BODY = 1024 * 1024;
var TYPES = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  txt: "text/plain; charset=utf-8"
};
function ext(path) {
  const m = /\.([a-z0-9]+)$/i.exec(path);
  return m ? m[1].toLowerCase() : "";
}
function injectDryRunTracker(html, origin) {
  const script = `<script>window.__PROTOTEST_APP_ORIGIN=${JSON.stringify(origin)}</script>
<script src="/__prototest_tracker.js"></script>`;
  const bodyClose = html.lastIndexOf("</body>");
  if (bodyClose !== -1) return html.slice(0, bodyClose) + script + "\n" + html.slice(bodyClose);
  return html + "\n" + script;
}
function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}
function screenPage(flowKey, name) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><link rel="icon" href="data:,"><title>Dry run \xB7 ${escapeHtml(name)}</title>
<style>
  html,body{margin:0;height:100%;font:15px/1.4 system-ui,sans-serif;color:#111}
  body{display:flex;flex-direction:column}
  #bar{padding:12px 16px;border-bottom:1px solid #ddd;background:#f7f7fb;max-height:40vh;overflow:auto}
  #bar button{font:inherit;margin:6px 8px 0 0;padding:6px 12px;border:1px solid #888;border-radius:6px;background:#fff;cursor:pointer}
  #bar .warn{color:#a40000}
  #app{flex:1;border:0;width:100%}
</style></head>
<body><div id="bar" aria-live="polite"></div><iframe id="app" src="/" title="Prototype"></iframe>
<script>window.__DRYRUN_FLOW_KEY=${JSON.stringify(flowKey)}</script>
<script src="/__dryrun/screen.js"></script>
</body></html>`;
}
function cleanProblem(s) {
  return s.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 300);
}
function isDryRunEvent(v, keys) {
  if (!v || typeof v !== "object") return false;
  const e = v;
  if (typeof e.flowKey !== "string" || !keys.has(e.flowKey)) return false;
  if (e.type === "flow-start" || e.type === "flow-end" || e.type === "tracker-missing") return true;
  if (e.type !== "step" || !e.step || typeof e.step !== "object") return false;
  const s = e.step;
  return typeof s.stepKey === "string" && (s.outcome === "completed" || s.outcome === "skipped" || s.outcome === "self-reported") && typeof s.hintUsed === "boolean" && Array.isArray(s.events) && Array.isArray(s.problems);
}
function readBody(req) {
  return new Promise((resolve3) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        resolve3(null);
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve3(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", () => resolve3(null));
  });
}
function listen(server, port) {
  return new Promise((resolve3, reject) => {
    const onError = (err2) => {
      server.off("listening", onListening);
      if (err2.code === "EADDRINUSE") resolve3(false);
      else reject(err2);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve3(true);
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, "127.0.0.1");
  });
}
async function startServe(opts) {
  const log = opts.log ?? ((l) => console.log(l));
  const now = opts.now ?? Date.now;
  const idleMs = opts.idleMs ?? DEFAULT_IDLE_MS;
  const files = new Map(opts.files.map((f) => [f.path, Buffer.from(f.contentBase64, "base64")]));
  const flows = new Map(opts.manifest.taskFlows.map((f) => [f.key, f]));
  const flowKeys = new Set(flows.keys());
  let notFound = [];
  let origin = "";
  let port = -1;
  function send(res, status, body, type = "text/plain; charset=utf-8") {
    res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
    res.end(body);
  }
  function sendFile(res, path) {
    const body = files.get(path);
    const e = ext(path);
    if (e === "html" || e === "htm") send(res, 200, injectDryRunTracker(body.toString("utf-8"), origin), TYPES.html);
    else send(res, 200, body, TYPES[e] ?? "application/octet-stream");
  }
  async function handleEvent(req, res) {
    if (!String(req.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
      send(res, 415, "Send application/json");
      return;
    }
    const sentOrigin = req.headers.origin;
    if (sentOrigin !== void 0 && sentOrigin !== origin && sentOrigin !== `http://localhost:${port}`) {
      send(res, 403, "Forbidden");
      return;
    }
    const text = await readBody(req);
    let event;
    try {
      event = text === null ? null : JSON.parse(text);
    } catch {
      event = null;
    }
    if (!isDryRunEvent(event, flowKeys)) {
      send(res, 400, "Bad event");
      return;
    }
    if (event.type === "step") {
      const problems = [...event.step.problems.filter((p) => typeof p === "string"), ...notFound].map(cleanProblem);
      notFound = [];
      event = { ...event, step: { ...event.step, problems } };
    }
    const e = event;
    try {
      writeRecord(opts.recordPath, applyEvent(readRecord(opts.recordPath), e, now()));
    } catch (err2) {
      log(`\u26A0 Couldn't save the dry run record: ${err2 instanceof Error ? err2.message : String(err2)}`);
      send(res, 500, "Could not save the record");
      return;
    }
    log(formatEventLine(e, flows.get(e.flowKey)));
    res.writeHead(204).end();
  }
  function handle(req, res) {
    if (req.headers.host !== `127.0.0.1:${port}` && req.headers.host !== `localhost:${port}`) {
      send(res, 403, "Forbidden");
      return;
    }
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    let path;
    try {
      path = decodeURIComponent(url.pathname);
    } catch {
      send(res, 400, "Bad path");
      return;
    }
    if (path === "/__dryrun/events" && req.method === "POST") {
      void handleEvent(req, res);
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      send(res, 405, "Method not allowed");
      return;
    }
    if (path === "/__dryrun/screen.js") {
      send(res, 200, opts.assets.screenJs, TYPES.js);
      return;
    }
    if (path === "/__prototest_tracker.js") {
      send(res, 200, opts.assets.trackerJs, TYPES.js);
      return;
    }
    if (path === "/__prototest_rrweb_record.js") {
      send(res, 200, "/* no recording in a dry run */", TYPES.js);
      return;
    }
    const screen = /^\/__dryrun\/([a-z0-9-]+)(\/flow\.json)?$/.exec(path);
    if (screen) {
      const flow = flows.get(screen[1]);
      if (!flow) {
        send(res, 404, "No such flow");
        return;
      }
      if (screen[2]) send(res, 200, JSON.stringify(buildScreenFlow(flow)), TYPES.json);
      else send(res, 200, screenPage(flow.key, flow.name), TYPES.html);
      return;
    }
    const rel = path.replace(/^\/+/, "");
    const candidates = rel === "" || rel.endsWith("/") ? [`${rel}index.html`] : [rel, `${rel}/index.html`];
    const hit = candidates.find((c) => files.has(c));
    if (hit) {
      sendFile(res, hit);
      return;
    }
    if (ext(rel) === "" && files.has("index.html")) {
      sendFile(res, "index.html");
      return;
    }
    if (path === "/favicon.ico") {
      send(res, 404, "Not found");
      return;
    }
    notFound.push(`Not found: ${path}`);
    log(`\u26A0 Not found: ${path}`);
    send(res, 404, "Not found");
  }
  let idleTimer;
  let resolveClosed;
  const closed = new Promise((r) => {
    resolveClosed = r;
  });
  const server = createServer((req, res) => {
    resetIdle();
    handle(req, res);
  });
  server.on("close", () => resolveClosed());
  let closing = null;
  function close() {
    if (!closing) {
      clearTimeout(idleTimer);
      closing = new Promise((r) => {
        server.close(() => r());
        server.closeAllConnections();
      });
    }
    return closing;
  }
  function resetIdle() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      log(`Stopped after ${Math.round(idleMs / 6e4)} minutes with no activity.`);
      void close();
    }, idleMs);
    idleTimer.unref?.();
  }
  const first = opts.port ?? DEFAULT_PORT;
  for (let p = first; p < first + PORT_TRIES; p += 1) {
    if (await listen(server, p)) {
      port = p;
      break;
    }
  }
  if (port < 0) throw new Error(`No free port from ${first} to ${first + PORT_TRIES - 1}. Pass --port to choose another.`);
  origin = `http://127.0.0.1:${port}`;
  resetIdle();
  return {
    origin,
    urls: opts.manifest.taskFlows.map((f) => ({ flowKey: f.key, name: f.name, url: `${origin}/__dryrun/${f.key}` })),
    recordPathForTests: opts.recordPath,
    close,
    closed
  };
}

// cli/src/dryrun/assets.ts
function embeddedAssets() {
  if (false) return null;
  return { trackerJs: "(function () {\n  'use strict';\n  if (window.__prototest_tracker) return;\n  window.__prototest_tracker = true;\n\n  var BATCH_INTERVAL = 2000;\n  var RAGE_THRESHOLD = 3;\n  var RAGE_WINDOW = 800;\n  var SCROLL_THROTTLE = 1000;\n  var buffer = [];\n  var clickLog = []; // {target, time} for rage detection\n  var maxScrollPct = 0;\n  var pageEnterTime = Date.now();\n\n  // A path-token segment (~t.<token>, a bearer credential with\n  // bundle.pathToken on) right after a /__bundle/<pid>/<ver>/ or\n  // /__proxy/<enc>/ prefix, anywhere in a string. The token match is the\n  // token's own alphabet (base64url \".\" base64url, see server/pathToken.ts), so\n  // what follows it is kept; a `/` that ends it goes too, a `?`/`#` stays. A\n  // `~t.` that does not follow such a prefix is not a token and is left alone.\n  // Shared by cleanUrl and the rrweb recording scrub below.\n  var RECORDED_PATH_TOKEN_RE =\n    /(\\/__(?:bundle\\/[^\\/?#\\s\"'`()<>\\\\]+\\/[^\\/?#\\s\"'`()<>\\\\]+|proxy\\/[A-Za-z0-9_-]+)\\/)(?:~t\\.[A-Za-z0-9_.-]*\\/?)+/g;\n\n  // Strip the proxy prefix and every path-token segment from URLs for clean\n  // reporting: the page's own, and any tokenised URL the page echoes in its\n  // query (a `?r=` return path, Task 4 re-review O1).\n  function cleanUrl(url) {\n    if (url.indexOf('~t.') !== -1) url = url.replace(RECORDED_PATH_TOKEN_RE, '$1');\n    return url.replace(/\\/__proxy\\/[A-Za-z0-9_-]+/, '');\n  }\n\n  function getSelector(el) {\n    if (!el || !el.tagName) return '';\n    var parts = [el.tagName.toLowerCase()];\n    if (el.id) parts.push('#' + el.id);\n    if (el.className && typeof el.className === 'string') {\n      var classes = el.className.trim().split(/\\s+/).slice(0, 3).join('.');\n      if (classes) parts.push('.' + classes);\n    }\n    return parts.join('');\n  }\n\n  function getLabel(el) {\n    if (!el) return '';\n    var text = el.getAttribute('aria-label')\n      || el.getAttribute('title')\n      || (el.innerText || '').trim().slice(0, 60);\n    return text;\n  }\n\n  // Get text context from parent/ancestor elements (for compound matching)\n  function getContext(el) {\n    if (!el) return '';\n    var parts = [];\n    var node = el;\n    for (var i = 0; i < 5 && node && node !== document.body; i++) {\n      var text = (node.innerText || '').trim().slice(0, 200);\n      if (text) parts.push(text);\n      node = node.parentElement;\n    }\n    return parts.join(' | ');\n  }\n\n  // data-validai-target of the element or its closest tagged ancestor. closest()\n  // because clicks usually land on a child span/icon inside the tagged control.\n  function getValidaiTarget(el) {\n    var node = el && el.closest ? el.closest('[data-validai-target]') : null;\n    return node ? node.getAttribute('data-validai-target') || '' : '';\n  }\n\n  // Tag for a <select> change: the chosen <option>'s own tag (or a tagged\n  // element between it and the select, e.g. an <optgroup>) when present, so\n  // options of one select stay distinguishable; otherwise the select's tag.\n  function getSelectValidaiTarget(sel) {\n    var opt = sel.options && sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex] : null;\n    var node = opt && opt.closest ? opt.closest('[data-validai-target]') : null;\n    if (node && node !== sel && sel.contains(node)) {\n      var own = node.getAttribute('data-validai-target') || '';\n      if (own) return { tag: own, fromOption: true };\n    }\n    return { tag: getValidaiTarget(sel), fromOption: false };\n  }\n\n  // Clicks that only open a <select> (or land on an <option>) or put the caret\n  // in a text field are not the interaction itself: the choice is judged from\n  // the select's change event, and typing from the field's change. Such clicks\n  // carry no validaiTarget and are flagged so tagged targets aren't text-matched.\n  var NON_TEXT_INPUT_TYPES = { button: 1, submit: 1, reset: 1, checkbox: 1, radio: 1, image: 1, file: 1, color: 1, range: 1 };\n  function isFieldClick(el) {\n    if (!el || !el.closest) return false;\n    if (el.closest('select, option')) return true;\n    if (el.tagName === 'TEXTAREA') return true;\n    if (el.tagName === 'INPUT') return !NON_TEXT_INPUT_TYPES[(el.getAttribute('type') || 'text').toLowerCase()];\n    return false;\n  }\n\n  function emit(type, data) {\n    buffer.push({\n      type: type,\n      timestamp: Date.now(),\n      url: cleanUrl(location.href),\n      data: data || {}\n    });\n  }\n\n  // --- Click tracking ---\n  document.addEventListener('click', function (e) {\n    var t = e.target;\n    var now = Date.now();\n    var sel = getSelector(t);\n\n    var clickData = {\n      selector: sel,\n      label: getLabel(t),\n      context: getContext(t),\n      tag: t.tagName,\n      x: e.clientX,\n      y: e.clientY,\n      pageX: e.pageX,\n      pageY: e.pageY\n    };\n    if (isFieldClick(t)) {\n      clickData.fieldClick = true;\n    } else {\n      var vt = getValidaiTarget(t);\n      if (vt) clickData.validaiTarget = vt;\n    }\n    emit('click', clickData);\n\n    // Rage click detection\n    clickLog.push({ selector: sel, time: now });\n    clickLog = clickLog.filter(function (c) { return now - c.time < RAGE_WINDOW; });\n    var sameTarget = clickLog.filter(function (c) { return c.selector === sel; });\n    if (sameTarget.length >= RAGE_THRESHOLD) {\n      emit('rage-click', { selector: sel, label: getLabel(t), clicks: sameTarget.length });\n      clickLog = [];\n    }\n  }, true);\n\n  // --- Navigation tracking ---\n  var lastPath = location.href;\n\n  function checkNav() {\n    if (location.href !== lastPath) {\n      emit('navigation', { from: cleanUrl(lastPath), to: cleanUrl(location.href) });\n      lastPath = location.href;\n    }\n  }\n\n  var origPush = history.pushState;\n  var origReplace = history.replaceState;\n  history.pushState = function () {\n    origPush.apply(this, arguments);\n    checkNav();\n  };\n  history.replaceState = function () {\n    origReplace.apply(this, arguments);\n    checkNav();\n  };\n  window.addEventListener('popstate', checkNav);\n\n  // --- Scroll depth + position ---\n  var scrollTimer = null;\n  window.addEventListener('scroll', function () {\n    if (scrollTimer) return;\n    scrollTimer = setTimeout(function () {\n      scrollTimer = null;\n      var docHeight = Math.max(\n        document.body.scrollHeight,\n        document.documentElement.scrollHeight\n      );\n      var viewHeight = window.innerHeight;\n      var scrollTop = window.scrollY || document.documentElement.scrollTop;\n      var pct = docHeight <= viewHeight ? 100 : Math.round(((scrollTop + viewHeight) / docHeight) * 100);\n      if (pct > maxScrollPct) maxScrollPct = pct;\n      emit('scroll', { scrollTop: scrollTop, scrollPct: pct, maxScrollPct: maxScrollPct });\n    }, SCROLL_THROTTLE);\n  }, { passive: true });\n\n  // --- Mouse movement (10fps throttled) ---\n  var MOUSE_INTERVAL = 100; // 10fps\n  var lastMouseEmit = 0;\n  var mouseBuffer = [];\n  var mouseFlushTimer = null;\n\n  document.addEventListener('mousemove', function (e) {\n    var now = Date.now();\n    if (now - lastMouseEmit < MOUSE_INTERVAL) return;\n    lastMouseEmit = now;\n    mouseBuffer.push({\n      x: e.clientX,\n      y: e.clientY,\n      t: now\n    });\n  }, { passive: true });\n\n  // Batch mouse positions into single events every 2 seconds\n  setInterval(function () {\n    if (mouseBuffer.length === 0) return;\n    var batch = mouseBuffer.slice();\n    mouseBuffer = [];\n    emit('mousemove', { positions: batch });\n  }, BATCH_INTERVAL);\n\n  // --- Form interactions ---\n  // Focus deliberately carries no validaiTarget: focusing a tagged control is\n  // not the interaction a step expects, and a tag would make it a match.\n  document.addEventListener('focus', function (e) {\n    var t = e.target;\n    if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') {\n      emit('form-interaction', {\n        action: 'focus',\n        field: t.name || t.id || getSelector(t),\n        inputType: t.type || t.tagName.toLowerCase()\n      });\n    }\n  }, true);\n\n  document.addEventListener('change', function (e) {\n    var t = e.target;\n    if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') {\n      var data = {\n        action: 'change',\n        field: t.name || t.id || getSelector(t),\n        inputType: t.type || t.tagName.toLowerCase()\n      };\n      // For selects, capture the selected option text (not value) for auto-complete matching\n      if (t.tagName === 'SELECT' && t.options && t.selectedIndex >= 0) {\n        data.selectedText = t.options[t.selectedIndex].textContent.trim();\n        data.label = data.selectedText;\n        data.context = getContext(t);\n      }\n      if (t.tagName === 'SELECT') {\n        var svt = getSelectValidaiTarget(t);\n        if (svt.tag) data.validaiTarget = svt.tag;\n        if (svt.tag && svt.fromOption) data.validaiTargetFromOption = true;\n      } else {\n        var vt = getValidaiTarget(t);\n        if (vt) data.validaiTarget = vt;\n      }\n      emit('form-interaction', data);\n    }\n  }, true);\n\n  // --- Page enter ---\n  emit('page-enter', {\n    viewport: { width: window.innerWidth, height: window.innerHeight },\n    screenSize: { width: screen.width, height: screen.height },\n    userAgent: navigator.userAgent,\n    referrer: document.referrer ? cleanUrl(document.referrer) : ''\n  });\n\n  // --- Viewport resize ---\n  var resizeTimer = null;\n  window.addEventListener('resize', function () {\n    clearTimeout(resizeTimer);\n    resizeTimer = setTimeout(function () {\n      emit('viewport-resize', { width: window.innerWidth, height: window.innerHeight });\n    }, 500);\n  });\n\n  // --- Page exit ---\n  window.addEventListener('beforeunload', function () {\n    emit('page-exit', {\n      timeOnPage: Math.round((Date.now() - pageEnterTime) / 1000),\n      maxScrollPct: maxScrollPct\n    });\n    flush();\n  });\n\n  // --- rrweb DOM Recording ---\n  // Recording-batch token scrub. With bundle.pathToken on, this page's URL holds\n  // a `~t.<token>` bearer segment right after /__bundle/<pid>/<ver>/ or\n  // /__proxy/<enc>/, and rrweb records it (Meta href, absolutised src/href/\n  // srcset, inlined CSS, mutations). Stored recordings must never hold a usable\n  // token, so every batch is walked (arrays and plain objects; string values\n  // only) and every leading token segment is dropped from bundle/proxy URLs,\n  // like splitPathToken: a `/` that ends it goes too, a `?`/`#` stays. The token\n  // match is the token's own alphabet (base64url \".\" base64url, see\n  // server/pathToken.ts), so text after it (`,` in a compact srcset, prose) is\n  // kept. Copy-on-write: unchanged events are posted as the very same objects\n  // (no token == no-op), and rrweb's own event objects are never mutated.\n  // Fails closed: if the walk throws, the same regex runs over the serialised\n  // batch (its classes exclude `\"` and `\\`, so a match never leaves a JSON\n  // string); if that fails too the batch is dropped, never posted unscrubbed.\n  // (RECORDED_PATH_TOKEN_RE is defined with cleanUrl, at the top.)\n  //\n  // Skipped entirely while this page's URL has never held a `~t.` segment\n  // (final review, finding 9): a token can only reach the recording through\n  // the page's own URL or one it echoes, so with the flag off (or any untokenised\n  // page) the walk is pure cost. Latched: once the URL has held one, every later\n  // batch is scrubbed even after a pushState away from it (absolutised URLs\n  // already in the DOM still carry the token). If location cannot be read, it\n  // scrubs (fail closed).\n  var pageHadPathToken = false;\n  function pageHasPathToken() {\n    if (!pageHadPathToken) {\n      try { pageHadPathToken = String(window.location.href).indexOf('~t.') !== -1; } catch (e) { pageHadPathToken = true; }\n    }\n    return pageHadPathToken;\n  }\n  function scrubRecordedTokens(value) {\n    if (typeof value === 'string') {\n      return value.indexOf('~t.') === -1 ? value : value.replace(RECORDED_PATH_TOKEN_RE, '$1');\n    }\n    if (!value || typeof value !== 'object') return value;\n    var copy = null;\n    var i, v;\n    if (Array.isArray(value)) {\n      for (i = 0; i < value.length; i++) {\n        v = scrubRecordedTokens(value[i]);\n        if (v !== value[i]) { if (!copy) copy = value.slice(); copy[i] = v; }\n      }\n      return copy || value;\n    }\n    if (Object.prototype.toString.call(value) !== '[object Object]') return value;\n    for (var k in value) {\n      if (!Object.prototype.hasOwnProperty.call(value, k)) continue;\n      v = scrubRecordedTokens(value[k]);\n      if (v !== value[k]) {\n        if (!copy) { copy = {}; for (var k2 in value) { if (Object.prototype.hasOwnProperty.call(value, k2)) copy[k2] = value[k2]; } }\n        copy[k] = v;\n      }\n    }\n    return copy || value;\n  }\n  function scrubRecordingBatch(events) {\n    if (!pageHasPathToken()) return events;\n    try { return scrubRecordedTokens(events); } catch (e) { /* fall through to the text scrub */ }\n    try {\n      var text = JSON.stringify(events);\n      return JSON.parse(text.indexOf('~t.') === -1 ? text : text.replace(RECORDED_PATH_TOKEN_RE, '$1'));\n    } catch (e2) {\n      console.warn('[tracker] recording batch dropped: could not scrub path tokens');\n      return [];\n    }\n  }\n\n  // Set once rrweb is recording: posts the pending rrweb events immediately.\n  var flushRecordingNow = null;\n\n  var rrwebScript = document.createElement('script');\n  rrwebScript.src = '/__prototest_rrweb_record.js';\n  rrwebScript.onload = function () {\n    if (!window.rrwebRecord) {\n      console.warn('[tracker] rrweb record not available');\n      return;\n    }\n\n    var rrwebEvents = [];\n\n    function startRrwebRecording() {\n      window.__rrwebStopFn = window.rrwebRecord({\n        emit: function (event) {\n          rrwebEvents.push(event);\n        },\n        recordCrossOriginIframes: false,\n        maskAllInputs: false,\n      });\n\n      // Flush rrweb events to parent every 5 seconds\n      setInterval(function () {\n        if (rrwebEvents.length === 0) return;\n        var batch = rrwebEvents.slice();\n        rrwebEvents = [];\n        if (window.parent !== window) {\n          window.parent.postMessage({\n            type: 'PROTOTEST_RECORDING_BATCH',\n            events: scrubRecordingBatch(batch),\n          }, window.__PROTOTEST_APP_ORIGIN || '*');\n        }\n      }, 5000);\n\n      // On request (End Session): post what's pending now, flagged as the reply.\n      flushRecordingNow = function () {\n        var pending = rrwebEvents;\n        rrwebEvents = [];\n        window.parent.postMessage({\n          type: 'PROTOTEST_RECORDING_BATCH',\n          events: scrubRecordingBatch(pending),\n          flush: true,\n        }, window.__PROTOTEST_APP_ORIGIN || '*');\n      };\n\n      // Final flush on page unload\n      window.addEventListener('beforeunload', function () {\n        if (rrwebEvents.length > 0 && window.parent !== window) {\n          window.parent.postMessage({\n            type: 'PROTOTEST_RECORDING_BATCH',\n            events: scrubRecordingBatch(rrwebEvents),\n          }, window.__PROTOTEST_APP_ORIGIN || '*');\n        }\n      });\n\n      console.log('[tracker] rrweb recording started');\n    }\n\n    // Take rrweb's initial full snapshot only AFTER the prototype has rendered.\n    // SPAs (React/Vue/etc.) mount asynchronously \u2014 and even slower through the proxy \u2014\n    // so recording immediately captures an EMPTY snapshot (blank #root), which replays\n    // as a black screen with only the mouse cursor. Static HTML prototypes pass on the\n    // first check. Capped at 10s so a genuinely content-less prototype still records.\n    function hasRenderedContent() {\n      var root = document.querySelector('#root, #app, [data-reactroot], main') || document.body;\n      return !!(root && root.children && root.children.length > 0 &&\n        (document.body.textContent || '').trim().length > 0);\n    }\n    var waitedMs = 0;\n    (function waitForRender() {\n      if (hasRenderedContent() || waitedMs >= 10000) {\n        startRrwebRecording();\n        return;\n      }\n      waitedMs += 200;\n      setTimeout(waitForRender, 200);\n    })();\n  };\n  rrwebScript.onerror = function () {\n    console.warn('[tracker] Failed to load rrweb record module');\n  };\n  document.head.appendChild(rrwebScript);\n\n  // --- Appearance detection (completionType: 'appearance') ---\n  // Watches for a target element to appear (and become visible) in the DOM,\n  // then reports it to the parent via a dedicated postMessage channel. This\n  // never calls emit() \u2014 it must add zero persisted clickstream events.\n  var appearanceObserver = null;\n  var appearanceSelector = null;\n  var appearanceLabel = null;\n  var appearanceFired = false;\n  var APPEARANCE_THROTTLE = 200;\n  var appearanceThrottleTimer = null;\n  var appearanceThrottlePending = false;\n\n  // Visibility rule mirrors src/utils/stepCompletion.ts `isElementVisible`:\n  // an element is visible when it has a nonzero layout box OR an offsetParent.\n  // Duplicated here because this plain-JS injected file cannot import from\n  // the app's TS sources.\n  function isElementVisible(el) {\n    if (!el) return false;\n    try {\n      var rect = el.getBoundingClientRect();\n      var hasBox = rect.width > 0 && rect.height > 0;\n      // offsetParent is HTML-only; on non-HTMLElements (e.g. SVGElement) it's\n      // undefined, and undefined !== null would wrongly read as \"visible\".\n      // Only trust it for actual HTMLElements \u2014 everything else relies on hasBox.\n      var hasOffsetParent = el instanceof HTMLElement ? el.offsetParent !== null : false;\n      return hasBox || hasOffsetParent;\n    } catch (e) {\n      return false;\n    }\n  }\n\n  // Finds a visible element matching the current watch request, or null.\n  // Selector-based match takes priority. The label fallback matches only the\n  // element that DIRECTLY renders the label \u2014 one of its own child text nodes\n  // contains the substring \u2014 rather than any element whose aggregated\n  // textContent contains it. This is a single O(n) pass (no per-candidate\n  // descendant re-scan) and inherently skips containers like <body> that only\n  // aggregate the label from a descendant, so pre-existing page text (e.g. a\n  // nav link) can't false-positive before the real target renders. Exceptions\n  // (e.g. a bad selector) are caught by checkAppearance's try/catch.\n  function findAppearanceMatch() {\n    if (appearanceSelector) {\n      var el = document.querySelector(appearanceSelector);\n      return isElementVisible(el) ? el : null;\n    }\n    if (appearanceLabel) {\n      var needle = appearanceLabel.toLowerCase();\n      var all = document.querySelectorAll('*');\n      for (var i = 0; i < all.length; i++) {\n        var candidate = all[i];\n        if (!isElementVisible(candidate)) continue;\n        var nodes = candidate.childNodes;\n        for (var k = 0; k < nodes.length; k++) {\n          var n = nodes[k];\n          if (n.nodeType === 3 && (n.nodeValue || '').toLowerCase().indexOf(needle) !== -1) {\n            return candidate;\n          }\n        }\n      }\n    }\n    return null;\n  }\n\n  function disconnectAppearanceObserver() {\n    if (appearanceObserver) {\n      appearanceObserver.disconnect();\n      appearanceObserver = null;\n    }\n    if (appearanceThrottleTimer) {\n      clearTimeout(appearanceThrottleTimer);\n      appearanceThrottleTimer = null;\n    }\n    appearanceThrottlePending = false;\n  }\n\n  function checkAppearance() {\n    if (appearanceFired) return;\n    var match;\n    try {\n      match = findAppearanceMatch();\n    } catch (e) {\n      return; // bad selector or similar \u2014 never let this crash the prototype\n    }\n    if (!match) return;\n    appearanceFired = true;\n    disconnectAppearanceObserver();\n    try {\n      window.parent.postMessage({\n        type: 'PROTOTEST_APPEARANCE',\n        selector: appearanceSelector,\n        label: appearanceLabel\n      }, window.__PROTOTEST_APP_ORIGIN || '*');\n    } catch (e) { /* ignore */ }\n  }\n\n  // Throttled MutationObserver callback so a busy DOM doesn't thrash checks.\n  function onAppearanceMutation() {\n    if (appearanceThrottlePending) return;\n    appearanceThrottlePending = true;\n    appearanceThrottleTimer = setTimeout(function () {\n      appearanceThrottlePending = false;\n      appearanceThrottleTimer = null;\n      try {\n        checkAppearance();\n      } catch (e) { /* never let observer crash the prototype */ }\n    }, APPEARANCE_THROTTLE);\n  }\n\n  function startWatchingAppearance(selector, label) {\n    disconnectAppearanceObserver();\n    appearanceSelector = selector || null;\n    appearanceLabel = label || null;\n    appearanceFired = false;\n\n    checkAppearance(); // element may already be present\n    if (appearanceFired) return;\n\n    try {\n      appearanceObserver = new MutationObserver(onAppearanceMutation);\n      appearanceObserver.observe(document, {\n        childList: true,\n        subtree: true,\n        attributes: true\n      });\n    } catch (e) { /* ignore \u2014 environment without MutationObserver support */ }\n  }\n\n  function clearWatchingAppearance() {\n    disconnectAppearanceObserver();\n    appearanceSelector = null;\n    appearanceLabel = null;\n    appearanceFired = false;\n  }\n\n  window.addEventListener('message', function (e) {\n    var msg = e.data;\n    if (!msg || typeof msg !== 'object') return;\n    try {\n      if (msg.type === 'PROTOTEST_WATCH_APPEARANCE') {\n        startWatchingAppearance(msg.selector, msg.label);\n      } else if (msg.type === 'PROTOTEST_CLEAR_APPEARANCE') {\n        clearWatchingAppearance();\n      } else if (msg.type === 'PROTOTEST_SURVEY_MARK') {\n        if (msg.phase === 'open' || msg.phase === 'close') {\n          if (window.rrwebRecord && typeof window.rrwebRecord.addCustomEvent === 'function') {\n            window.rrwebRecord.addCustomEvent('validai-survey', { phase: msg.phase });\n          }\n        }\n      } else if (msg.type === 'PROTOTEST_FLUSH_RECORDING') {\n        // End Session: post pending recording events now rather than on the next\n        // 5 s tick, which would never come once the page navigates away. Always\n        // answer (even with nothing) so the parent can stop waiting early.\n        if (e.source !== window.parent) return;\n        if (flushRecordingNow) {\n          flushRecordingNow();\n        } else {\n          window.parent.postMessage({ type: 'PROTOTEST_RECORDING_BATCH', events: [], flush: true },\n            window.__PROTOTEST_APP_ORIGIN || '*');\n        }\n      } else if (msg.type === 'PROTOTEST_RRWEB_SNAPSHOT') {\n        // The run just became active: start the uploaded recording at a fresh\n        // Meta + FullSnapshot (batches from before Start were never uploaded).\n        // Only the embedding app page may ask. Before rrweb has started (content\n        // not rendered yet) this is a no-op: the first snapshot comes on its own.\n        if (e.source !== window.parent) return;\n        if (window.__rrwebStopFn && window.rrwebRecord &&\n            typeof window.rrwebRecord.takeFullSnapshot === 'function') {\n          window.rrwebRecord.takeFullSnapshot(true);\n        }\n      }\n    } catch (e2) { /* never let inbound messages crash the prototype */ }\n  });\n\n  // Tell the parent this tracker's inbound message listener is now live.\n  // Guards against a race where an `appearance` step is first in the flow:\n  // the parent may post PROTOTEST_WATCH_APPEARANCE before this listener\n  // exists, silently dropping it. On receiving this signal, the parent\n  // re-posts the watch for whichever appearance step is currently active.\n  try {\n    if (window.parent && window.parent !== window) {\n      window.parent.postMessage({ type: 'PROTOTEST_TRACKER_READY' }, window.__PROTOTEST_APP_ORIGIN || '*');\n    }\n  } catch (e) { /* ignore */ }\n\n  // --- Batch flush via postMessage ---\n  function flush() {\n    if (buffer.length === 0) return;\n    var batch = buffer.slice();\n    buffer = [];\n    try {\n      window.parent.postMessage({ type: 'PROTOTEST_EVENTS', events: batch }, window.__PROTOTEST_APP_ORIGIN || '*');\n    } catch (e) { /* ignore */ }\n  }\n\n  setInterval(flush, BATCH_INTERVAL);\n\n  // --- Page probe ---\n  // Report a sample of the visible text a few seconds after each page/route change, so\n  // the parent can tell testers when the app didn't load (e.g. an app's own bare\n  // \"Not Found\" page, or a sign-in wall). Judgement lives in src/utils/loadProblem.ts.\n  var probeTimer = null;\n  function scheduleProbe() {\n    clearTimeout(probeTimer);\n    probeTimer = setTimeout(function () {\n      if (window.parent === window) return;\n      var text = (document.body && document.body.innerText) || '';\n      try {\n        window.parent.postMessage({ type: 'PROTOTEST_PAGE_PROBE', text: text.slice(0, 500) }, window.__PROTOTEST_APP_ORIGIN || '*');\n      } catch (e) { /* ignore */ }\n    }, 3000);\n  }\n  scheduleProbe();\n  var probePush = history.pushState;\n  history.pushState = function () { probePush.apply(this, arguments); scheduleProbe(); };\n  window.addEventListener('popstate', scheduleProbe);\n})();\n", screenJs: '"use strict";(()=>{var $=/^[a-z0-9][a-z0-9-]{0,63}$/;function k(e){var t;return(t=e.completionType)!=null?t:"interaction"}function Y(e){var r,s;let t=(s=(r=e.checklistTargets)==null?void 0:r.length)!=null?s:0,n=e.checklistThreshold;return typeof n=="number"&&Number.isInteger(n)&&n>0&&n<=t?n:t}function M(e,t){var i,a;let n=(a=(i=t.checklistTargets)==null?void 0:i.length)!=null?a:0,r=Y(t);if(r<=0)return!1;let s=new Set;for(let c of e)Number.isInteger(c)&&c>=0&&c<n&&s.add(c);return s.size>=r}function I(e){let t=e.targetTag&&$.test(e.targetTag)?e.targetTag:void 0,n=t?`[data-validai-target="${t}"]`:e.targetSelector,r=e.targetLabel||e.targetText;return!n&&!r?null:{selector:n,label:r}}function O(e,t){let n=I(e);return n?n.selector?t.selector===n.selector:!!n.label&&t.label===n.label:!1}function V(e){let t=e.trim(),n=/^[\\s\\S]*?[.!?](?=\\s|$)/.exec(t);return(n?n[0]:t).trim()}function _(e){var r;let t=(r=e.completionMessage)==null?void 0:r.trim();if(t)return t;if(k(e)==="self-report")return"Marked done";let n=V(e.instruction);return n?`Step complete \\u2014 ${n}`:"Step complete."}function x(e){return e.replace(/\\s*\\(\\d+\\)\\s*$/,"").trim()}function F(e){let t=e.match(/#[A-Za-z0-9_-]+/);return t?t[0]:""}function C(e,t){if(!e||!t)return!1;if(e===t)return!0;let n=F(e),r=F(t);return n!==""&&n===r}function v(e,t,n){if(!n)return!1;let r=x((e||"").toLowerCase().trim()),s=(t||"").toLowerCase().trim();if(!r&&!s)return!1;let i=n.split("|").map(g=>x(g.trim().toLowerCase())).filter(Boolean);if(i.length===0)return!1;if(i.length===1)return r.includes(i[0])||r===i[0];let a=i[i.length-1],c=i.slice(0,-1),p=r.includes(a),f=c.every(g=>s.includes(g));return p&&f}function W(e,t){return!t||!e?"fallthrough":e===t?"match":"no-match"}function L(e){return x(e.toLowerCase().replace(/\\s+/g," ").trim())}function w(e,t){if(e.fieldClick&&t.tag)return"no-match";let n=W(e.tag,t.tag);return n!=="match"?n:e.selectedText&&t.label&&!e.tagFromOption?L(e.selectedText)===L(t.label)?"match":"no-match":"match"}function N(e,t,n,r="",s="",i={}){return n.findIndex(a=>{var p,f;let c=w({tag:s,...i},a);return c!=="fallthrough"?c==="match":a.selector&&C(r,a.selector)||v(e,t,(f=(p=a.text)!=null?p:a.label)!=null?f:"")})}var U=new Set(["click","navigation","form-interaction"]);function D(e){let t=e.data.label||e.data.selectedText||"",n=e.data.context||"",r=e.data.selector||"",s=e.data.validaiTarget||"",i={selectedText:e.data.selectedText||void 0,tagFromOption:e.data.validaiTargetFromOption===!0,fieldClick:e.data.fieldClick===!0};return{label:t,context:n,selector:r,tag:s,select:i}}function j(e,t){var s,i;if(!e)return{single:!1,checklistHits:[]};let n=k(e),r=t.filter(a=>U.has(a.type));if(n==="interaction"){for(let a of r){let{label:c,context:p,selector:f,tag:g,select:y}=D(a),h=w({tag:g,...y},{tag:e.targetTag,label:e.targetLabel});if(h==="match")return{single:!0,checklistHits:[]};if(h!=="no-match"){if(e.targetSelector&&C(f,e.targetSelector))return{single:!0,checklistHits:[]};if(v(c,p,(s=e.targetText)!=null?s:""))return{single:!0,checklistHits:[]}}}return{single:!1,checklistHits:[]}}if(n==="checklist"){let a=[];for(let c of r){let{label:p,context:f,selector:g,tag:y,select:h}=D(c),S=N(p,f,(i=e.checklistTargets)!=null?i:[],g,y,h);S>=0&&a.push(S)}return{single:!1,checklistHits:a}}return{single:!1,checklistHits:[]}}var B=50;function K(){return{phase:"intro",index:0,hintShown:!1,checklistHits:[],events:[],problems:[],completedCount:0}}function z(e){var s;let t=(s=e.data)!=null?s:{},n=t.label||t.selectedText||void 0,r=t.validaiTarget||void 0;return{type:e.type,...n?{label:n}:{},...r?{tag:r}:{},...e.url?{url:e.url}:{}}}function H(e,t,n){let r={...t,phase:"step",index:n,hintShown:!1,checklistHits:[],events:[],problems:[]},s=e.steps[n],i=[];if(k(s)==="appearance"){let a=I(s);a&&i.push({kind:"watch-appearance",...a})}return{state:r,outputs:i}}function T(e,t,n){var i;let r=e.steps[t.index],s=[{kind:"post",event:{type:"step",flowKey:e.key,step:{stepKey:(i=r.importKey)!=null?i:r.id,outcome:n,hintUsed:t.hintShown,events:t.events,problems:t.problems}}}];return k(r)==="appearance"&&s.push({kind:"clear-appearance"}),{state:{...t,phase:"completed",completedCount:t.completedCount+(n==="skipped"?0:1)},outputs:s}}function P(e,t,n){let r={state:t,outputs:[]};if(n.kind==="problem")return t.phase==="step"?{state:{...t,problems:[...t.problems,n.message]},outputs:[]}:r;if(t.phase==="intro"){if(n.kind!=="start")return r;let a=H(e,t,0);return{state:a.state,outputs:[{kind:"post",event:{type:"flow-start",flowKey:e.key}},...a.outputs]}}if(t.phase==="completed")return n.kind!=="continue"?r:t.index+1>=e.steps.length?{state:{...t,phase:"finished"},outputs:[{kind:"post",event:{type:"flow-end",flowKey:e.key}}]}:H(e,t,t.index+1);if(t.phase!=="step")return r;let s=e.steps[t.index],i=k(s);switch(n.kind){case"show-hint":return s.hint?{state:{...t,hintShown:!0},outputs:[]}:r;case"skip":return T(e,t,"skipped");case"done":return i==="self-report"?T(e,t,"self-reported"):r;case"appearance":return i==="appearance"&&O(s,n)?T(e,t,"completed"):r;case"tracker-events":{let a=B-t.events.length,c={...t,events:[...t.events,...n.events.slice(0,Math.max(0,a)).map(z)]},p=j(s,n.events);if(i==="interaction"&&p.single)return T(e,c,"completed");if(i==="checklist"&&p.checklistHits.length>0){let f=[...c.checklistHits,...p.checklistHits],g={...c,checklistHits:f};return M(f,s)?T(e,g,"completed"):{state:g,outputs:[]}}return{state:c,outputs:[]}}default:return r}}var Q=5e3;function d(e,t,n,r){let s=e.createElement(t);return n!==void 0&&(s.textContent=n),r&&s.setAttribute("data-testid",r),s}function J(e,t,n){var R,A;let r=e.getElementById("bar"),s=e.getElementById("app"),i=K(),a=!1,c=!1,p=null,f=l=>{var o;return(o=s.contentWindow)==null?void 0:o.postMessage(l,"*")};function g(l){for(let o of l)o.kind==="post"?n.post(o.event):o.kind==="watch-appearance"?(p={...o.selector?{selector:o.selector}:{},...o.label?{label:o.label}:{}},f({type:"PROTOTEST_WATCH_APPEARANCE",...p})):(p=null,f({type:"PROTOTEST_CLEAR_APPEARANCE"}))}function y(l){let o=P(t,i,l);i=o.state,g(o.outputs),S()}function h(l,o,b){let m=d(e,"button",o);m.type="button",m.addEventListener("click",()=>y(b)),l.appendChild(m)}function S(){var o,b,m;r.replaceChildren(),c&&(r.appendChild(d(e,"p","\\u26A0 Tracking isn\'t loading in this build, so no step can complete by itself. Check for a Content-Security-Policy that blocks inline or local scripts.","dryrun-warning")).className="warn");let l=t.steps[i.index];if(i.phase==="intro")r.appendChild(d(e,"h1",t.title)),t.intro&&r.appendChild(d(e,"p",t.intro)),h(r,"Start",{kind:"start"});else if(i.phase==="step"){let u=d(e,"div",void 0,"dryrun-step");u.appendChild(d(e,"strong",`Step ${i.index+1} of ${t.steps.length}`)),u.appendChild(d(e,"p",l.instruction)),l.hint&&i.hintShown&&u.appendChild(d(e,"p",`Hint: ${l.hint}`,"dryrun-hint")),l.hint&&!i.hintShown&&h(u,"Show hint",{kind:"show-hint"}),h(u,"Skip step",{kind:"skip"}),((o=l.completionType)!=null?o:"interaction")==="self-report"&&h(u,"Done",{kind:"done"}),r.appendChild(u)}else if(i.phase==="completed"){let u=d(e,"div",void 0,"dryrun-completed");u.appendChild(d(e,"p",`\\u2713 ${_(l)}`));for(let E of(m=t.stepQuestions[(b=l.importKey)!=null?b:""])!=null?m:[])u.appendChild(d(e,"p",`Question shown here: ${E}`));h(u,i.index+1>=t.steps.length?"Finish":"Continue",{kind:"continue"}),r.appendChild(u)}else{let u=d(e,"div",void 0,"dryrun-finished");if(u.appendChild(d(e,"h1","Flow finished")),u.appendChild(d(e,"p",`${i.completedCount} of ${t.steps.length} steps completed.`)),t.endQuestions.length>0){u.appendChild(d(e,"p","Questions at the end:"));let E=d(e,"ul");for(let q of t.endQuestions)E.appendChild(d(e,"li",q));u.appendChild(E)}r.appendChild(u)}}return(R=e.defaultView)==null||R.addEventListener("message",l=>{var b,m;if(l.source!==s.contentWindow)return;let o=l.data;!o||typeof o!="object"||(o.type==="PROTOTEST_TRACKER_READY"?(a=!0,p&&f({type:"PROTOTEST_WATCH_APPEARANCE",...p})):o.type==="PROTOTEST_EVENTS"&&Array.isArray(o.events)?y({kind:"tracker-events",events:o.events}):o.type==="PROTOTEST_APPEARANCE"&&y({kind:"appearance",selector:(b=o.selector)!=null?b:void 0,label:(m=o.label)!=null?m:void 0}))}),s.addEventListener("load",()=>{var l;try{let o=s.contentWindow,b=(l=o==null?void 0:o.location.pathname)!=null?l:"";o==null||o.addEventListener("error",m=>y({kind:"problem",message:`Script error on ${b}: ${m.message}`}))}catch{}}),n.setTimeout(()=>{a||(c=!0,n.post({type:"tracker-missing",flowKey:t.key}),S())},(A=n.trackerTimeoutMs)!=null?A:Q),S(),{dispatch:y}}async function G(e){let t=document.getElementById("bar"),n=d(document,"p","The dry run server didn\'t save the last step. Is it still running?","dryrun-post-error");n.className="warn",n.hidden=!0,t.after(n);let r;try{let s=await fetch(`/__dryrun/${encodeURIComponent(e)}/flow.json`);if(!s.ok)throw new Error(String(s.status));r=await s.json()}catch{t.textContent="Couldn\'t load this flow from the dry run server. Is `validai-share serve` still running?";return}J(document,r,{post:s=>{fetch("/__dryrun/events",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(s)}).then(i=>{n.hidden=i.ok}).catch(()=>{n.hidden=!1})},setTimeout:(s,i)=>window.setTimeout(s,i)})}typeof window!="undefined"&&typeof window.__DRYRUN_FLOW_KEY=="string"&&G(window.__DRYRUN_FLOW_KEY);})();\n' };
}

// cli/src/updateCheck.ts
function installKind(scriptPath) {
  const p = scriptPath.replaceAll("\\", "/");
  if (p.includes("/.claude/plugins/")) return "plugin";
  if (p.includes("/skills/validai/scripts/")) return "skill";
  return "agents";
}
function updateSteps(kind, updateUrl) {
  if (kind === "plugin") {
    return `Claude Code updates it automatically if auto-update is on (/plugin \u2192 Marketplaces \u2192 ${MARKETPLACE_NAME}); otherwise run: claude plugin update ${PLUGIN_ID}`;
  }
  if (kind === "skill") {
    return `Re-download the skill from ${updateUrl} \u2014 or switch to the plugin to get updates automatically: /plugin marketplace add ${PLUGIN_REPO}, then /plugin install ${PLUGIN_ID}`;
  }
  return `Re-download AGENTS.md and validai-share.mjs from ${updateUrl}`;
}
async function checkForUpdateInfo(appUrl, current, scriptPath, fetchImpl = fetch, timeoutMs = 2e3) {
  if (current === "dev") return null;
  const attempt = async () => {
    try {
      const res = await fetchImpl(`${appUrl.replace(/\/+$/, "")}/downloads/skill-version.json`, {
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!res.ok) return null;
      const info = parseSkillLatest(await res.json());
      if (!info || compareSkillVersions(current, info.latest) >= 0) return null;
      const what = info.summary ? ` \u2014 ${info.summary}.` : ".";
      return {
        latest: info.latest,
        message: `\u2B06 ValidAI skill ${info.latest} is available (you have ${current})${what} ${updateSteps(installKind(scriptPath), info.updateUrl)}`
      };
    } catch {
      return null;
    }
  };
  let timer;
  const timeout = new Promise((resolve3) => {
    timer = setTimeout(() => resolve3(null), timeoutMs);
  });
  try {
    return await Promise.race([attempt(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// cli/src/index.ts
var SERVE_USAGE = "Usage: validai-share serve --flows validai-flows.json [build-dir] [--flow <key>] [--port <n>] [--allow-root]";
function parseServeArgs(rest) {
  const out = { command: "serve" };
  for (let i2 = 0; i2 < rest.length; i2 += 1) {
    const a = rest[i2];
    if (a === "--flows") out.flows = rest[++i2];
    else if (a === "--flow") out.flow = rest[++i2];
    else if (a === "--port") {
      const n = Number(rest[++i2]);
      if (Number.isInteger(n) && n > 0 && n < 65536) out.port = n;
      else out.error = `--port needs a port number from 1 to 65535
${SERVE_USAGE}`;
    } else if (a === "--allow-root") out.allowRoot = true;
    else if (!a.startsWith("--") && out.dir === void 0) out.dir = a;
    else out.error = `Unknown option ${a}
${SERVE_USAGE}`;
  }
  return out;
}
function parseArgs(argv) {
  if (argv[0] === "analysis") return parseAnalysisArgs(argv.slice(1));
  if (argv[0] === "invite") return parseInviteArgs(argv.slice(1));
  if (argv[0] === "findings") return parseFindingsArgs(argv.slice(1));
  if (argv[0] === "serve") return parseServeArgs(argv.slice(1));
  const command = argv[0] === "login" ? "login" : argv[0] === "pack" ? "pack" : "share";
  const out = { command };
  const rest = command === "share" ? argv : argv.slice(1);
  const isLogin = command === "login";
  for (let i2 = 0; i2 < rest.length; i2 += 1) {
    const a = rest[i2];
    if (a === "--url") {
      out.url = rest[++i2];
    } else if (!isLogin && a === "--name") {
      out.name = rest[++i2];
    } else if (!isLogin && a === "--flows") {
      out.flows = rest[++i2];
      if (out.flows === void 0) {
        delete out.flows;
        out.error = "--flows needs a file path (e.g. --flows validai-flows.json)";
      }
    } else if (command === "share" && a === "--flows-only") {
      out.flowsOnly = true;
    } else if (command === "pack" && a === "--out") {
      out.out = rest[++i2];
    } else if (!isLogin && a === "--allow-root") {
      out.allowRoot = true;
    } else if (!isLogin && a === "--include-source-maps") {
      out.includeSourceMaps = true;
    } else if (!isLogin && !a.startsWith("--") && out.dir === void 0) {
      out.dir = a;
    }
  }
  return out;
}
var ANALYSIS_USAGE = "Usage: validai-share analysis export [--flow <taskFlowId>] [--kind flow|sessions|all] [--out <dir>]\n       validai-share analysis import <answer.json>";
function parseAnalysisArgs(rest) {
  const action = rest[0];
  const out = { command: "analysis" };
  if (action !== "export" && action !== "import") {
    out.error = ANALYSIS_USAGE;
    return out;
  }
  out.analysisAction = action;
  for (let i2 = 1; i2 < rest.length; i2 += 1) {
    const a = rest[i2];
    if (a === "--url") {
      out.url = rest[++i2];
    } else if (action === "export" && a === "--flow") {
      out.flow = rest[++i2];
    } else if (action === "export" && a === "--out") {
      out.out = rest[++i2];
    } else if (action === "export" && a === "--kind") {
      const k = rest[++i2];
      if (k === "flow" || k === "sessions" || k === "all") out.kind = k;
      else out.error = "--kind must be flow, sessions or all";
    } else if (action === "import" && !a.startsWith("--") && out.dir === void 0) {
      out.dir = a;
    } else {
      out.error = `Unknown option ${a}
${ANALYSIS_USAGE}`;
    }
  }
  if (action === "import" && !out.dir && !out.error) out.error = `analysis import needs the answer file
${ANALYSIS_USAGE}`;
  return out;
}
var INVITE_USAGE = "Usage: validai-share invite --flow <key> [--name <label>] [--title <tester title>] [--intro <text>]\n         [--opens <date-time>] [--closes <date-time>] [--allow <emails/@domains, comma-separated>] [--minutes <N>]\n  Dates are your local time, e.g. 2026-11-22T23:59.";
function localTime(v) {
  if (!v) return NaN;
  const ms = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T23:59` : v).getTime();
  return Number.isFinite(ms) ? ms : NaN;
}
function parseInviteArgs(rest) {
  const out = { command: "invite" };
  const req = {};
  for (let i2 = 0; i2 < rest.length; i2 += 1) {
    const a = rest[i2];
    const val = () => rest[++i2];
    if (a === "--url") out.url = val();
    else if (a === "--flow") req.flow = val();
    else if (a === "--name") req.name = val();
    else if (a === "--title") req.testTitle = val();
    else if (a === "--intro") req.intro = val();
    else if (a === "--opens" || a === "--closes") {
      const raw = val();
      const ms = localTime(raw);
      if (Number.isNaN(ms)) {
        out.error = `${a} "${raw ?? ""}" isn't a date-time like 2026-11-22T23:59
${INVITE_USAGE}`;
        break;
      }
      if (a === "--opens") req.opensAt = ms;
      else req.closesAt = ms;
    } else if (a === "--allow") req.allowedEmails = (val() ?? "").split(",").map((e) => e.trim()).filter(Boolean);
    else if (a === "--minutes") {
      const m = Number(val());
      if (!Number.isFinite(m) || m < 1) {
        out.error = `--minutes must be a number of minutes
${INVITE_USAGE}`;
        break;
      }
      req.maxDurationMinutes = m;
    } else {
      out.error = `Unknown option ${a}
${INVITE_USAGE}`;
      break;
    }
  }
  if (!out.error && !req.flow) out.error = `invite needs --flow <key>
${INVITE_USAGE}`;
  if (!out.error) out.invite = req;
  return out;
}
var FINDINGS_USAGE = "Usage: validai-share findings [--json]";
function parseFindingsArgs(rest) {
  const out = { command: "findings" };
  for (let i2 = 0; i2 < rest.length; i2 += 1) {
    const a = rest[i2];
    if (a === "--url") out.url = rest[++i2];
    else if (a === "--json") out.json = true;
    else {
      out.error = `Unknown option ${a}
${FINDINGS_USAGE}`;
      break;
    }
  }
  return out;
}
function formatFindings(r) {
  if (r.findings.length === 0) return [`No open findings on "${r.prototype}" (iteration ${r.iteration}).`];
  const lines = [`Open findings on "${r.prototype}" (iteration ${r.iteration}): ${r.findings.length}`];
  for (const f of r.findings) {
    lines.push("", `[${f.severity}${f.status === "validated" ? "" : `, ${f.status}`}] ${f.title}${f.taskFlow ? ` (${f.taskFlow})` : ""}`);
    lines.push(`  Finding id: ${f.id}`);
    const d = f.description.replace(/\s+/g, " ").trim();
    if (d) lines.push(`  ${d.length > 240 ? `${d.slice(0, 239)}\u2026` : d}`);
  }
  lines.push("", "List the ids of the findings your changes address in the flows file's iteration.addressedFindings.");
  return lines;
}
async function runServe(args, cwd) {
  const assets = embeddedAssets();
  if (!assets) {
    console.error("\u2717 serve needs the bundled helper (validai-share.mjs from the ValidAI skill). Run it from the skill's scripts folder.");
    return 1;
  }
  let loaded;
  let files;
  try {
    loaded = loadManifest(cwd, args.flows);
    files = collectFor(args, cwd);
  } catch (err2) {
    console.error(`\u2717 ${err2.message}`);
    return 1;
  }
  const issues = localTagIssues(loaded.manifest, files);
  if (issues.length > 0) {
    printTagIssues(issues, console);
    return 1;
  }
  if (args.flow && !loaded.manifest.taskFlows.some((f) => f.key === args.flow)) {
    console.error(`\u2717 No task flow with key "${args.flow}" in the flows file.`);
    return 1;
  }
  const recordPath = join5(dirname(resolve2(cwd, args.flows ?? DEFAULT_FLOWS_FILE)), RECORD_FILE);
  let handle;
  try {
    handle = await startServe({ files, manifest: loaded.manifest, recordPath, assets, port: args.port, log: (l) => console.log(l) });
  } catch (err2) {
    console.error(`\u2717 ${err2.message}`);
    return 1;
  }
  console.log(`Dry run server on ${handle.origin} (Ctrl-C to stop). Each step is printed here and saved to ${RECORD_FILE}.`);
  for (const u of handle.urls) if (!args.flow || u.flowKey === args.flow) console.log(`  ${u.name}: ${u.url}`);
  const stop = () => {
    void handle.close();
  };
  process.once("SIGINT", stop);
  await handle.closed;
  process.off("SIGINT", stop);
  return 0;
}
async function runFindings(args, cwd, appUrl, token) {
  const ref = readProjectRef(cwd);
  if (!ref) {
    console.error("\u2717 No prototype in this folder (.validai.json). Run this where you ran validai-share.");
    return 1;
  }
  try {
    const r = await listFindings(appUrl, token, ref.prototypeId);
    if (args.json) console.log(JSON.stringify(r, null, 2));
    else for (const line of formatFindings(r)) console.log(line);
    return 0;
  } catch (err2) {
    console.error(`\u2717 ${err2.message}`);
    return 1;
  }
}
async function runInvite(args, cwd, appUrl, token) {
  const ref = readProjectRef(cwd);
  if (!ref) {
    console.error("\u2717 No prototype in this folder (.validai.json). Run this where you ran validai-share.");
    return 1;
  }
  try {
    const r = await createInvite(appUrl, token, ref.prototypeId, args.invite);
    const when = (ms) => ms ? new Date(ms).toLocaleString(void 0, { dateStyle: "medium", timeStyle: "short" }) : "";
    console.log(`\u2713 Created invite "${r.name}" (iteration ${r.iteration})`);
    if (r.opensAt) console.log(`  Opens ${when(r.opensAt)}`);
    if (r.closesAt) console.log(`  Closes ${when(r.closesAt)}`);
    console.log(`\u2192 ${appUrl}${r.joinPath}`);
    return 0;
  } catch (err2) {
    console.error(`\u2717 ${err2.message}`);
    return 1;
  }
}
async function runAnalysis(args, cwd, appUrl, token) {
  try {
    if (args.analysisAction === "import") {
      const r = await importAnalysis(appUrl, token, readFileSync6(resolve2(cwd, args.dir), "utf-8"));
      if (r.kind === "flow") {
        console.log(`\u2713 Imported ${r.patterns} pattern${r.patterns === 1 ? "" : "s"} across sessions`);
      } else {
        console.log(`\u2713 Imported ${r.saved} session analys${r.saved === 1 ? "is" : "es"}`);
        for (const p of r.problems) console.log(`\u26A0 ${p}`);
      }
      console.log(`\u2192 ${appUrl}/prototypes/${r.prototypeId}/insights`);
      return 0;
    }
    const ref = readProjectRef(cwd);
    if (!ref) {
      console.error("\u2717 No prototype in this folder (.validai.json). Run this where you ran validai-share, or share the prototype first.");
      return 1;
    }
    const { files, skipped } = await exportAnalysis(appUrl, token, { prototypeId: ref.prototypeId, taskFlowId: args.flow, kind: args.kind ?? "all" });
    const dir = resolve2(cwd, args.out ?? "validai-analysis");
    if (files.length) mkdirSync2(dir, { recursive: true });
    for (const f of files) {
      writeFileSync4(join5(dir, basename(f.filename)), f.markdown);
      console.log(`\u2713 Wrote ${join5(args.out ?? "validai-analysis", basename(f.filename))} (${f.kind === "flow" ? "patterns across sessions" : "one analysis per session"})`);
    }
    for (const s of skipped) console.log(`\xB7 ${s}`);
    if (!files.length) return 0;
    console.log("Next: follow each file's instructions, save the JSON answer, then run `validai-share analysis import <answer.json>`.");
    return 0;
  } catch (err2) {
    console.error(`\u2717 ${err2.message}`);
    return 1;
  }
}
function collectFor(args, cwd) {
  const skipped = [];
  const files = collectBundle(resolveBundleDir(args.dir, cwd, { allowRoot: args.allowRoot }), {
    allowSourceMaps: args.includeSourceMaps,
    skipped
  });
  const note = describeSkipped(skipped);
  if (note) console.log(note);
  const rootNote = describeRootAbsolute(files);
  if (rootNote) console.log(`\u26A0 ${rootNote}`);
  return files;
}
function defaultName(cwd) {
  try {
    const pkg = JSON.parse(readFileSync6(join5(cwd, "package.json"), "utf-8"));
    if (pkg.name) return pkg.name;
  } catch {
  }
  return basename(cwd);
}
async function run(argv, localUpdate) {
  const args = parseArgs(argv);
  if (args.error) {
    console.error(`\u2717 ${args.error}`);
    return 1;
  }
  const home = homedir();
  const cwd = process.cwd();
  if (args.command === "login") {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    let url = args.url;
    if (!url) {
      const defaultUrl = readFileConfig(home).appUrl ?? DEFAULT_APP_URL;
      const answer = (await rl.question(`ValidAI URL [${defaultUrl}]: `)).trim();
      url = answer || defaultUrl;
    }
    const token2 = (await rl.question("Paste your ValidAI CLI token: ")).trim();
    rl.close();
    if (!token2) {
      console.error("No token entered.");
      return 1;
    }
    saveConfig(token2, url, home);
    console.log("Saved to ~/.validai/config.json");
    return 0;
  }
  if (args.command === "serve") return runServe(args, cwd);
  if (args.command === "findings") {
    const { token: token2, appUrl: appUrl2 } = loadConfig(args, process.env, home);
    if (!token2) {
      console.error("No CLI token. Generate one in ValidAI \u2192 Settings \u2192 CLI token, then run `validai-share login` (or set VALIDAI_TOKEN).");
      return 1;
    }
    return runFindings(args, cwd, appUrl2, token2);
  }
  if (args.command === "invite") {
    const { token: token2, appUrl: appUrl2 } = loadConfig(args, process.env, home);
    if (!token2) {
      console.error("No CLI token. Generate one in ValidAI \u2192 Settings \u2192 CLI token, then run `validai-share login` (or set VALIDAI_TOKEN).");
      return 1;
    }
    return runInvite(args, cwd, appUrl2, token2);
  }
  if (args.command === "analysis") {
    const { token: token2, appUrl: appUrl2 } = loadConfig(args, process.env, home);
    if (!token2) {
      console.error("No CLI token. Generate one in ValidAI \u2192 Settings \u2192 CLI token, then run `validai-share login` (or set VALIDAI_TOKEN).");
      return 1;
    }
    return runAnalysis(args, cwd, appUrl2, token2);
  }
  let flows = null;
  if (args.flows || args.flowsOnly || args.command === "pack") {
    try {
      flows = loadManifest(cwd, args.flows);
    } catch (err2) {
      console.error(`\u2717 ${err2.message}`);
      return 1;
    }
  }
  if (args.command === "pack") {
    let files2;
    try {
      files2 = collectFor(args, cwd);
    } catch (err2) {
      console.error(`\u2717 ${err2.message}`);
      return 1;
    }
    const manifest = flows;
    const issues = localTagIssues(manifest.manifest, files2);
    if (issues.length > 0) {
      printTagIssues(issues, console, false);
      return 1;
    }
    const outFile = args.out ?? packageFileName(manifest.manifest, defaultName(cwd));
    writeFileSync4(resolve2(cwd, outFile), buildPackage(manifest.text, files2, HELPER_VERSION));
    console.log(
      manifest.manifest.iteration ? `\u2713 Wrote ${outFile} \u2014 upload it in ValidAI \u2192 your prototype \u2192 New Iteration \u2192 drop the .validai file` : `\u2713 Wrote ${outFile} \u2014 upload it in ValidAI \u2192 New Prototype \u2192 drop the .validai file`
    );
    return 0;
  }
  const { token, appUrl } = loadConfig(args, process.env, home);
  if (!token) {
    console.error("No CLI token. Generate one in ValidAI \u2192 Settings \u2192 CLI token, then run `validai-share login` (or set VALIDAI_TOKEN).");
    return 1;
  }
  let files = null;
  if (!args.flowsOnly) {
    try {
      files = collectFor(args, cwd);
    } catch (err2) {
      console.error(`\u2717 ${err2.message}`);
      return 1;
    }
  }
  if (flows && files) {
    const issues = localTagIssues(flows.manifest, files);
    if (issues.length > 0) {
      printTagIssues(issues, console);
      return 1;
    }
  }
  try {
    let ref = readProjectRef(cwd);
    if (!ref) {
      if (args.flowsOnly) {
        console.error("\u2717 No prototype in this folder yet \u2014 run `validai-share --flows validai-flows.json` first.");
        return 1;
      }
      const name = args.name || defaultName(cwd);
      const prototypeId2 = await createPrototype(appUrl, token, name);
      ref = { prototypeId: prototypeId2, name };
      writeProjectRef(cwd, ref);
      console.log(`Created prototype "${name}" (${prototypeId2})`);
    }
    const prototypeId = ref.prototypeId;
    const code = await runShare(
      files,
      flows,
      {
        ingest: (f, iteration) => ingest(appUrl, token, prototypeId, f, iteration),
        importFlows: (text) => importFlows(appUrl, token, prototypeId, text)
      },
      console,
      localUpdate
    );
    if (code === 0) console.log(`\u2192 ${appUrl}/prototypes/${prototypeId}${flows ? "/task-flows" : ""}`);
    return code;
  } catch (err2) {
    console.error(`\u2717 ${err2.message}`);
    return 1;
  }
}
async function main(argv) {
  const { appUrl } = loadConfig(parseArgs(argv), process.env, homedir());
  const update = checkForUpdateInfo(appUrl, HELPER_VERSION, fileURLToPath(import.meta.url));
  const code = await run(argv, update);
  const notice = await update;
  if (notice) console.log(notice.message);
  return code;
}
var invokedAsScript = !!process.argv[1] && (() => {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();
if (invokedAsScript) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
export {
  formatFindings,
  main,
  parseArgs
};
