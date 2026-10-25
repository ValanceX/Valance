// One word, one meaning (decision R18): `replay` is session logs (`vlx replay`, `@valancex/valance/replay`); a control's choice about a tap before the application is ready is `earlyInput`, `"keep"` or `"drop"`.
// The old name must not be accepted anywhere, and says what it is now.
import { afterEach, describe, expect, it } from "vitest";

import { check } from "../src/check.js";
import { cleanup, PAGE, project } from "./fixture.js";

afterEach(cleanup);

const MAIN = `import { component, defineApp, field } from "@valancex/common";
import { Schema } from "effect";
import layout from "./layout.mprx";
export default defineApp({
  state: { on: field(Schema.Boolean, false) },
  commands: (command) => ({ flip: command((state) => ({ ...state, on: !state.on })) }),
  layout: component(layout),
});
`;
const diagnosticsOf = async (inner: string): Promise<ReadonlyArray<string>> =>
  (await check(project({ "content/index.md": PAGE("Home", "Text."), "src/main.ts": MAIN, "src/layout.mprx": `<shell class="x" theme="light">${inner}</shell>` }))).diagnostics.map(
    ({ code, message }) => `${code}: ${message}`,
  );

const CONTROLS: Readonly<Record<string, (prop: string) => string>> = {
  button: (prop) => `<button on.click={flip()} ${prop}>Go</button>`,
  toggle: (prop) => `<toggle pressed={on} label="T" on.change={flip()} ${prop} />`,
  checkbox: (prop) => `<checkbox checked={on} label="C" on.change={flip()} ${prop} />`,
  radiogroup: (prop) => `<radiogroup label="R"><radio checked={on} value="a" label="A" on.select={flip()} ${prop} /></radiogroup>`,
};
const TAGS: Readonly<Record<string, string>> = { button: "button", toggle: "toggle", checkbox: "checkbox", radiogroup: "radio" };

describe("earlyInput", () => {
  for (const [name, control] of Object.entries(CONTROLS)) {
    const tag = TAGS[name]!;

    it(`on ${tag}: "keep" and "drop" are accepted, anything else is refused, and the old name \`replay\` is refused with a diagnostic that names \`earlyInput\``, async () => {
      expect(await diagnosticsOf(control('earlyInput="keep"'))).toEqual([]);
      expect(await diagnosticsOf(control('earlyInput="drop"'))).toEqual([]);
      expect(await diagnosticsOf(control('earlyInput="sometimes"'))).not.toEqual([]);

      for (const old of ['replay="never"', 'replay="safe"']) {
        const found = await diagnosticsOf(control(old));

        expect(found, old).toHaveLength(1);
        expect(found[0]).toContain(`unknown-prop: component "${tag}" has no prop "replay"`);
        expect(found[0]).toContain(`\`replay\` on \`${tag}\` is now \`earlyInput\``);
      }
    });
  }
});
