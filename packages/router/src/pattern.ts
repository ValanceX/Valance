// A route's path pattern: literal segments, `:name` parameters and a trailing `*` (or `*name`) that takes the rest. Matching is strict where a loose reading would be a hole: the whole path is
// bounded, every segment is percent-decoded once and may not hold a control character, a literal is compared exactly (case and all), and a trailing slash is the same address.
export class RouteDefinitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RouteDefinitionError";
  }
}

export type Segment = { readonly kind: "literal"; readonly value: string } | { readonly kind: "param"; readonly name: string } | { readonly kind: "rest"; readonly name: string };

export interface Pattern {
  readonly source: string;
  readonly segments: ReadonlyArray<Segment>;
  /** The names a match fills, in order. */
  readonly names: ReadonlyArray<string>;
  /** How specific it is, segment by segment (literal 3, parameter 2, rest 1), for ranking. */
  readonly score: ReadonlyArray<number>;
  /** The pattern with every parameter name removed: two routes with the same shape cannot be told apart. */
  readonly shape: string;
}

/** Limits on what is matched, so a hostile address costs a bounded amount. */
export const LIMITS = { path: 2048, segments: 32, segment: 512, queryKeys: 64, queryValue: 2048 } as const;

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const parsePattern = (source: string): Pattern => {
  if (!source.startsWith("/") || source.includes("//") || (source.length > 1 && source.endsWith("/"))) {
    throw new RouteDefinitionError(`the path "${source}" must start with "/", hold no empty segment and not end with "/" (the root is "/")`);
  }

  const parts = source === "/" ? [] : source.slice(1).split("/");
  const segments: Array<Segment> = [];
  const names = new Set<string>();

  parts.forEach((part, at) => {
    if (part.startsWith(":")) {
      const name = part.slice(1);

      if (!NAME.test(name) || names.has(name)) {
        throw new RouteDefinitionError(`the path "${source}" has a parameter ":${name}" that is not a name or is used twice`);
      }

      names.add(name);
      segments.push({ kind: "param", name });
    } else if (part.startsWith("*")) {
      const name = part.length === 1 ? "rest" : part.slice(1);

      if (at !== parts.length - 1 || !NAME.test(name) || names.has(name)) {
        throw new RouteDefinitionError(`the path "${source}" may end with "*" or "*name" and nowhere else, and the name must be new`);
      }

      names.add(name);
      segments.push({ kind: "rest", name });
    } else if (part === "" || /[:*?#\s]/.test(part)) {
      throw new RouteDefinitionError(`the path "${source}" has a segment "${part}" that is empty or holds one of : * ? # or a space (write a parameter as ":name")`);
    } else {
      segments.push({ kind: "literal", value: part });
    }
  });

  return {
    source,
    segments,
    names: [...names],
    score: segments.map((segment) => (segment.kind === "literal" ? 3 : segment.kind === "param" ? 2 : 1)),
    shape: `/${segments.map((segment) => (segment.kind === "literal" ? segment.value : segment.kind === "param" ? ":" : "*")).join("/")}`,
  };
};

/** Higher first: compare segment by segment, then the longer pattern. */
export const bySpecificity = (a: Pattern, b: Pattern): number => {
  for (let at = 0; at < Math.max(a.score.length, b.score.length); at += 1) {
    const difference = (b.score[at] ?? 0) - (a.score[at] ?? 0);

    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
};

// oxlint-disable-next-line no-control-regex -- refusing control characters in an address is the point
const CONTROL = /[\u0000-\u001f\u007f]/;

const decode = (segment: string): string | undefined => {
  try {
    const value = decodeURIComponent(segment);

    return CONTROL.test(value) ? undefined : value;
  } catch {
    return undefined;
  }
};

/** The path's segments decoded once, or `undefined` for a path that is not an address this router would read. */
export const segmentsOf = (pathname: string): ReadonlyArray<string> | undefined => {
  if (!pathname.startsWith("/") || pathname.includes("//") || pathname.length > LIMITS.path) {
    return undefined;
  }

  const trimmed = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  const raw = trimmed === "/" ? [] : trimmed.slice(1).split("/");

  if (raw.length > LIMITS.segments || raw.some((part) => part === "" || part.length > LIMITS.segment)) {
    return undefined;
  }

  const decoded = raw.map(decode);

  return decoded.every((part): part is string => part !== undefined) ? decoded : undefined;
};

/** The values the pattern takes from the segments (as strings, for a Schema to decode), or `undefined` when it does not match. */
export const matchSegments = (pattern: Pattern, segments: ReadonlyArray<string>): Readonly<Record<string, string>> | undefined => {
  const values: Record<string, string> = Object.create(null) as Record<string, string>;
  const last = pattern.segments[pattern.segments.length - 1];
  const rest = last?.kind === "rest";

  if (rest ? segments.length < pattern.segments.length : segments.length !== pattern.segments.length) {
    return undefined;
  }

  for (const [at, segment] of pattern.segments.entries()) {
    if (segment.kind === "literal") {
      if (segments[at] !== segment.value) {
        return undefined;
      }
    } else if (segment.kind === "param") {
      values[segment.name] = segments[at]!;
    } else {
      values[segment.name] = segments.slice(at).join("/");
    }
  }

  return values;
};

/** The path for `values` (strings), each piece percent-encoded. A missing or empty value is an error: a path with a hole is not an address. */
export const buildPath = (pattern: Pattern, values: Readonly<Record<string, string>>): string => {
  if (pattern.segments.length === 0) {
    return "/";
  }

  return `/${pattern.segments
    .map((segment) => {
      if (segment.kind === "literal") {
        return encodeURIComponent(segment.value);
      }

      const value = values[segment.name];

      if (value === undefined || value === "") {
        throw new RouteDefinitionError(`the path "${pattern.source}" needs a value for "${segment.name}"`);
      }

      return segment.kind === "param" ? encodeURIComponent(value) : value.split("/").map(encodeURIComponent).join("/");
    })
    .join("/")}`;
};
