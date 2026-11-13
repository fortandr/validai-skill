---
name: validai
description: Prepare a prototype for user validation in ValidAI — read the prototype, recommend Task Flows from the PM's goals and validation evidence (in-person notes, transcripts, PRD), tag click targets with data-validai-target, then push to ValidAI or package a .validai file; also analyze ValidAI test results with your own AI (export the request, answer it, import the result). Use when the user mentions ValidAI, wants to test or validate a prototype with users, wants task flows created, or wants usability test results analyzed.
metadata:
  version: "2026.11.13-2"
---

# ValidAI: prepare a prototype for validation

Use this when a PM wants to test a prototype in ValidAI: upload it, turn their goals and validation evidence into recommended **Task Flows**, and make testers' clicks register reliably.

ValidAI app: https://validai.lukantan.com · Skill version: 2026.11.13-2

## Ground rules

- **The PM decides.** Draft, then ask. Never push or pack anything until the PM has confirmed every flow (or, for a new iteration, every change).
- Recommend flows from **evidence** (in-person notes, transcripts, PRD, support tickets) plus the PM's goals, and quote the evidence in each flow's `rationale`. If there's no evidence, say so and set `source.kind` to `prototype-analysis`.
- Only tag elements that exist in the source. Reuse existing `data-validai-target` values. **Never rename an existing tag silently**, because tested flows may depend on it.
- Keep `validai-flows.json` in the prototype repo root, next to `.validai.json` if it exists. On re-runs, edit it and keep the flow and step `key`s stable.

## 1. Read the prototype

- Detect the stack (static HTML, Vite/React or another bundler, other). Find the build command and the build output folder (`dist/`, `build/` or `out/`, which must contain `index.html`).
- Testers can download every file in the build folder, so **never use the project root (`.`) as the build folder**. For a static-HTML prototype with no build step, copy only the files the page loads (HTML, CSS, JS, images) into a `dist/` folder and use that. Keep evidence notes, transcripts, `.env` and other project files out of it.
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
- what testers see before they start: a `testTitle`, a short, friendly name for the test in plain words (e.g. "Buying event tickets", never a repo or file name like `checkoutFlow_v3`; ≤ 120 characters), and a `testIntro`, 2–4 short sentences that thank the tester, say what the app is for, and describe the task without hinting at how to do it, ending with an invitation to think aloud (≤ 2000 characters). ValidAI uses them as the title and intro on the invite link, and the PM can edit both there
- the steps. For each: the instruction (what the tester is asked to do, in the tester's words, with no UI hints that give the answer away), a completion type, a target, and a `completionMessage`: one neutral sentence, in the tester's terms, saying what they just found or did (e.g. "You found the inventory summary showing the auction is light."). It's shown right before the ease rating, so no praise ("Great job!") and no hints about later steps; ≤ 200 characters
- a `hint` for any step whose target isn't on the screen the tester is on when the step begins (they have to navigate to find it): one sentence pointing to the area, not the exact control (e.g. "Organization-wide options live under Settings in the left menu."); ≤ 300 characters. Testers see it only if they ask, and ValidAI records who did
- an optional question after one step (`intercept`) and 1–2 session-end questions (`endIntercepts`)

| Completion type | Use when | Needs |
|---|---|---|
| `interaction` | the step ends with a click or selection on one element | `target` |
| `appearance` | the step ends when something shows up (confirmation, result) | `target`: the element that appears |
| `checklist` | any N of several elements count | `targets` (+ optional `threshold`) |
| `self-report` | nothing clickable proves it (reading, judging) | nothing |

Word each instruction for what that step tests. Most steps are plain tasks ("Change the fiscal year to start in January."). Only when the step is about *finding* something the tester can't see yet, a question about where to go can fit ("Where would you go to change your fiscal year? Go there now."). Don't use that form by default. Either way, if the target isn't on screen when the step begins, give the step a `hint`, because a tester who can't find it skips the step and often can't do the steps after it.

Keep flows to 3–7 steps, and ask sparingly. Wait for the PM's "yes" (or edits) before drafting the next flow.

## 4. Tag the targets

- Add `data-validai-target="<tag>"` to each target: the control itself (button, link, input, select), not a layout wrapper. Tags are lowercase kebab-case, ≤ 64 characters (e.g. `ticket-ga`, `pay-now`).
- When a step expects a specific choice in a `<select>`, tag the `<option>` (e.g. `<option data-validai-target="ticket-vip">`), not only the select. A tag on the select alone matches a choice only when the target's `label` equals the chosen option's text; if any choice counts, tag the select and leave `label` out.
- JSX: `<button data-validai-target="pay-now">`. If a custom component doesn't pass unknown props through to the DOM, put the attribute on the DOM element inside it.
- Show the PM the diff before applying it. Then run the build.

## 5. Verify and hand off

Write `validai-flows.json` (format and rules: `reference/manifest.md`). Set `prototype.builtWith` to the assistant you are running in (e.g. "Claude Code", "Claude.ai", "Cursor", "Codex") — ValidAI shows it as the prototype's "Built with" label. Also set `"generator": { "name": "validai-skill", "version": "2026.11.13-2" }` exactly as written here, so ValidAI can tell the PM when this skill is out of date.

Then choose the hand-off:

**A. Push**, when you have a shell and network access and the PM has a CLI token (ValidAI → Settings → CLI token). They run `node ${CLAUDE_SKILL_DIR}/scripts/validai-share.mjs login` once, or set `VALIDAI_TOKEN`. Then:

```
node ${CLAUDE_SKILL_DIR}/scripts/validai-share.mjs --flows validai-flows.json [build-dir]
```

`[build-dir]` is the build output folder from step 1 (e.g. `dist`), never `.`. The helper always leaves out hidden files (`.env`, `.git/`), `node_modules/`, `.validai` packages, keys and source maps, and refuses a folder that looks like the project root. Don't pass `--allow-root` unless the PM confirms that folder holds only what testers should load.

This validates the file, checks that every tag exists in the build, uploads a new version, and imports the flows. If the upload succeeded but the import failed, fix the file and run `node ${CLAUDE_SKILL_DIR}/scripts/validai-share.mjs --flows-only`.

**B. Package**, when there's no token or no network:

```
node ${CLAUDE_SKILL_DIR}/scripts/validai-share.mjs pack --flows validai-flows.json [build-dir]
```

Give the PM the `.validai` file. They upload it in ValidAI → New Prototype → **drop the .validai file**.

**C. No shell** (e.g. Claude.ai): assemble the package as described in `reference/package.md` and give it to the PM to upload. ValidAI validates it again on upload.

When re-importing: a flow whose `key` already exists on the prototype's current iteration is replaced in place if nobody has tested it; otherwise ValidAI keeps it and adds "<name> (v2)". Flows on earlier iterations are never changed.

Finish by telling the PM what was created, with the link https://validai.lukantan.com/prototypes.

## Ship a new iteration

Use this when the PM wants the prototype changed to fix what testing found. They usually give you a findings brief from ValidAI (Insights → **Export validated for AI**, or **Iterate** on one finding). Each finding in it has a `Finding id`.

1. Read the brief and the prototype. For each finding, restate the problem in a sentence and propose the smallest change that fixes it. Wait for the PM's "yes" (or edits) before changing anything. If the evidence is too thin, or a fix needs a redesign, say so.
2. Make the changes. **Keep every existing `data-validai-target` on the same control**, because the tested task flows depend on it: if a control moves or is replaced, move its tag with it. Then run the build.
3. Add an `iteration` block to `validai-flows.json`:

   ```json
   "iteration": {
     "changes": "Moved the fiscal year setting to Settings → Global and labeled it \"Fiscal year start\". Added a link to it from the deposits report.",
     "addressedFindings": ["ai_HpKXkF07TbffwVMyP3LG_f1a2b3c4", "fp_OB6u0z7F_f9e8d7c6"]
   }
   ```

   - `changes`: what a tester will notice, in plain words, one sentence per change (≤ 2000 characters). The PM reads it on Iteration comparison next to the before-and-after numbers.
   - `addressedFindings`: the `Finding id` of each finding your changes address, copied exactly from the brief. Leave out findings you didn't address. Without a brief, leave the list out; the PM can tick findings in ValidAI.
   - Keep `taskFlows` up to date for the new build: in ValidAI, task flows and invites are locked to the iteration they were made for, so the flows in this file are set up fresh on the new iteration. Keep each flow's `key` and step `key`s the same, so results still line up with the earlier iteration. Update a flow only where your changes affect its steps, and show the PM those step changes before handing off.
4. Hand off the same way as step 5 (A, B or C). With an `iteration` block:
   - **Push** starts the next iteration with the new build, then sets up the flows on it. It prints the new iteration number. Earlier iterations keep their flows, sessions and invites.
   - **Package**: the PM opens the prototype in ValidAI → **New Iteration** and drops the `.validai` file. It fills in what changed, ticks the findings, and sets up the flows.
   - Remind the PM that invites stay on their iteration: to test the new version remotely, they create new invites with the new flows.
5. After a successful hand-off, **delete the `iteration` block** from `validai-flows.json`. It describes one iteration only, and a later push with it still in place would start another iteration with the same text.

Finish by telling the PM the iteration number and what it addresses, with the link https://validai.lukantan.com/prototypes.

## Analyze test results with your own AI

When the PM wants test results analyzed by you instead of ValidAI's AI key (or has no key), ValidAI hands over its own instructions and the data, and takes your answer back. Testers are numbered, never named: keep it that way in everything you write.

1. Get the request files. With a CLI token, in the folder holding `.validai.json`:

   ```
   node ${CLAUDE_SKILL_DIR}/scripts/validai-share.mjs analysis export [--flow <taskFlowId>] [--kind flow|sessions|all]
   ```

   This writes Markdown files to `validai-analysis/`: `validai-patterns-…md` (patterns across a task flow's sessions) and `validai-sessions-…md` (one analysis per session not yet analyzed). Without a shell, the PM downloads them in ValidAI → Insights → AI analysis → **Use your own AI**.
2. For each file, follow its Instructions on its Data exactly. Write the answer as a JSON file shaped as the file's "What to do" section says: the `validaiRequest` object copied unchanged, plus `result` (patterns) or `results` (one `{ "tester", "result" }` per session). Base every finding on the data: count testers out of the total, and don't invent quotes or numbers.
3. Send each answer back:

   ```
   node ${CLAUDE_SKILL_DIR}/scripts/validai-share.mjs analysis import validai-analysis/<name>.result.json
   ```

   ValidAI checks it like its own AI's output and files it: patterns under "Patterns across sessions", session findings in the review inbox. Without a shell, the PM imports the file in the same **Use your own AI** window. If the import reports a problem, fix that part of the JSON and import again.

Finish by telling the PM what was imported, with the link https://validai.lukantan.com/prototypes.
