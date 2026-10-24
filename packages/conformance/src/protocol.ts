// The adapter: the five operations a PORT provides to be checked (decisions Q3, Q4, Q10, Q11), and the line-JSON protocol that carries them to a PORT in another process or another language. A
// PORT in Rust speaks it as the Desktop host protocol does: one JSON message per line.
//
//   load(tree)             draw a render tree afresh
//   update(tree)           present the next tree of the same program
//   observe(key)           what a person or a tool can observe at a node: meaning, not structure
//   interact(key, how)     do what a person would, and return the reports the PORT made, as (handler, payload)
//   unmount()              tear down
//
// and, where a target can, `force(key, state)`: put a node in a state a person puts it in by hovering, pressing or tabbing (Q10).

/** A render-v1 tree, as the kit builds and a PORT draws it. */
export type Tree = {
  readonly format: "mesh-render";
  readonly version: 1;
  readonly root: unknown;
  readonly events?: unknown;
  readonly children?: unknown;
};

/** What a node is, as a person or a tool can observe it. Only members that apply are present. */
export interface Observation {
  readonly key: string;
  /** The primitive's component name in the tree. */
  readonly component: string;
  /** The ARIA role; absent for a node that exposes none. */
  readonly role?: string;
  /** The accessible name, by the computation the standard defines. */
  readonly name?: string;
  readonly description?: string;
  /** The text of the node and its descendants, as a person reads it. */
  readonly text: string;
  readonly value?: string;
  readonly enabled: boolean;
  readonly checked?: boolean;
  readonly pressed?: boolean;
  readonly invalid?: boolean;
  /** The keys of the node's child nodes (not text runs), in order. */
  readonly children: ReadonlyArray<string>;
}

/** What a person does (Q11): activate, type (replace the text), press a key, move focus in or out, or hover. */
export type Interaction =
  | { readonly kind: "activate" }
  | { readonly kind: "type"; readonly text: string }
  | { readonly kind: "key"; readonly key: string }
  | { readonly kind: "focus" }
  | { readonly kind: "blur" }
  | { readonly kind: "pointer-hover" };

/** What a PORT reported: the handler identifier from the tree, and a payload when the event has one. */
export type Reported = readonly [handler: string, payload?: unknown];

/** A state a target forces (Q10). */
export type ForcedState = "hover" | "pressed" | "focus" | "focus-visible";

/** What an adapter can do, so a vector that needs more is skipped or failed by the rule of Q6. */
export type Capability = "roles" | "names" | "keys" | "force" | "layers";

/** A gap a PORT states in its own data (Q6): the vectors it covers are `unsupported`, not `fail`. Silence is a failure. */
export interface Declared {
  /** The primitive the gap is about, or `*` for all. */
  readonly primitive: string;
  /** A case id or a prefix of one (`event:`), or `*` for every case of the primitive. */
  readonly case: string;
  readonly reason: string;
}

export interface Capabilities {
  readonly port: string;
  readonly version: string;
  /** What the adapter can observe and do. A capability a vector requires and this lacks makes that vector `unsupported` if declared, `fail` if not. */
  readonly can: ReadonlyArray<Capability>;
  readonly unsupported: ReadonlyArray<Declared>;
}

/** A refusal: the PORT would not draw the tree. */
export class Refused extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "Refused";
  }
}

export interface Adapter {
  capabilities(): Promise<Capabilities>;
  load(tree: Tree): Promise<void>;
  update(tree: Tree): Promise<void>;
  observe(key: string): Promise<Observation | undefined>;
  interact(key: string, how: Interaction): Promise<ReadonlyArray<Reported>>;
  force?(key: string, state: ForcedState): Promise<void>;
  unmount(): Promise<void>;
}
