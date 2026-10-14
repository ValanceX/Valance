# todo-multi

A VALANCE application for the web and the desktop, made with `vlx init --web --desktop`.

```console
$ pnpm dev -- --web       # serve the site (--desktop opens the window instead)
$ pnpm build              # build every target: dist/web/ and dist/desktop/
$ pnpm check              # find mistakes in your files, for every target
```

- `content/` is Markdown, and the state and commands in `src/main.ts` are the application's: the same on every target.
- Each target has its own templates, because each draws with its own vocabulary: `src/web/` and `src/desktop/`. `src/main.ts` says which is whose (`targets`).
- `valance.web.json` and `valance.desktop.json` say which targets the project has; `valance.json` names the application.
