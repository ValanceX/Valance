// C-3 through Web.run: the server leaves a Redacted field out of the state it embeds, a hydrating page starts it at its declared default, and the tree adopted is the server's.
import * as Web from "@valancex/valance/web";
import { renderToHtml } from "@valancex/valance/web/server";
import { Effect, Redacted, Schema } from "effect";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { application, initial, TodoState_ } from "../src/app.js";
import { compilePrograms } from "../src/compile.js";

const programs = await compilePrograms();
const Secret = Schema.extend(TodoState_, Schema.Struct({ secret: Schema.RedactedFromSelf(Schema.String) }));
const primitives: Web.WebPrimitives = {
  column: { element: "div" },
  row: { element: "div" },
  heading: { element: "h1" },
  text: { element: "p" },
  button: { element: "button", events: { click: { type: "click" } } },
  checkbox: { element: "input" },
  textfield: {
    element: "input",
    props: { value: Web.controlled("value"), placeholder: Web.attribute("placeholder") },
    events: { change: Web.event("input", { kind: "string", of: (_event, element) => (element as HTMLInputElement).value }) },
  },
};
const withSecret = () =>
  ({ ...application(programs, initial()), state: { schema: Secret, initial: { ...initial(), secret: Redacted.make("default") } } }) as never as ReturnType<typeof application>;

describe("hydrating a state with a Redacted field", () => {
  it("restores the default and adopts the server's tree", async () => {
    const app = withSecret();
    const served = await Effect.runPromise(renderToHtml(app, { primitives, state: { ...initial(), secret: Redacted.make("hunter2") } as never }));

    expect(JSON.stringify(served.state)).not.toContain("hunter2");
    expect(served.state).not.toHaveProperty("secret");

    const container = new JSDOM("<!doctype html><div id=app></div>", { url: "http://localhost/" }).window.document.getElementById("app")!;

    container.innerHTML = served.html;

    const host = await Web.run(app, { container, primitives, present: "hydrate", state: served.state });

    expect(Redacted.value(((await Effect.runPromise(host.handle.state)) as unknown as { secret: Redacted.Redacted<string> }).secret)).toBe("default");
    expect(host.mounted.hydration?.adopted).toBe(true);
    expect(container.innerHTML).toBe(served.html);
    await host.stop();
  });
});
