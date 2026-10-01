# `validai-flows.json` reference (schemaVersion 1)

```jsonc
{
  "schemaVersion": 1,
  "prototype": { "name": "Checkout v3", "builtWith": "Claude Code" }, // optional; see below
  "source": { "kind": "in-person-validation", "notes": "Round 2, 2026-09-28" },
  "taskFlows": [{
    "key": "checkout-happy-path",                   // stable id — keep it the same across re-runs
    "name": "Checkout happy path",
    "description": "Buy a ticket as a returning donor",
    "rationale": "3 of 5 in-person participants stalled at fee cover",
    "steps": [{
      "key": "choose-ticket",
      "instruction": "Pick a General Admission ticket",
      "completionMessage": "You picked a General Admission ticket.", // optional; shown when the step completes
      "completionType": "interaction",              // interaction | appearance | checklist | self-report
      "target": { "tag": "ticket-ga", "label": "General Admission", "context": "Tickets" },
      "intercept": { "trigger": "step-complete", "question": "How easy was that?", "responseType": "scale", "escalateOnLowScore": true }
    }],
    "endIntercepts": [{ "trigger": "session-end", "question": "Anything confusing?", "responseType": "text" }]
  }]
}
```

- `prototype.name` is informational: it names the `.validai` file and prefills the prototype name on upload.
- `prototype.builtWith` is the AI assistant you're running in (e.g. "Claude Code", "Claude.ai", "Cursor", "Codex"), ≤ 60 characters. ValidAI shows it as the prototype's "Built with" label.
- `generator` says what wrote the file: `{ "name": "validai-skill", "version": "<this skill's version>" }` (the version is printed in the skill's instructions). The helper's `pack` adds `{ "name": "validai-share", … }` when it's missing. ValidAI uses it to tell the PM when the skill is out of date. Both fields are optional strings ≤ 40 characters; other names are allowed.
- `source.kind`: `in-person-validation`, `transcript`, `prd`, `prototype-analysis`, or `other`. `source.notes` ≤ 500 characters.
- `completionType` defaults to `interaction` when omitted.
- `completionMessage` (optional, ≤ 200 characters) is shown to the tester the moment the step completes, right before the ease rating. Write one neutral sentence, in the tester's terms, saying what they just found or did. No praise ("Great job!"), because praise right before a rating inflates it, and no hints about later steps. If you leave it out, the tester sees "Step complete — <first sentence of the instruction>" ("Marked done" on self-report steps).
- `target.tag` is the element's `data-validai-target` value. `label` is its visible text, and `context` is text around it (for example, the section heading). Give a tag whenever you can: it's matched first, and it survives copy changes.
- Checklist steps use `"targets": [{…}, …]` and `"threshold": N` (default: all targets).
- `intercept` / `endIntercepts[]`: `responseType` is `scale` (1–5), `choice` (needs `choices`), `reaction`, or `text`. `escalateOnLowScore` applies to `scale` only and asks `followUpQuestion` after a low score.

## Validation rules

Every error names a JSON path, e.g. `taskFlows[1].steps[3].target.tag "Pay-Now": must be lowercase kebab-case (e.g. "pay-now")`. Warnings never block.

| Code | Rule |
|---|---|
| `not-object` | The file must be a JSON object. |
| `schema-version` | `schemaVersion` must be `1`. |
| `unknown-key` | *Warning only.* An unrecognized field is ignored. |
| `required` | Required fields are missing or blank: `taskFlows[].key`, `name`, `steps[].key`, `instruction`, intercept `question`. |
| `type` | A field has the wrong JSON type. |
| `key-format` | Flow keys, step keys and tags must match `^[a-z0-9][a-z0-9-]{0,63}$` (lowercase kebab-case, ≤ 64). |
| `reserved-suffix` | Flow keys must not end in `--v<number>` (ValidAI uses it for versions). |
| `duplicate-key` | Flow keys are unique in the file; step keys are unique within their flow. |
| `empty-list` | At least 1 task flow, and at least 1 step per flow. |
| `too-many` | At most 50 task flows, and at most 100 steps per flow. |
| `too-long` | `name` ≤ 120, `instruction` ≤ 500, `completionMessage` ≤ 200, intercept `question`/`followUpQuestion` ≤ 500, `rationale` ≤ 1000, `source.notes` ≤ 500, `prototype.builtWith` ≤ 60, `generator.name`/`generator.version` ≤ 40 characters. |
| `completion-type` | `completionType` must be `interaction`, `appearance`, `checklist` or `self-report`. |
| `target-required` | `interaction`/`appearance` need `target`; `checklist` needs ≥ 1 `targets`; every target needs a `tag` or a `label`. |
| `target-forbidden` | `interaction`/`appearance` can't have `targets`/`threshold`; `checklist` can't have `target`; `self-report` can't have any of them. |
| `threshold-range` | `threshold` is a whole number from 1 to the number of `targets`. |
| `trigger-invalid` | A step `intercept.trigger` is `step-complete` or `struggle`; `endIntercepts[].trigger` is `session-end`. |
| `response-type` | `responseType` must be `scale`, `choice`, `reaction` or `text`. |
| `choices-required` | A `choice` question needs at least 2 non-blank `choices`. |
| `source-kind` | `source.kind` must be one of the kinds listed above. |
| `missing-tag` | Every `tag` must appear as `data-validai-target="…"` in the build. It's an error for uploaded builds, and a warning for URL prototypes. |

## Re-importing

The flow `key` is the identity. A flow with the same key is **replaced in place** if nobody has tested it yet. If it already has sessions, ValidAI keeps it and creates `<name> (v2)` (then v3, …). Step ids are kept for steps whose `key` didn't change.
