// C-3: `vlx check` refuses a Schema.Redacted state field that has no default, (the layout never sees one, so a template that names it is an unknown name; `redacted-in-view` is for a hand-written view, tested in packages/valance/test/redacted.test.ts).
import { afterEach, describe, expect, it } from "vitest";

import { check } from "../src/check.js";
import { cleanup, PAGE, project } from "./fixture.js";

afterEach(cleanup);

const app = (state: string): string =>
  project({
    "content/index.md": PAGE(),
    "src/main.ts": `import { defineApp } from "@valancex/common";
import { Redacted, Schema } from "effect";

export default defineApp({
  state: { schema: Schema.Struct({ token: Schema.RedactedFromSelf(Schema.String) }), initial: ${state} },
});
`,
  });

describe("Redacted state fields", () => {
  it("accepts one with a default that no view reads", async () => {
    expect((await check(app("{ token: Redacted.make('t') }"))).diagnostics).toEqual([]);
  });

  it("reports a Redacted field with no default", async () => {
    expect((await check(app("{}"))).diagnostics).toMatchObject([{ code: "redacted-no-default", file: "src/main.ts" }]);
  });

  it("does not let the layout read one: its name is unknown there", async () => {
    const root = project({
      "content/index.md": PAGE(),
      "src/main.ts": `import { component, defineApp } from "@valancex/common";
import { Redacted, Schema } from "effect";
import layout from "./layout.mprx";

export default defineApp({ layout: component(layout), state: { schema: Schema.Struct({ token: Schema.RedactedFromSelf(Schema.String) }), initial: { token: Redacted.make("t") } } });
`,
      "src/layout.mprx": `<shell class="x" theme="light">\n<text class="t">{token}</text>\n</shell>`,
    });
    const found = (await check(root)).diagnostics;

    expect(found.length).toBeGreaterThan(0);
    expect(found.map((each) => each.message).join("\n")).toContain("token");
  });
});
