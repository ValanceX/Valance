// The shapes of a primitive specification (`primitive-v1`, schema/primitive-v1.schema.json) and of the web's realization of it (schema/realization-web-v1.schema.json). Both are data: no code, no DOM
// element or widget in a specification (fixed point 4: a PORT decides how a target realizes meaning).

/** A MESH type, as the component manifest writes it (the kinds a primitive's props and payloads use). */
export type Type =
  | { readonly kind: "string" | "number" | "boolean" | "null" | "any" }
  | { readonly kind: "enum"; readonly values: ReadonlyArray<string> }
  | { readonly kind: "list"; readonly element: Type };

/** How a primitive is available: on every target (portable), or on one (decision P2: a status, no namespace). */
export type Status = "portable" | "web-only" | "desktop-only";

/** The ARIA role a primitive exposes. The version-1 set (decision A11, 23 names, pinned to AccessKit 0.17.1) and the roles the web gives elements outside it (landmarks and the content roles). */
export type Role = string;

/** What gives a primitive its accessible name (decision A14). `either`: a non-empty prop, else the text inside. `orContainedIn`: a `label` wrapper around it also names it (decision P4). */
export interface AccessibleName {
  readonly from: "content" | "prop" | "either" | "none";
  readonly prop?: string;
  readonly orContainedIn?: "label";
  /** A use without a name is an error (`unnamed-control`): the control is only usable if it has one. */
  readonly required?: boolean;
}

export interface PropSpecification {
  readonly type: Type;
  readonly required: boolean;
  /** The value is the application's: what is shown is exactly what it last rendered. */
  readonly controlled?: boolean;
  /** What the prop is for in accessibility terms. */
  readonly a11y?: "name" | "state" | "relationship" | "level" | "description-target";
  /** A prop of the web only (a styling or accessibility hook), not part of the portable contract. */
  readonly webOnly?: boolean;
}

export interface EventSpecification {
  readonly payload?: Type;
  readonly meaning?: string;
}

export interface KeyRow {
  readonly key: string;
  /** The event the key raises. */
  readonly raises?: string;
  /** Or the way it moves focus within the primitive's group. */
  readonly moves?: "next" | "previous";
}

/** The content a primitive may have: none, text, anything, or only children of the named primitives. */
export type Content = "none" | "text" | "any" | { readonly only: ReadonlyArray<string> };

export interface ExampleChild {
  readonly name: string;
  readonly props?: Readonly<Record<string, unknown>>;
  readonly text?: string;
  readonly children?: ReadonlyArray<ExampleChild>;
}

/** A conformance case in data: a use of the primitive that satisfies its own rules. The conformance run draws it and checks what the specification says of it. */
export interface Example {
  readonly props?: Readonly<Record<string, unknown>>;
  readonly text?: string;
  readonly children?: ReadonlyArray<ExampleChild>;
  /** The text of the node a `describedby` in `props` points at (its `id`), which the run puts in the page. */
  readonly describedByText?: string;
}

export interface Specification {
  readonly version: 1;
  readonly name: string;
  readonly status: Status;
  /** The role, or null for a primitive that exposes none. */
  readonly role: Role | null;
  /** The role the web gives the element where it is a landmark or otherwise outside version 1's set. */
  readonly webRole?: Role;
  readonly summary: string;
  readonly props: Readonly<Record<string, PropSpecification>>;
  readonly events: Readonly<Record<string, EventSpecification>>;
  readonly content: Content;
  readonly accessibleName: AccessibleName;
  readonly keyboard: ReadonlyArray<KeyRow>;
  /**
   * Whether an early press of the control (before the application has started) may be replayed once it has: `safe` (the default for a control that changes only what the application holds),
   * or `never` (the control is not idempotent). Declared here as the control's default; the per-use choice and the early-input shell that reads it are WP8 (decision H9).
   */
  readonly replay?: "safe" | "never";
  /** ARIA state or property to the prop that supplies it. */
  readonly states?: Readonly<Record<string, string>>;
  /** Props that refer to another node: `describedby` is a `ref` (decision A6). */
  readonly relations?: Readonly<Record<string, "ref">>;
  /** A live region's settings (decision A13). */
  readonly live?: {
    readonly politeness: "polite" | "assertive";
    readonly atomic: boolean;
  };
  /** The primitives this one must be inside (a list item is in a list). */
  readonly within?: ReadonlyArray<string>;
  readonly example: Example;
}

// ---- the web's realization ------------------------------------------------------------------------------------------------------------------------------------------------------------

export type PropRealization =
  | {
      readonly kind: "attribute" | "text-property" | "controlled" | "boolean-attribute" | "controlled-boolean";
      readonly name: string;
      readonly optional?: boolean;
    }
  | {
      readonly kind: "property";
      readonly name: string;
      readonly holds: "boolean" | "number" | "value";
      readonly optional?: boolean;
    };

export interface EventRealization {
  readonly type: string;
  /** The payload's kind and the extractor that builds it (`checked`: the element's `checked`; `value`: its `value`; `notPressed`: the opposite of its `aria-pressed`). */
  readonly payload?: {
    readonly kind: "string" | "number" | "boolean";
    readonly of: "checked" | "value";
  };
  readonly key?: string;
}

export interface WebRealization {
  /** The specification this tag realizes. */
  readonly primitive: string;
  readonly element: string;
  readonly attributes?: Readonly<Record<string, string>>;
  readonly props?: Readonly<Record<string, PropRealization>>;
  readonly events?: Readonly<Record<string, EventRealization>>;
  /** Portable props the tag settles itself (`olist` is a list whose `ordered` is true). */
  readonly fixed?: Readonly<Record<string, unknown>>;
  /** Portable props the web names differently (`image`'s `label` is `alt`). */
  readonly rename?: Readonly<Record<string, string>>;
}

export interface WebRealizations {
  readonly version: 1;
  readonly target: "web";
  /** Tags that were renamed (decision P7): the old tag, and the tag it is now. A template that writes the old one is told the new one. */
  readonly renamed?: Readonly<Record<string, string>>;
  readonly primitives: Readonly<Record<string, WebRealization>>;
}
