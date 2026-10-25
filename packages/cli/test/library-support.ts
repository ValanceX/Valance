// A library installed the way a consumer has one: its files copied into `node_modules/<name>` (not linked), with the package.json a library publishes. The library here is what `vlx library build`
// writes: compiled JavaScript that imports its templates and stylesheets as source files.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { PAGE } from "./fixture.js";

export const DISCLOSURE_TEMPLATE = `<column>
  <button on.click={toggle()}>{label}</button>
  {#if open}<text>The panel is open</text>{/if}
</column>
`;

export const DISCLOSURE_JS = `import { component } from "@valancex/common";
import { Schema } from "effect";
import template from "./disclosure.mprx";

export const disclosure = component(template, { props: { label: Schema.String, open: Schema.Boolean }, events: { toggle: Schema.Void } });
export const components = [disclosure];
`;

export interface LibraryOptions {
  readonly name?: string;
  readonly field?: unknown;
  readonly exports?: unknown;
  readonly files?: Readonly<Record<string, string>>;
}

/** The files of an `acme-ui` library: a package.json with the condition and the field, the compiled entry, a template and a stylesheet. */
export const libraryFiles = (options: LibraryOptions = {}): Record<string, string> => {
  const name = options.name ?? "acme-ui";

  return {
    "package.json": JSON.stringify(
      {
        name,
        version: "1.0.0",
        type: "module",
        exports: options.exports ?? { ".": { types: "./dist/index.d.ts", valance: "./dist/index.js" } },
        sideEffects: ["**/*.css"],
        peerDependencies: { "@valancex/common": "^0.14.0", effect: "^3.10.0" },
        valance: options.field ?? { kind: "components", targets: ["web", "desktop"], styles: ["./dist/disclosure.css"] },
      },
      null,
      2,
    ),
    "dist/index.js": DISCLOSURE_JS,
    "dist/disclosure.mprx": DISCLOSURE_TEMPLATE,
    "dist/disclosure.css": ".disclosure-marker { color: rgb(1, 2, 3); }\n",
    ...options.files,
  };
};

export const install = (root: string, name: string, files: Readonly<Record<string, string>>): void => {
  for (const [path, text] of Object.entries(files)) {
    const file = join(root, "node_modules", ...name.split("/"), path);

    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
};

export const APP_MAIN = (library = "acme-ui", extra = ""): string => `import { component, defineApp, field } from "@valancex/common";
import { Schema } from "effect";
import { disclosure } from "${library}";
import layout from "./layout.mprx";
export default defineApp({
  state: { opened: field(Schema.Boolean, false) },
  commands: (command) => ({ flip: command((state) => ({ ...state, opened: !state.opened })) }),
  layout: component(layout),
  components: [disclosure],${extra}
});
`;

export const APP_LAYOUT = `<column>
  <disclosure label="More" open={opened} on.toggle={flip()} />
</column>
`;

/** The application's package.json: what a project made by `vlx init` has, naming the library it depends on. */
export const APP_PACKAGE = (libraries: ReadonlyArray<string> = ["acme-ui"]): string =>
  JSON.stringify({ name: "app", private: true, type: "module", dependencies: Object.fromEntries(libraries.map((name) => [name, "1.0.0"])) });

export const APP_FILES = (extra: Readonly<Record<string, string>> = {}): Record<string, string> => ({
  "package.json": APP_PACKAGE(),
  "content/index.md": PAGE("Home", "Text."),
  "src/main.ts": APP_MAIN(),
  "src/layout.mprx": APP_LAYOUT,
  ...extra,
});
