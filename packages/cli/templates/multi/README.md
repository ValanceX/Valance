# {{name}}

A VALANCE application for the web and the desktop, made with `vlx init --web --desktop`.

```console
$ {{run}} dev -- --web       # serve the site (--desktop opens the window instead)
$ {{run}} build              # build every target: dist/web/ and dist/desktop/
$ {{run}} check              # find mistakes in your files, for every target
```

- `content/` is Markdown, and the state and commands in `src/main.ts` are the application's: the same on every target.
- Each target has its own templates, because each draws with its own vocabulary: `src/web/` and `src/desktop/`. `src/main.ts` says which is whose (`targets`).
- `valance.web.json` and `valance.desktop.json` say which targets the project has; `valance.json` names the application.
