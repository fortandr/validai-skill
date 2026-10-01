---
name: validai
description: Prepare a prototype for user validation in ValidAI — read the prototype, recommend Task Flows from the PM's goals and validation evidence (in-person notes, transcripts, PRD), tag click targets with data-validai-target, then push to ValidAI or package a .validai file. Use when the user mentions ValidAI, wants to test or validate a prototype with users, or wants task flows created.
metadata:
  version: "2026.10.1"
---

# ValidAI: prepare a prototype for validation

Use this when a PM wants to test a prototype in ValidAI: upload it, turn their goals and validation evidence into recommended **Task Flows**, and make testers' clicks register reliably.

ValidAI app: https://validai.lukantan.com · Skill version: 2026.10.1

## Ground rules

- **The PM decides.** Draft, then ask. Never push or pack anything until the PM has confirmed every flow.
- Recommend flows from **evidence** (in-person notes, transcripts, PRD, support tickets) plus the PM's goals, and quote the evidence in each flow's `rationale`. If there's no evidence, say so and set `source.kind` to `prototype-analysis`.
- Only tag elements that exist in the source. Reuse existing `data-validai-target` values. **Never rename an existing tag silently**, because tested flows may depend on it.
- Keep `validai-flows.json` in the prototype repo root, next to `.validai.json` if it exists. On re-runs, edit it and keep the flow and step `key`s stable.

## 1. Read the prototype

- Detect the stack (static HTML, Vite/React or another bundler, other). Find the build command and the build output folder (`dist/`, `build/` or `out/`, which must contain `index.html`).
- Map the screens/routes and the interactive elements a tester would use.
- If `validai-flows.json` exists, read it first. You're updating, not starting over.

## 2. Gather the PM's input

Ask in one message:
1. What do you want to learn? (goals / hypotheses)
2. What validation evidence do you have — in-person notes, transcripts, PRD, analytics? Paste it or point me to files.
3. Who are the testers, and about how long should a session take?

## 3. Draft flows — one at a time

For each recommended flow, show the PM:
- a name, a one-line description (the goal), and a `rationale` that quotes the evidence
- the steps. For each: the instruction (what the tester is asked to do, in the tester's words, with no UI hints that give the answer away), a completion type, a target, and a `completionMessage`: one neutral sentence, in the tester's terms, saying what they just found or did (e.g. "You found the inventory summary showing the auction is light."). It's shown right before the ease rating, so no praise ("Great job!") and no hints about later steps; ≤ 200 characters
- an optional question after one step (`intercept`) and 1–2 session-end questions (`endIntercepts`)

| Completion type | Use when | Needs |
|---|---|---|
| `interaction` | the step ends with a click or selection on one element | `target` |
| `appearance` | the step ends when something shows up (confirmation, result) | `target`: the element that appears |
| `checklist` | any N of several elements count | `targets` (+ optional `threshold`) |
| `self-report` | nothing clickable proves it (reading, judging) | nothing |

Keep flows to 3–7 steps, and ask sparingly. Wait for the PM's "yes" (or edits) before drafting the next flow.

## 4. Tag the targets

- Add `data-validai-target="<tag>"` to each target: the control itself (button, link, input, select), not a layout wrapper. Tags are lowercase kebab-case, ≤ 64 characters (e.g. `ticket-ga`, `pay-now`).
- When a step expects a specific choice in a `<select>`, tag the `<option>` (e.g. `<option data-validai-target="ticket-vip">`), not only the select. A tag on the select alone matches a choice only when the target's `label` equals the chosen option's text; if any choice counts, tag the select and leave `label` out.
- JSX: `<button data-validai-target="pay-now">`. If a custom component doesn't pass unknown props through to the DOM, put the attribute on the DOM element inside it.
- Show the PM the diff before applying it. Then run the build.

## 5. Verify and hand off

Write `validai-flows.json` (format and rules: `reference/manifest.md`). Set `prototype.builtWith` to the assistant you are running in (e.g. "Claude Code", "Claude.ai", "Cursor", "Codex") — ValidAI shows it as the prototype's "Built with" label. Also set `"generator": { "name": "validai-skill", "version": "2026.10.1" }` exactly as written here, so ValidAI can tell the PM when this skill is out of date.

Then choose the hand-off:

**A. Push**, when you have a shell and network access and the PM has a CLI token (ValidAI → Settings → CLI token). They run `node ${CLAUDE_SKILL_DIR}/scripts/validai-share.mjs login` once, or set `VALIDAI_TOKEN`. Then:

```
node ${CLAUDE_SKILL_DIR}/scripts/validai-share.mjs --flows validai-flows.json [build-dir]
```

This validates the file, checks that every tag exists in the build, uploads a new version, and imports the flows. If the upload succeeded but the import failed, fix the file and run `node ${CLAUDE_SKILL_DIR}/scripts/validai-share.mjs --flows-only`.

**B. Package**, when there's no token or no network:

```
node ${CLAUDE_SKILL_DIR}/scripts/validai-share.mjs pack --flows validai-flows.json [build-dir]
```

Give the PM the `.validai` file. They upload it in ValidAI → New Prototype → **drop the .validai file**.

**C. No shell** (e.g. Claude.ai): assemble the package as described in `reference/package.md` and give it to the PM to upload. ValidAI validates it again on upload.

When re-importing: a flow whose `key` already exists is replaced in place if nobody has tested it; otherwise ValidAI keeps it and adds "<name> (v2)".

Finish by telling the PM what was created, with the link https://validai.lukantan.com/prototypes.
