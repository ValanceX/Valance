// What a use of a primitive must satisfy besides its props, from the primitives' specifications (`rules` of the vocabulary): a control has a name (`unnamed-control`), a list holds only items
// (`list-child`), an item is in a list (`outside-container`). The checks read the compiled templates; a component the author wrote is not a primitive and is never judged by them (it may well draw the
// right primitive), only what the template itself writes.
import type { Template, TemplateChild, TemplateElement } from "@valancex/mesh-compiler";

import type { WebVocabulary } from "@valancex/common/internal";

import { diagnostic } from "./diagnostics.js";
import type { Diagnostic } from "./diagnostics.js";

type Rules = NonNullable<WebVocabulary["rules"]>;

/** The program's own constructs (`mesh-if`, `mesh-each`): they draw their children where they stand, so they are not part of the structure the rules judge. */
const transparent = (name: string): boolean => name.startsWith("mesh-");

const placeOf = (source: string, offset: number): { line: number; column: number } => {
  const before = source.slice(0, offset).split("\n");

  return { line: before.length, column: (before.at(-1)?.length ?? 0) + 1 };
};

/** The diagnostics for one template, written in `file`. `known` are the primitives' tags. */
export const checkTemplate = (file: string, source: string, template: Template, rules: Rules, known: ReadonlySet<string>): ReadonlyArray<Diagnostic> => {
  const found: Diagnostic[] = [];
  const report = (element: TemplateElement, code: string, message: string) => {
    const at = placeOf(source, element.span.start.utf16);

    found.push(diagnostic(file, at.line, code, message, at.column));
  };

  const visit = (element: TemplateElement, ancestors: ReadonlyArray<string>): void => {
    const tag = element.component;
    const structural = ancestors.filter((each) => !transparent(each));

    if (rules.named.includes(tag) && !element.props.some((each) => each.prop === "label") && !structural.includes("label")) {
      report(element, "unnamed-control", `<${tag}> has no accessible name: give it a \`label\`, or put it inside a <label> that says what it is for`);
    }

    const parent = structural.at(-1);
    const containers = rules.within[tag];

    if (containers !== undefined && parent !== undefined && known.has(parent) && !containers.includes(parent) && !(parent === "label")) {
      report(element, "outside-container", `<${tag}> belongs inside ${containers.map((each) => `<${each}>`).join(" or ")}, not <${parent}>`);
    }

    const only = rules.only[tag];

    for (const child of element.children) {
      if (only !== undefined) {
        reportChild(element, child, only);
      }

      if (child.kind === "element") {
        visit(child.element, [...ancestors, tag]);
      }
    }
  };

  const reportChild = (parent: TemplateElement, child: TemplateChild, only: ReadonlyArray<string>): void => {
    if (child.kind === "text" && child.value.trim() !== "") {
      report(parent, "list-child", `<${parent.component}> holds only ${only.map((each) => `<${each}>`).join(" or ")}; it has the text "${child.value.trim().slice(0, 20)}"`);
    } else if (child.kind === "element" && known.has(child.element.component) && !transparent(child.element.component) && !only.includes(child.element.component)) {
      report(child.element, "list-child", `<${parent.component}> holds only ${only.map((each) => `<${each}>`).join(" or ")}, not <${child.element.component}>`);
    }
  };

  visit(template.root, []);

  return found;
};
