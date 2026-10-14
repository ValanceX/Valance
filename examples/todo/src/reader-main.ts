// A content site in a window, as an experiment (docs/application-model/NATIVE-VOCABULARY.md, "the content layer"): a `vlx`-style project compiled against the native vocabulary, run behind the
// host protocol. `node dist/reader-main.js <dir>`, where `dir` holds `content.json` and `program.json` (written by `packages/cli/test/native-content.test.ts` when `NATIVE_READER_OUT` is set).
// What it shows: the application a `vlx` project defines runs unchanged, a link is an address the application turns into its own navigation, and the window draws the content layer.
import { application, routes } from "@valancex/common/internal";
import type { Content } from "@valancex/common/internal";
import { Effect } from "effect";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { serve } from "./host.js";

const dir = process.argv[2];

if (dir === undefined) {
  console.error("usage: node dist/reader-main.js <dir with content.json and program.json>");
  process.exit(2);
}

const content = JSON.parse(readFileSync(join(dir, "content.json"), "utf8")) as Content;
const program = JSON.parse(readFileSync(join(dir, "program.json"), "utf8")) as never;
const table = routes(content);

process.stdin.setEncoding("utf8");
await Effect.runPromise(
  serve(
    application(content, program),
    { input: process.stdin, output: process.stdout },
    {
      titleOf: (state) => {
        const page = content.pages.find((each) => each.path === state.page);

        return page === undefined ? content.site.name : `${page.title} · ${content.site.name}`;
      },
      // A link carries an address; only an address on this site means anything here (an external address would need a capability that opens it, which is not built).
      onLink: (href, handle) =>
        href.startsWith("/") && !href.startsWith("//")
          ? handle.invoke("app/go", [{ value: (table.stateOf(new URL(href, "http://app.invalid/")) as { readonly id: string }).id }] as never)
          : Effect.void,
    },
  ),
);
process.exit(0);
