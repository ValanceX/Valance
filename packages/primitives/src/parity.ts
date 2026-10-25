// The parity report: the Desktop PORT's vocabulary (its own data, decision P1) against the specifications. For each primitive the Desktop has, its props (name, type, required) and events (name, payload)
// are those the specification gives for the portable contract; a primitive the specification calls portable is in the Desktop's vocabulary, and one it calls desktop-only or web-only is only where it says.
// A difference is a finding. A finding with a waiver (waivers.json: the primitive, the member, and the reason) is waived; any other is red.
import type { Specification, Type } from "./types.js";

export interface DesktopComponent {
  readonly props: Readonly<Record<string, { readonly type: Type; readonly required: boolean }>>;
  readonly events: Readonly<Record<string, { readonly payload?: Type }>>;
}

export interface Desktop {
  readonly components: Readonly<Record<string, DesktopComponent>>;
}

export interface Finding {
  readonly primitive: string;
  /** `primitive` for its presence, `props.<name>` or `events.<name>` for a member. */
  readonly member: string;
  readonly what: string;
}

export interface Waiver {
  readonly primitive: string;
  readonly member: string;
  readonly reason: string;
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** The portable props of a specification: those not marked as the web's own. */
const portableProps = (specification: Specification) => Object.entries(specification.props).filter(([, each]) => each.webOnly !== true);

export const parity = (specifications: Readonly<Record<string, Specification>>, desktop: Desktop): ReadonlyArray<Finding> => {
  const found: Finding[] = [];

  for (const [name, specification] of Object.entries(specifications)) {
    const component = desktop.components[name];

    if (specification.status === "web-only") {
      if (component !== undefined) {
        found.push({ primitive: name, member: "primitive", what: "the Desktop has a primitive the specification calls web-only" });
      }

      continue;
    }

    if (component === undefined) {
      found.push({ primitive: name, member: "primitive", what: `the specification calls it ${specification.status}; the Desktop's vocabulary has no such component` });
      continue;
    }

    const props = new Map(portableProps(specification));

    for (const [prop, declared] of props) {
      const there = component.props[prop];

      if (there === undefined) {
        found.push({ primitive: name, member: `props.${prop}`, what: "the Desktop lacks the prop" });
      } else if (!same(there.type, declared.type) || there.required !== declared.required) {
        found.push({
          primitive: name,
          member: `props.${prop}`,
          what: `the Desktop has ${JSON.stringify(there)}; the specification ${JSON.stringify({ type: declared.type, required: declared.required })}`,
        });
      }
    }

    for (const prop of Object.keys(component.props)) {
      if (!props.has(prop)) {
        found.push({ primitive: name, member: `props.${prop}`, what: "the Desktop has a prop the specification does not" });
      }
    }

    for (const [event, declared] of Object.entries(specification.events)) {
      const there = component.events[event];

      if (there === undefined) {
        found.push({ primitive: name, member: `events.${event}`, what: "the Desktop lacks the event" });
      } else if (!same(there.payload, declared.payload)) {
        found.push({
          primitive: name,
          member: `events.${event}`,
          what: `the Desktop's payload is ${JSON.stringify(there.payload)}; the specification's ${JSON.stringify(declared.payload)}`,
        });
      }
    }

    for (const event of Object.keys(component.events)) {
      if (specification.events[event] === undefined) {
        found.push({ primitive: name, member: `events.${event}`, what: "the Desktop has an event the specification does not" });
      }
    }
  }

  for (const name of Object.keys(desktop.components)) {
    if (specifications[name] === undefined) {
      found.push({ primitive: name, member: "primitive", what: "the Desktop has a component with no specification" });
    }
  }

  return found;
};

/** The findings no waiver covers, and the waivers that cover nothing (a waiver that no longer applies is removed). */
export const settle = (
  findings: ReadonlyArray<Finding>,
  waivers: ReadonlyArray<Waiver>,
): { red: ReadonlyArray<Finding>; waived: ReadonlyArray<Finding & { reason: string }>; stale: ReadonlyArray<Waiver> } => {
  const used = new Set<Waiver>();
  const waived: Array<Finding & { reason: string }> = [];
  const red: Finding[] = [];

  for (const finding of findings) {
    const waiver = waivers.find((each) => each.primitive === finding.primitive && each.member === finding.member);

    if (waiver === undefined) {
      red.push(finding);
    } else {
      used.add(waiver);
      waived.push({ ...finding, reason: waiver.reason });
    }
  }

  return { red, waived, stale: waivers.filter((each) => !used.has(each)) };
};
