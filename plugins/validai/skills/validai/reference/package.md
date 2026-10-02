# `.validai` package (for assembling by hand)

A `.validai` file is a plain **zip** with two entries at its top level:

```
checkout-v3.validai
├── validai-flows.json      the manifest (see reference/manifest.md)
└── bundle/                 the prototype's build output
    ├── index.html          required
    └── …                   everything index.html loads (JS, CSS, images)
```

Limits: 10 MB per file, 50 MB total. Paths may not contain `..`.

Use the helper when you can (`validai-share.mjs pack`). Without a shell but with code execution (e.g. Claude.ai), build it in Python:

```python
import zipfile, pathlib
build = pathlib.Path("dist")                      # the build output folder, never "."
def skip(rel):                                    # hidden files, secrets, clutter
    parts = rel.parts
    return (any(s.startswith(".") and s != ".well-known" for s in parts)
            or "node_modules" in parts
            or rel.suffix in (".validai", ".pem", ".key", ".map"))
with zipfile.ZipFile("prototype.validai", "w", zipfile.ZIP_DEFLATED) as z:
    z.write("validai-flows.json", "validai-flows.json")
    for p in build.rglob("*"):
        rel = p.relative_to(build)
        if p.is_file() and not skip(rel):
            z.write(p, "bundle/" + rel.as_posix())
```

Testers can download everything in `bundle/`, so put only what the page loads there: no `.env`, `.git/`, evidence notes or other project files.

For a single self-contained HTML prototype, `bundle/index.html` can be that file.
The PM uploads it in ValidAI → New Prototype → **drop the .validai file**. ValidAI validates everything again on upload and shows any problems before anything is created.
