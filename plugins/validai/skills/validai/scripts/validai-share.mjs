#!/usr/bin/env node

// cli/src/index.ts
import { homedir } from "node:os";
import { createInterface } from "node:readline/promises";
import { basename, join as join5, resolve as resolve2 } from "node:path";
import { readFileSync as readFileSync5, realpathSync, writeFileSync as writeFileSync3 } from "node:fs";
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
var HELPER_FILES = /* @__PURE__ */ new Set(["validai-flows.json", "validai-share.mjs", "AGENTS.md"]);
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
var HELPER_VERSION = true ? "2026.10.2-2" : "dev";
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
async function ingest(baseUrl, token, prototypeId, files) {
  const res = await fetch(`${baseUrl}/__api/prototypes/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...CLIENT_HEADER },
    body: JSON.stringify({ prototypeId, files })
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

// cli/src/flows.ts
import { existsSync as existsSync3, readFileSync as readFileSync4 } from "node:fs";
import { resolve } from "node:path";

// src/shared/flowManifest/types.ts
var SCHEMA_VERSION = 1;

// src/shared/flowManifest/validate.ts
var KEY_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
var RESERVED_SUFFIX_RE = /--v\d+$/;
var LIMITS = {
  flows: 50,
  steps: 100,
  name: 120,
  instruction: 500,
  completionMessage: 200,
  question: 500,
  rationale: 1e3,
  notes: 500,
  builtWith: 60,
  generatorName: 40,
  generatorVersion: 40
};
var COMPLETION_TYPES = ["interaction", "appearance", "checklist", "self-report"];
var RESPONSE_TYPES = ["scale", "choice", "reaction", "text"];
var SOURCE_KINDS = ["in-person-validation", "transcript", "prd", "prototype-analysis", "other"];
var TOP_KEYS = ["schemaVersion", "prototype", "generator", "source", "taskFlows"];
var FLOW_KEYS = ["key", "name", "description", "rationale", "steps", "endIntercepts"];
var STEP_KEYS = ["key", "instruction", "completionMessage", "completionType", "target", "targets", "threshold", "intercept"];
var TARGET_KEYS = ["tag", "label", "context"];
var INTERCEPT_KEYS = ["trigger", "question", "responseType", "choices", "escalateOnLowScore", "followUpQuestion"];
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
  function intercept(ic, path, triggers) {
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
      else f.endIntercepts.forEach((ic, i2) => intercept(ic, `${ep}[${i2}]`, ["session-end"]));
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
  let version = null;
  if (files) {
    const result = await api.ingest(files);
    version = result.version;
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
    if (version !== null) {
      out.error(`  The upload (v${version}) succeeded. Fix the flows file, then re-run: validai-share --flows-only`);
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
function parseArgs(argv) {
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
    const pkg = JSON.parse(readFileSync5(join5(cwd, "package.json"), "utf-8"));
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
    writeFileSync3(resolve2(cwd, outFile), buildPackage(manifest.text, files2, HELPER_VERSION));
    console.log(`\u2713 Wrote ${outFile} \u2014 upload it in ValidAI \u2192 New Prototype \u2192 drop the .validai file`);
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
        ingest: (f) => ingest(appUrl, token, prototypeId, f),
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
  main,
  parseArgs
};
