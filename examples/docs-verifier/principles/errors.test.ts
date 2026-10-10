// §9 error contracts, §4.4 return contracts, §10 trust: what a consumer sees when things go wrong, in each released package. Every failure should have a stable identity
// (`code`, or `_tag` for a typed failure), a message a person can act on, and the diagnostic information to find the cause.
import { compileProgram } from "@valancex/mesh-compiler";
import { render, update, updateChanges } from "@valancex/mesh-runtime";
import * as Nexus from "@valancex/nexus";
import { createWebPort, WebRealizationError } from "@valancex/port-web";
import * as Valance from "@valancex/valance";
import { Cause, Effect, Exit, Schema, Scope } from "effect";
import { JSDOM } from "jsdom";
import { afterAll, expect, it } from "vitest";

import { counter, counterProgram } from "./fixture.js";
import { evidence } from "./evidence.js";

const seen = evidence("errors");

afterAll(() => { seen.write(); });

const shape = (error: unknown) => {
  const e = (error ?? {}) as { code?: unknown; _tag?: unknown; message?: unknown; cause?: unknown; hint?: unknown };

  return { identity: typeof e.code === "string" ? `code:${e.code}` : typeof e._tag === "string" ? `_tag:${e._tag}` : "none", hasMessage: typeof e.message === "string" && e.message.length > 0, hasCause: e.cause !== undefined, hasHint: e.hint !== undefined };
};

it("mesh-compiler: a template that names something undeclared is a diagnostic with a code, a place and a suggestion, not an exception", async () => {
  const model = JSON.stringify({ version: 1, types: {}, components: { counter: { props: {}, events: {}, commands: {}, scope: { count: { kind: "number" } } }, text: { props: {}, events: {}, commands: {}, scope: {} } } });
  const result = await compileProgram({ model: { manifest: model, path: "model.json" }, root: "counter", components: [{ component: "counter", source: "<text>{cuont}</text>", path: "counter.mprx" }] });
  const diagnostic = result.components[0]!.diagnostics.diagnostics[0]!;

  seen.record("compile.unknownReference", { code: diagnostic.code, message: diagnostic.message, path: diagnostic.path, span: diagnostic.span.start, suggestions: diagnostic.suggestions });
  expect(result.program).toBeUndefined();
  expect(diagnostic.code).toBe("unknown-reference");
  expect(diagnostic.suggestions?.[0]?.replacement).toBe("count");                   // "did you mean": the corrective action, found reliably
});

it("mesh-runtime: a snapshot of the wrong shape is a diagnostics document (code, path, hint), and the call still resolves", async () => {
  const program = await counterProgram();
  const result = await render({ program: { root: program.root, templates: program.templates }, model: program.model, snapshot: { n: "three" } });

  seen.record("render.badSnapshot", result.diagnostics);
  expect(result.render).toBeUndefined();
  expect(result.diagnostics?.diagnostics[0]?.code).toBe("runtime-value-mismatch");
  expect(typeof result.diagnostics?.diagnostics[0]?.hint).toBe("string");
});

it("mesh-runtime: misuse of the API throws a MeshUsageError with a code (a programmer error is told apart from bad data)", async () => {
  const program = await counterProgram();
  const first = await render({ program: { root: program.root, templates: program.templates }, model: program.model, snapshot: { n: 1 } });
  // Documented: a released render still works, except one `updateChanges` made (it has no snapshot outside the module).
  const stillWorks = await update(first.render!, { n: 2 });
  const changed = await updateChanges(first.render!, { base: first.render!.version, changes: [{ op: "set", path: ["n"], value: 2 }] });

  changed.render!.release();
  stillWorks.render!.release();

  const released = await update(changed.render!, { n: 3 }).then(() => undefined, (error: unknown) => error);
  const wrongArgument = await render(undefined as never).then(() => undefined, (error: unknown) => error);

  seen.record("render.released", shape(released));
  seen.record("render.wrongArgument", shape(wrongArgument));
  expect(shape(released).identity).toBe("code:render-gone");
  expect(shape(wrongArgument).identity).toBe("code:invalid-argument");
  expect(released).toBeInstanceOf(TypeError);                                     // §17: it extends the language's own error for the mistake
});

it("port-web: using the port out of order, or asking for what the table cannot realize, is a WebRealizationError with a code", () => {
  const { window } = new JSDOM("<!doctype html><div id=r></div>");
  const container = window.document.getElementById("r")!;
  const port = createWebPort({ container, primitives: { text: { element: "span" } }, report: () => undefined });
  const early = (() => { try { port.patch({ format: "mesh-render-patch", version: 1, patches: [] } as never); return undefined; } catch (error) { return error; } })();
  const unknownTree = { format: "mesh-render", version: 1, root: { type: "node", key: "k", component: "nobody", props: {}, events: {}, children: [] } } as never;
  const unknown = (() => { try { port.draw(unknownTree); return undefined; } catch (error) { return error; } })();

  seen.record("port.patchBeforeDraw", shape(early));
  seen.record("port.unknownComponent", { ...shape(unknown), drew: container.innerHTML });
  expect(early).toBeInstanceOf(WebRealizationError);
  expect(shape(early).identity).toBe("code:not-drawn");
  // A component the table does not know is shown, not dropped (the runtime's own advice to renderers).
  expect(unknown === undefined).toBe(true);
  expect(container.innerHTML).toContain("<");
});

it("nexus: invalid command input is a typed failure with a tag", async () => {
  const command = Nexus.Command.define("probe.add", Schema.Struct({ amount: Schema.Number }), () => Effect.void);
  const invalid = await Effect.runPromise(Effect.flip(Nexus.Command.invoke(command, { amount: "x" } as never)));

  seen.record("nexus.invalidInput", shape(invalid));
  expect(shape(invalid).identity).toBe("_tag:CommandValidationError");
});

it("valance: closed, unmapped and unstartable are each told apart by a code or a tag", async () => {
  const app = await counter({}, undefined);
  const scope = await Effect.runPromise(Scope.make());
  const handle = await Effect.runPromise(Valance.start(app).pipe(Scope.extend(scope)));
  const unmapped = await Effect.runPromise(Effect.flip(handle.invoke("app/typo", [])));

  await Effect.runPromise(Scope.close(scope, Exit.void));

  const closed = await Effect.runPromise(Effect.exit(handle.invoke("app/bump", [])));
  const defect = Exit.isFailure(closed) ? Cause.squash(closed.cause) : undefined;
  const corrupt = await Effect.runPromise(Effect.flip(Valance.start(app, { state: { n: "zero" } as never }).pipe(Effect.scoped)));

  seen.record("valance.unmapped", shape(unmapped));
  seen.record("valance.closed", { ...shape(defect), isRefusal: Valance.isRefusal(defect), isValanceError: Valance.isValanceError(defect) });
  seen.record("valance.corruptInitialState", shape(corrupt));
  expect(shape(unmapped).identity).toBe("_tag:UnmappedCommand");
  expect(["code:admission-closed", "code:terminating"]).toContain(shape(defect).identity);
  expect(Valance.isRefusal(defect)).toBe(true);
  expect(shape(corrupt).identity).not.toBe("none");
});
