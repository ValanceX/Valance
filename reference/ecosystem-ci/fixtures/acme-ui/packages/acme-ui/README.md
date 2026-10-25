# acme-ui

A VALANCE component library. Its templates ship as source and the application's build compiles them; the package says so with the `valance` export condition, and says what it supports in its `valance` field.

```
pnpm build:library   # vlx library build: JavaScript, declarations, templates and stylesheets into dist/
pnpm check:library   # vlx library check: the package, and the playground that uses every component
pnpm playground      # the playground application, served
```

The playground (`../../playground`) is an application that depends on this package the way a consumer does; it is how each target the package declares is checked.
