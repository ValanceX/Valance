// `command-argument-order` (a warning of `vlx check`, B3): a bare command takes an event's arguments by position, the first argument filling the first field of its input struct, and so on,
// unless every argument is named after a different field of it, when they fill those fields by name (Valance's `bareBinding`). This says where the binding is still positional and a template's arguments are named otherwise. An argument's name is the last name of a plain path (`from`, `row.to`); a literal, `$event` or any
// other expression has none and is not compared. A command of one field is not compared: its one argument fills it whatever it is called.
import type { DefinedApp } from "@valancex/common";
import type { Manifest } from "@valancex/valance/web/build";
import { forTarget } from "@valancex/common/internal";

import type { Config } from "./config.js";
import { manifestOf, templatesOf } from "./compile.js";
import type { Diagnostic } from "./diagnostics.js";
import { targetOf } from "./targets.js";
import { placeIn } from "./tree.js";
import { scan } from "./wiring.js";

export const CODE = "command-argument-order";

/** The top-level arguments of a call's argument list, strings and brackets respected. */
const argumentsOf = (list: string): ReadonlyArray<string> => {
  const found: Array<string> = [];
  let depth = 0;
  let start = 0;

  for (let at = 0; at < list.length; at += 1) {
    const char = list[at]!;

    if (char === '"') {
      at += 1;
      while (at < list.length && list[at] !== '"') {
        at += list[at] === "\\" ? 2 : 1;
      }
    } else if ("([{".includes(char)) {
      depth += 1;
    } else if (")]}".includes(char)) {
      depth -= 1;
    } else if (char === "," && depth === 0) {
      found.push(list.slice(start, at).trim());
      start = at + 1;
    }
  }

  return list.trim() === "" ? found : [...found, list.slice(start).trim()];
};

const nameOf = (argument: string): string | undefined => (/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/.test(argument) ? argument.split(".").pop() : undefined);

/** The warnings for the author's templates, on every target the project has. */
export const argumentOrder = (root: string, author: DefinedApp | undefined, config: Config): ReadonlyArray<Diagnostic> => {
  const found: Array<Diagnostic> = [];

  for (const id of config.targets) {
    const target = targetOf(id);
    const own = forTarget(author, id);
    const layout = (manifestOf(own, target.vocabulary).components as Readonly<Record<string, Manifest["components"][string]>>)["layout"];
    const commands = layout?.commands ?? {};
    const templates = templatesOf(root, own, target.vocabulary, target.views);

    for (const template of templates.all.filter((each) => !each.builtIn)) {
      // A component's own unit command of that name is bound before the bare one (`ApplicationDefinition.units`), so its arguments are not the bare command's.
      const unit = Object.keys(templates.tree.find((node) => node.name === template.component)?.interface?.unit?.commands ?? {});

      for (const element of scan(template.source).elements) {
        for (const attribute of element.attributes.filter((each) => each.name.startsWith("on.") && !each.string)) {
          const call = /^([A-Za-z_]\w*)\s*\(([\s\S]*)\)$/.exec(attribute.text);
          const fields = call === null || unit.includes(call[1]!) ? undefined : commands[call[1]!]?.parameters.map((each) => each.name);

          if (call === null || fields === undefined || fields.length < 2) {
            continue;
          }

          const names = argumentsOf(call[2]!).map(nameOf);

          // Every argument named after a different field: bound by name, in any order, so there is nothing to warn about.
          const byName = names.every((name) => name !== undefined && fields.includes(name)) && new Set(names).size === names.length;

          if (!byName && names.some((name, index) => name !== undefined && index < fields.length && name !== fields[index])) {
            const place = placeIn(template.source, attribute.at, template.path);

            found.push({
              ...place,
              code: CODE,
              severity: "warning",
              message: `${call[1]}(${names.map((name) => name ?? "…").join(", ")}) passes its arguments by position (they are not all named after fields): the command's fields are ${call[1]}(${fields.join(", ")}), so the first argument fills \`${fields[0]}\`, and so on. Pass them in that order, or rename them`,
            });
          }
        }
      }
    }
  }

  return found.filter((each, index) => found.findIndex((other) => other.file === each.file && other.line === each.line && other.column === each.column) === index);
};
