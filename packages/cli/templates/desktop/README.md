# {{name}}

A VALANCE application for the desktop, made with `vlx init --desktop`.

```console
$ {{run}} dev      # open the window, and update it as you edit
$ {{run}} build    # write the engine to dist/desktop/
$ {{run}} check    # find mistakes in your files without building
```

- `content/` is Markdown: a page's path is its address.
- `src/layout.mprx` is the window around a page; `src/main.ts` declares it, the state and the commands.
- `valance.desktop.json` marks the project as a desktop one; `valance.json` names the application.
- The window is the Desktop PORT's (`valancex-port-desktop`); `vlx build` writes the engine it runs, `dist/desktop/engine.mjs`.
