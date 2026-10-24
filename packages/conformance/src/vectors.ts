// The primitive vectors (decision Q5), generated from the specifications: for each portable primitive, the cases its types and rules give. A vector is data: a small render tree and the steps
// to take through an adapter, with what each observation and report must be. Nothing here knows a target.
//
//   example      the specification's own example: its role, name, text, state, children
//   state:P=V    each state a boolean prop carries, true and false
//   variant:P=V  each member of a closed set
//   event:E      each event, raised by the interaction a person makes (activate, type, a key, focus), with the payload its type gives
//   key:K        each keyboard row that raises an event, with a real key press
//   controlled:P a controlled value shows what the application last rendered: the person's change is reported, not shown, until the application renders it
//   hostile:P    a value of the wrong kind (a list where text goes) is refused, never drawn
//
// Adding a member to a closed set, or an event or a state to a specification, adds a vector with no one writing it.
import type { Specification, WebRealizations } from "@valancex/primitives";

import type { Capability, Interaction, Observation, Reported, Tree } from "./protocol.js";

export type Step =
  | { readonly op: "load"; readonly tree: Tree; readonly expect?: "refused" }
  | { readonly op: "update"; readonly tree: Tree }
  | {
      readonly op: "observe";
      readonly key: string;
      readonly expect: Partial<Observation>;
    }
  | {
      readonly op: "interact";
      readonly key: string;
      readonly how: Interaction;
      readonly expect: { readonly reports: ReadonlyArray<Reported> };
    }
  | {
      readonly op: "force";
      readonly key: string;
      readonly state: "hover" | "pressed" | "focus" | "focus-visible";
    };

export interface Vector {
  /** `<primitive>/<case>`. */
  readonly id: string;
  readonly primitive: string;
  readonly case: string;
  /** What an adapter must be able to do to run it. */
  readonly requires: ReadonlyArray<Capability>;
  readonly steps: ReadonlyArray<Step>;
}

export interface VectorFile {
  readonly version: 1;
  readonly spec: "primitives@1";
  readonly vectors: ReadonlyArray<Vector>;
}

type Props = Readonly<Record<string, unknown>>;
type Example = Specification["example"];
type Child = NonNullable<Example["children"]>[number];

const ROOT = "k0";

/** A render-v1 tree of one primitive: the key of a node is `k0`, `k0.1`, `k0.1.0`, a text run's is the key of its parent and `t`. Non-text prop values get a `propText` entry, as the runtime gives. */
export const treeOf = (
  realizations: WebRealizations,
  tag: string,
  props: Props | undefined,
  text: string | undefined,
  children: ReadonlyArray<Child> | undefined,
  prefix: string = ROOT,
): Tree => {
  const tagOf = (primitive: string): string => Object.entries(realizations.primitives).find(([, each]) => each.primitive === primitive)?.[0] ?? primitive;

  const node = (name: string, own: Props | undefined, words: string | undefined, inside: ReadonlyArray<Child> | undefined, key: string): unknown => {
    const realization = realizations.primitives[name];
    const given: Record<string, unknown> = {};
    const propText: Record<string, string> = {};

    for (const [prop, value] of Object.entries(own ?? {})) {
      const web = realization?.rename?.[prop] ?? prop;

      if (realization?.props?.[web] === undefined) {
        continue;
      }

      given[web] = value;

      if (typeof value !== "string" && !Array.isArray(value) && (typeof value !== "object" || value === null)) {
        propText[web] = String(value);
      }
    }

    return {
      type: "node",
      key,
      component: name,
      props: given,
      ...(Object.keys(propText).length === 0 ? {} : { propText }),
      events: Object.fromEntries(Object.keys(realization?.events ?? {}).map((event) => [event, `${name}.${event}`])),
      children: [
        ...(words === undefined ? [] : [{ type: "text", key: `${key}.t`, text: words }]),
        ...(inside ?? []).map((child, index) => node(tagOf(child.name), child.props, child.text, child.children, `${key}.${index}`)),
      ],
    };
  };

  return {
    format: "mesh-render",
    version: 1,
    root: node(tag, props, text, children, prefix),
  };
};

const textOf = (example: Example): string => [example.text ?? "", ...(example.children ?? []).map((child) => childText(child))].join("");

function childText(child: Child): string {
  return [child.text ?? "", ...(child.children ?? []).map(childText)].join("");
}

/** The accessible name the specification's rule gives for a use, or nothing when the rule gives none. */
const nameOf = (specification: Specification, props: Props | undefined, text: string): string | undefined => {
  const rule = specification.accessibleName;
  const prop = rule.prop === undefined ? undefined : props?.[rule.prop];

  switch (rule.from) {
    case "prop":
      return typeof prop === "string" ? prop : undefined;
    case "either":
      return typeof prop === "string" && prop !== "" ? prop : text !== "" ? text : undefined;
    case "content":
      return text !== "" ? text : undefined;
    default:
      return undefined;
  }
};

/** What the specification says a node with these props is, as far as an observation can say it. */
const expectation = (specification: Specification, props: Props | undefined, text: string, key: string, children: ReadonlyArray<string>): Partial<Observation> => {
  const role = specification.webRole ?? specification.role;
  const name = nameOf(specification, props, text);
  const flag = (prop: string): boolean | undefined => (typeof props?.[prop] === "boolean" ? (props[prop] as boolean) : undefined);

  return {
    key,
    ...(role === null || role === undefined || role === "generic" ? {} : { role }),
    ...(name === undefined ? {} : { name }),
    text,
    enabled: flag("disabled") !== true,
    ...(flag("checked") === undefined ? {} : { checked: flag("checked") as boolean }),
    ...(flag("pressed") === undefined || specification.name !== "toggle" ? {} : { pressed: flag("pressed") as boolean }),
    ...(flag("invalid") === undefined ? {} : { invalid: flag("invalid") as boolean }),
    children,
  };
};

/** The interaction that raises each event, and the payload it reports, by what the specification says of the event (decision Q11). `undefined` payload: the event carries none. */
const raise = (
  specification: Specification,
  event: string,
  props: Props | undefined,
):
  | {
      readonly how: Interaction;
      readonly payload?: unknown;
      readonly requires?: Capability;
      /** props the use needs for the event to be raised: a radio is chosen only when it is not */ readonly with?: Props;
    }
  | undefined => {
  const events = specification.events;

  if (events[event] === undefined) {
    return undefined;
  }

  switch (`${specification.name}.${event}`) {
    case "button.click":
      return { how: { kind: "activate" } };
    case "checkbox.change":
      return {
        how: { kind: "activate" },
        payload: props?.["checked"] !== true,
      };
    case "toggle.change":
      return {
        how: { kind: "activate" },
        payload: props?.["pressed"] !== true,
      };
    case "radio.select":
      return {
        how: { kind: "activate" },
        payload: props?.["value"],
        with: { checked: false },
      };
    case "textfield.change":
      return { how: { kind: "type", text: "typed" }, payload: "typed" };
    case "textfield.submit":
      return { how: { kind: "key", key: "Enter" }, requires: "keys" };
    case "textfield.cancel":
      return { how: { kind: "key", key: "Escape" }, requires: "keys" };
    case "textfield.focus":
      return { how: { kind: "focus" } };
    case "textfield.blur":
      return { how: { kind: "blur" } };
    case "dialog.dismiss":
    case "popover.dismiss":
      return {
        how: { kind: "key", key: "Escape" },
        payload: "escape",
        requires: "layers",
      };
    default:
      return undefined;
  }
};

const KEYS: Readonly<Record<string, string>> = { Space: " " };

/** The vectors of one portable primitive. */
const vectorsOf = (specification: Specification, tag: string, realizations: WebRealizations): ReadonlyArray<Vector> => {
  const out: Vector[] = [];
  const layers = specification.name === "dialog" || specification.name === "popover";
  // a primitive with more than one tag (`list` and `olist`) has the cases of each, the later tags named by the tag
  const first = Object.entries(realizations.primitives).find(([, each]) => each.primitive === specification.name)?.[0];
  const add = (made: string, requires: ReadonlyArray<Capability>, steps: ReadonlyArray<Step>): void => {
    const name = first === tag ? made : `${made}@${tag}`;

    out.push({
      id: `${specification.name}/${name}`,
      primitive: specification.name,
      case: name,
      requires: [...new Set([...requires, ...(layers ? (["layers"] as const) : [])])],
      steps,
    });
  };
  const example = specification.example;
  const tree = (props: Props | undefined = example.props, text: string | undefined = example.text, children: ReadonlyArray<Child> | undefined = example.children): Tree =>
    treeOf(realizations, tag, props, text, children);
  const words = textOf(example);
  const childKeys = (example.children ?? []).map((_, index) => `${ROOT}.${index}`);
  const hasRole = (specification.webRole ?? specification.role) !== null && specification.role !== "generic";

  // the example: what the specification says it is
  add(
    "example",
    [...(hasRole ? (["roles"] as const) : []), "names"],
    [
      { op: "load", tree: tree() },
      {
        op: "observe",
        key: ROOT,
        expect: expectation(specification, example.props, words, ROOT, childKeys),
      },
      ...(example.children ?? []).map((child, index): Step => ({
        op: "observe",
        key: `${ROOT}.${index}`,
        expect: { key: `${ROOT}.${index}`, text: childText(child) },
      })),
    ],
  );

  // each boolean state
  for (const [prop, definition] of Object.entries(specification.props)) {
    if (definition.type.kind === "boolean" && ["disabled", "checked", "invalid", "pressed"].includes(prop)) {
      for (const value of [true, false]) {
        const props = { ...example.props, [prop]: value };

        add(
          `state:${prop}=${value}`,
          [],
          [
            { op: "load", tree: tree(props) },
            {
              op: "observe",
              key: ROOT,
              expect: pick(expectation(specification, props, words, ROOT, childKeys), prop === "disabled" ? "enabled" : prop),
            },
          ],
        );
      }
    }

    // each member of a closed set is accepted
    if (definition.type.kind === "enum") {
      for (const value of definition.type.values) {
        const props = { ...example.props, [prop]: value };

        add(
          `variant:${prop}=${value}`,
          [],
          [
            { op: "load", tree: tree(props) },
            { op: "observe", key: ROOT, expect: { key: ROOT, text: words } },
          ],
        );
      }
    }
  }

  // each event, raised by what a person does
  for (const event of Object.keys(specification.events)) {
    const how = raise(specification, event, example.props);

    if (how === undefined) {
      continue;
    }

    add(`event:${event}`, how.requires === undefined ? [] : [how.requires], [
      { op: "load", tree: tree({ ...example.props, ...how.with }) },
      {
        op: "interact",
        key: ROOT,
        how: how.how,
        expect: {
          reports: [how.payload === undefined ? [`${specification.name}.${event}`] : [`${specification.name}.${event}`, how.payload]],
        },
      },
    ]);
  }

  // each keyboard row that raises an event, with a real key
  for (const row of specification.keyboard) {
    const raised = row.raises === undefined ? undefined : raise(specification, row.raises, example.props);

    if (row.raises === undefined || specification.events[row.raises] === undefined || raised === undefined) {
      continue;
    }

    add(
      `key:${row.key}`,
      ["keys", ...(raised.requires === undefined ? [] : [raised.requires])],
      [
        { op: "load", tree: tree({ ...example.props, ...raised.with }) },
        {
          op: "interact",
          key: ROOT,
          how: { kind: "key", key: KEYS[row.key] ?? row.key },
          expect: {
            reports: [raised.payload === undefined || row.raises === "click" ? [`${specification.name}.${row.raises}`] : [`${specification.name}.${row.raises}`, raised.payload]],
          },
        },
      ],
    );
  }

  // a controlled value is the application's: the person's change is reported, and after the application renders (a refusal is the same tree again) the PORT shows what was rendered
  for (const [prop, definition] of Object.entries(specification.props)) {
    if (definition.controlled !== true || example.props?.[prop] === undefined) {
      continue;
    }

    const event = Object.keys(specification.events).find((each) => each === "change" || each === "select");
    const how = event === undefined ? undefined : raise(specification, event, example.props);

    if (event === undefined || how === undefined) {
      continue;
    }

    // the use before the person acts: a radio is not chosen yet
    const start: Props = { ...example.props, ...how.with };
    const before = start[prop];
    const after = typeof before === "boolean" ? !before : "rendered";
    const key = typeof before === "string" ? "value" : specification.name === "toggle" ? "pressed" : "checked";
    const shown = (value: unknown): Partial<Observation> => ({ [key]: value }) as Partial<Observation>;

    add(
      `controlled:${prop}`,
      [],
      [
        { op: "load", tree: tree(start) },
        {
          op: "interact",
          key: ROOT,
          how: how.how,
          expect: {
            reports: [how.payload === undefined ? [`${specification.name}.${event}`] : [`${specification.name}.${event}`, how.payload]],
          },
        },
        // the application rendered the same: it refused the change
        { op: "update", tree: tree(start) },
        { op: "observe", key: ROOT, expect: shown(before) },
        { op: "update", tree: tree({ ...start, [prop]: after }) },
        { op: "observe", key: ROOT, expect: shown(after) },
      ],
    );
  }

  // a value of the wrong kind is refused, never drawn
  for (const [prop, definition] of Object.entries(specification.props)) {
    if (definition.webOnly === true || !["string", "boolean", "number", "enum"].includes(definition.type.kind) || realizations.primitives[tag]?.props?.[prop] === undefined) {
      continue;
    }

    add(
      `hostile:${prop}`,
      [],
      [
        {
          op: "load",
          tree: tree({ ...example.props, [prop]: ["not", "a", "scalar"] }),
          expect: "refused",
        },
      ],
    );
  }

  return out;
};

const pick = (full: Partial<Observation>, member: string): Partial<Observation> =>
  ({
    key: full.key as string,
    [member]: (full as Record<string, unknown>)[member],
  }) as Partial<Observation>;

/** The vectors of every portable primitive that has a tag, in the order of the realizations. */
export const generate = (specifications: Readonly<Record<string, Specification>>, realizations: WebRealizations): VectorFile => ({
  version: 1,
  spec: "primitives@1",
  vectors: Object.entries(realizations.primitives)
    .filter(([, each]) => specifications[each.primitive]?.status === "portable")
    .flatMap(([tag, each]) => vectorsOf(specifications[each.primitive]!, tag, realizations)),
});
