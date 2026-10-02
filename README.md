# ValidAI skill (Claude plugin)

Prepare a prototype for user validation in [ValidAI](https://validai.lukantan.com): recommend Task Flows from your goals and validation evidence, tag click targets, then push to ValidAI or package a `.validai` file.

Current version: **2026.10.2-2**. This repository is generated from ValidAI on every release. Don't open pull requests here.

## Claude Code

```
/plugin marketplace add fortandr/validai-skill
/plugin install validai@lukantan
```

Then run `/plugin` → **Marketplaces** → **lukantan** → **Enable auto-update**. Third-party marketplaces don't auto-update by default, so without this you'll stay on the version you installed.

## Claude.ai / Cowork

Customize → **Plugins** → **Add** → `fortandr/validai-skill`, then turn on **Sync automatically**.

## Cursor, Codex and other assistants

Download `AGENTS.md` and `validai-share.mjs` from ValidAI → New Prototype → "set up your AI assistant" (https://validai.lukantan.com/prototypes/new#assistant). ValidAI warns you on import when they're out of date.
