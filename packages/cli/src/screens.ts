// The screen of each route (docs/application-model/ROUTES.md, slice 6d). A route may name a component as its `screen`; `<screen />` in the layout draws the one for the route shown. A component receives
// data only through props, so the framework writes the screen's use itself: each prop it declares is filled from the scope name of the same name, each event it declares runs the command of the same
// name. A component reads only its props, so the switch cannot be a component of its own: it is text that takes the place of `<screen />` in the layout, where the state's names are in scope.
import type { Component } from "@valancex/common";
import { ownNames, RESERVED, routingFor } from "@valancex/common/internal";

import type { Diagnostic } from "./diagnostics.js";
import { AppError, diagnostic } from "./diagnostics.js";
import { ENTRY_FILE } from "./project.js";
import { outline } from "./outline.js";
import { nameOf } from "./tree.js";
import type { DefinedApp } from "@valancex/common";

/** The commands the framework adds to every application. */
const FRAMEWORK_COMMANDS = ["go", "back", "forward", "resize", "colorScheme", "persist"];

/** Whether an event carries no value: `Schema.Void`. */
const bare = (schema: unknown): boolean => (schema as { readonly ast?: { readonly _tag?: string } } | undefined)?.ast?._tag === "VoidKeyword";

/**
 * The text of the `screen` template for one target: a case for each route whose screen is among `listed` (the components this target draws, by tag name and file), then the content blocks.
 * `undefined` when no route names a screen this target draws. A name a screen needs and the application does not have is a diagnostic at the route.
 */
export const screenSource = (author: DefinedApp | undefined, listed: ReadonlyMap<string, string>): string | undefined => {
  const routing = routingFor(author);
  const names = new Set([...RESERVED, ...ownNames(author).state]);
  const commands = new Set([...FRAMEWORK_COMMANDS, ...ownNames(author).commands]);
  const problems: Array<Diagnostic> = [];
  const cases: Array<string> = [];

  for (const { route, component } of routing.screens as ReadonlyArray<{ readonly route: string; readonly component: Component }>) {
    const tag = nameOf(component.template.mprx);

    if (listed.get(tag) !== component.template.mprx) {
      continue; // this target does not draw it
    }

    const wiring: Array<string> = [];

    for (const prop of Object.keys(component.props ?? {})) {
      if (names.has(prop)) {
        wiring.push(`${prop}={${prop}}`);
      } else {
        problems.push(
          diagnostic(
            ENTRY_FILE,
            1,
            "screen-prop",
            `the route "${route}" shows <${tag}>, which declares the prop "${prop}", but the application has no state field, derived value or framework name called "${prop}" to fill it from (the names are: ${[...names].join(", ")})`,
          ),
        );
      }
    }
    for (const [event, schema] of Object.entries(component.events ?? {})) {
      if (commands.has(event)) {
        wiring.push(`on.${event}={${event}(${bare(schema) ? "" : "$event"})}`);
      } else {
        problems.push(
          diagnostic(
            ENTRY_FILE,
            1,
            "screen-event",
            `the route "${route}" shows <${tag}>, which raises the event "${event}", but the application has no command called "${event}" to run (the commands are: ${[...commands].join(", ")})`,
          ),
        );
      }
    }

    cases.push(`${cases.length === 0 ? "{#if" : "{:else if"} route == "${route}"}<${tag}${wiring.length === 0 ? "" : ` ${wiring.join(" ")}`} />`);
  }

  if (problems.length > 0) {
    throw new AppError(problems);
  }

  return cases.length === 0 ? undefined : `${cases.join("")}{:else}<blocks items={blocks} />{/if}`;
};

const BLOCKS = "<blocks items={blocks} />";

/**
 * The template with `<screen />` replaced: by the switch over the routes' screens when `switched` is text, else by what draws the page's content. `<screen />` is the layout's (only the layout reads the
 * state), takes no props and has no children. A project whose routes name a screen needs it in the layout.
 */
export const expandScreen = (source: string, isLayout: boolean, switched: string | undefined, path: string): string => {
  const marks = outline(source).tags.filter((tag) => tag.name === "screen");

  if (marks.length === 0) {
    if (isLayout && switched !== undefined) {
      throw new AppError([
        diagnostic(
          path,
          1,
          "screen-unplaced",
          "a route names a screen, but the layout never writes <screen />, so the screen could never be shown: write <screen /> where the page goes (in place of <blocks items={blocks} />)",
        ),
      ]);
    }

    return source;
  }

  let out = source;

  for (const mark of [...marks].reverse()) {
    const written = /^<screen\s*(?:\/>|><\/screen\s*>)/.exec(out.slice(mark.offset));
    const line = out.slice(0, mark.offset).split("\n").length;

    if (!isLayout) {
      throw new AppError([
        diagnostic(path, line, "screen-place", "<screen /> belongs in the layout: only the layout can read the state and the commands a route's screen is wired to"),
      ]);
    }
    if (written === null) {
      throw new AppError([diagnostic(path, line, "screen-props", "<screen /> takes no props and has no children: write it as <screen />")]);
    }

    out = `${out.slice(0, mark.offset)}${switched ?? BLOCKS}${out.slice(mark.offset + written[0].length)}`;
  }

  return out;
};
