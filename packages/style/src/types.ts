// The shapes of the style contract's data: the contract itself (style-contract-v1), a recipe (recipe-v1) and a theme (theme-v1). Tokens are Design Tokens Community Group documents (format 2025.10)
// and keep that format's shapes; what this package adds to them is a graph pass and the resolved view.

export type TokenType =
  | "color"
  | "dimension"
  | "fontFamily"
  | "fontWeight"
  | "duration"
  | "cubicBezier"
  | "number"
  | "shadow"
  | "typography"
  | "border"
  | "transition"
  | "gradient"
  | "strokeStyle";

export type Accepts = "color" | "stroke" | "dimension" | "space-list" | "typography" | "shadow" | "opacity" | "alignment";

export interface PropertyDefinition {
  readonly accepts: Accepts;
  /** The CSS properties the web compiles it to. */
  readonly web: ReadonlyArray<string>;
  /** Whether the Desktop honors it. */
  readonly desktop: "supported" | "partial" | "unsupported";
}

/** What the contract needs of a primitive; generated from the primitive's specification and the web's realization (see primitives.ts), so this package reads no specification file. */
export interface PrimitiveInfo {
  readonly status: "portable" | "web-only" | "desktop-only";
  /** A person acts on it (it has keys), so the interaction states apply. */
  readonly interactive: boolean;
  /** The semantic states its specification declares. */
  readonly states: ReadonlyArray<string>;
  /** The style variants it takes, each with the attribute the web realizes it as. */
  readonly variants: ReadonlyArray<{ readonly name: string; readonly attribute: string }>;
  /** The value of its `data-vlx` hook on the web: how a stylesheet reaches its root. Absent where the web has no hook for it. */
  readonly hook?: string;
  /** The CSS selector of each of its semantic states on the web. */
  readonly stateSelectors: Readonly<Record<string, string>>;
}

export interface Contract {
  readonly version: 1;
  readonly parts: Readonly<Record<string, string>>;
  /** Interaction states, each with the CSS pseudo-class that reaches it on the web. */
  readonly interactionStates: Readonly<Record<string, string>>;
  readonly semanticStates: ReadonlyArray<string>;
  readonly variants: Readonly<Record<string, { readonly values: ReadonlyArray<string>; readonly default: string }>>;
  readonly conditions: Readonly<Record<string, { readonly values: ReadonlyArray<string>; readonly web?: Readonly<Record<string, string>> }>>;
  readonly properties: Readonly<Record<string, PropertyDefinition>>;
  /** A mode named here is also the page's own whenever its condition holds (`dark` when the system prefers dark); any mode is reachable by `data-theme`. */
  readonly modeConditions?: Readonly<Record<string, string>>;
  readonly desktopNotes?: Readonly<Record<string, string>>;
}

/** A value in a recipe: a token path, a number, a keyword, a list of token paths, or a stroke (`width`, `color`, `style`, `offset`). */
export type RecipeValue =
  | string
  | number
  | ReadonlyArray<string>
  | { readonly width?: string; readonly color?: string; readonly style?: "solid" | "dashed" | "dotted"; readonly offset?: string };

export type Declarations = Readonly<Record<string, RecipeValue>>;

export interface Recipe {
  readonly version: 1;
  readonly target: { readonly primitive: string; readonly part: string };
  readonly base?: Declarations;
  readonly variants?: Readonly<Record<string, Readonly<Record<string, Declarations>>>>;
  readonly states?: Readonly<Record<string, Declarations>>;
  readonly when?: Readonly<Record<string, Declarations>>;
  readonly escape?: { readonly web?: { readonly css: string } };
}

export interface Theme {
  readonly version: 1;
  readonly name: string;
  /** The tokens that do not change with the mode (space, radius, type), relative to the theme file. Optional. */
  readonly base?: string;
  /** Mode name to the token document that defines the tokens that do change (relative to the theme file). `light` is the mode a page has when it asks for none. */
  readonly modes: Readonly<Record<string, string>>;
  readonly recipes: ReadonlyArray<string>;
  readonly contrast?: ReadonlyArray<{ readonly text: string; readonly on: string; readonly min: number; readonly modes?: ReadonlyArray<string> }>;
}

/** A mistake in a theme: where (a file, and a path into it when there is one), which rule, and what is wrong. The same shape `vlx` prints. */
export interface Problem {
  readonly file: string;
  readonly path?: string;
  readonly code: string;
  readonly message: string;
}

/** A token with its alias chain followed: the value is fully expanded. */
export interface ResolvedToken {
  readonly path: string;
  readonly type: TokenType;
  readonly value: unknown;
}

export interface LoadedTheme {
  readonly theme: Theme;
  /** The directory the theme file is in. */
  readonly directory: string;
  /** Mode name to its resolved tokens. */
  readonly modes: Readonly<Record<string, ReadonlyMap<string, ResolvedToken>>>;
  readonly recipes: ReadonlyArray<{ readonly file: string; readonly recipe: Recipe }>;
  readonly problems: ReadonlyArray<Problem>;
}
