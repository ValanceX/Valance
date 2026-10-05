// The links fixture, shared by the Node test (test/links.test.ts) and the Chromium test (browser/links.browser.test.ts, whose program browser/links-setup.ts compiles in Node).
// A page with two links; its navigate command takes the page from the destination URL. Browser-safe: it names no compiler.
import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import { Deferred, Effect, Schema } from "effect";

export const manifest = JSON.stringify({
  version: 1, types: {},
  components: {
    page: { props: {}, events: {}, commands: {}, scope: {} },
    text: { props: {}, events: {}, commands: {}, scope: {} },
    link: { props: { href: { type: { kind: "string" }, required: true } }, events: {}, commands: {}, scope: {} },
    shell: { props: {}, events: {}, commands: {}, scope: { title: { kind: "string" } } },
  },
});
export const source = '<page><text>{title}</text><link href="/app/home">Home</link><link href="/app/about">About</link></page>';

export const primitives: Web.WebPrimitives = { page: { element: "div" }, text: { element: "span" }, link: Web.link };

const State = Schema.Struct({ page: Schema.String });
export type State = typeof State.Type;
export const urlOf = ({ page }: State): string => `/app/${page}`;
export const stateOf = (url: URL): { readonly page: string } => ({ page: url.pathname.slice("/app/".length) });

/** `gate` makes the navigate command WAIT after committing, as a command that loads what its destination shows would. */
export const application = (program: Parameters<typeof Valance.define>[0]["views"][string]["program"], gate?: Deferred.Deferred<void>) => Valance.define({
  name: "links",
  state: { schema: State, initial: { page: "home" } },
  views: { shell: { program, scope: (state: State) => ({ title: `page ${state.page}` }) } },
  view: () => "shell" as const,
  commands: (state) => ({
    // history's `navigate: "go"`: the navigation fact is this command's input
    go: Nexus.Command.define("links.go", Schema.Struct({ page: Schema.String }), ({ page }) =>
      Effect.zipRight(state.update((current) => Effect.succeed({ ...current, page })), gate === undefined ? Effect.void : Deferred.await(gate))),
  }),
});
