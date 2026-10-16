// A read-only outline of a template's source: the tags it writes, and the slots it places and fills. It is a scanner, not the MESH parser: it knows only where an element starts, which is enough to
// answer "which components does this template use" without compiling it (the compile needs the answer to build the model it compiles against). Expressions in `{…}`, quoted values and comments
// are skipped, so `{a <b}` or `title="<x>"` is never read as a tag.
//
// MESH owns the language, and a parser in its package is where this belongs; until that exists, this is the one place in VALANCE that looks inside a template's text.

export interface TagUse {
  /** The tag, as written: `theme-toggle`, `button`, `mesh-slot`. */
  readonly name: string;
  /** Where the `<` is, from the start of the source. */
  readonly offset: number;
}

export interface Outline {
  /** Every element written, in order, repeats included. */
  readonly tags: ReadonlyArray<TagUse>;
  /** The names of the slots the template places (`""` is the default slot). */
  readonly slots: ReadonlyArray<string>;
  /** The slots its elements fill (`<mesh-fill slot="footer">`). */
  readonly fills: ReadonlyArray<string>;
}

const NAME = /[a-z][a-z0-9-]*/y;
const LITERAL = (attribute: string) => new RegExp(`${attribute}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`);

/** The offset just past the `}` that closes the `{` at `open`; strings inside are respected. */
const afterBrace = (source: string, open: number): number => {
  let depth = 0;

  for (let at = open; at < source.length; at += 1) {
    const char = source[at];

    if (char === '"' || char === "'" || char === "`") {
      at += 1;
      while (at < source.length && source[at] !== char) {
        at += source[at] === "\\" ? 2 : 1;
      }
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}" && --depth === 0) {
      return at + 1;
    }
  }

  return source.length;
};

/** The offset of the `>` that ends the start tag whose attributes begin at `from` (quotes and `{…}` respected), or the end of the source. */
const endOfTag = (source: string, from: number): number => {
  for (let at = from; at < source.length; at += 1) {
    const char = source[at];

    if (char === '"' || char === "'") {
      at = source.indexOf(char, at + 1);
      if (at < 0) {
        return source.length;
      }
    } else if (char === "{") {
      at = afterBrace(source, at) - 1;
    } else if (char === ">") {
      return at;
    }
  }

  return source.length;
};

export const outline = (source: string): Outline => {
  const tags: Array<TagUse> = [];
  const slots: Array<string> = [];
  const fills: Array<string> = [];

  for (let at = 0; at < source.length; at += 1) {
    const char = source[at];

    if (char === "{") {
      at = afterBrace(source, at) - 1;
    } else if (char === "<" && source.startsWith("<!--", at)) {
      const end = source.indexOf("-->", at + 4);

      at = end < 0 ? source.length : end + 2;
    } else if (char === "<") {
      NAME.lastIndex = at + 1;
      const name = NAME.exec(source)?.[0];

      if (name === undefined) {
        continue;
      }

      const end = endOfTag(source, at + 1 + name.length);
      const start = source.slice(at, end);

      tags.push({ name, offset: at });

      if (name === "mesh-slot" || name === "mesh-fill") {
        const attribute = LITERAL(name === "mesh-slot" ? "name" : "slot").exec(start);

        (name === "mesh-slot" ? slots : fills).push(attribute?.[1] ?? attribute?.[2] ?? "");
      }

      // Past the tag's name: its attributes may hold `{…}`, which the next turn of the loop skips, but a `<` in a quoted value is not an element.
      at = Math.max(at, end - 1);
    }
  }

  return { tags, slots, fills };
};

/** The distinct tag names a template writes, with the offset of the first. */
export const tagsOf = (source: string): ReadonlyMap<string, number> => {
  const first = new Map<string, number>();

  for (const tag of outline(source).tags) {
    if (!first.has(tag.name)) {
      first.set(tag.name, tag.offset);
    }
  }

  return first;
};

/** The element a template starts with: its tag and the classes written as literals on it (`class="a b"`). `undefined` for a template with no element. A class built from an expression is not read. */
export const rootOf = (source: string): { readonly name: string; readonly classes: ReadonlyArray<string> } | undefined => {
  const first = outline(source).tags[0];

  if (first === undefined) {
    return undefined;
  }

  NAME.lastIndex = first.offset + 1;

  const name = NAME.exec(source)![0];
  const start = source.slice(first.offset, endOfTag(source, first.offset + 1 + name.length));
  const written = LITERAL("class").exec(start);

  return { name, classes: (written?.[1] ?? written?.[2] ?? "").split(/\s+/).filter((each) => each !== "") };
};
