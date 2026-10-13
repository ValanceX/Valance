# {{name}}

A VALANCE application for the web, made with `vlx init`.

```console
$ {{run}} dev      # serve it, and rebuild as you edit
$ {{run}} build    # write the site to dist/
$ {{run}} check    # find mistakes in your files without building
```

- `content/` is Markdown: a page's path is its address.
- `src/layout.mprx` is the page around it; `src/main.ts` declares the components it uses (start reading there).
- `src/styles.css` is the look. `public/` is served as it is.
- `valance.json` names the application{{web_note}}.
