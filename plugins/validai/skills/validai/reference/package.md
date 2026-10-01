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
build = pathlib.Path("dist")                      # the build output folder
with zipfile.ZipFile("prototype.validai", "w", zipfile.ZIP_DEFLATED) as z:
    z.write("validai-flows.json", "validai-flows.json")
    for p in build.rglob("*"):
        if p.is_file():
            z.write(p, "bundle/" + p.relative_to(build).as_posix())
```

For a single self-contained HTML prototype, `bundle/index.html` can be that file.
The PM uploads it in ValidAI → New Prototype → **drop the .validai file**. ValidAI validates everything again on upload and shows any problems before anything is created.
