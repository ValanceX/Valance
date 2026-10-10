// Highlighting, checked with the engine VS Code itself uses (vscode-textmate with the Oniguruma regex engine) on the grammar the extension ships.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { INITIAL, Registry, parseRawGrammar } from "vscode-textmate";
import { loadWASM, OnigScanner, OnigString } from "vscode-oniguruma";

const here = (path: string): string => join(__dirname, "..", path);

const registry = (async () => {
  await loadWASM(readFileSync(join(here("node_modules"), "vscode-oniguruma", "release", "onig.wasm")).buffer as ArrayBuffer);

  return new Registry({
    onigLib: Promise.resolve({ createOnigScanner: (patterns) => new OnigScanner(patterns), createOnigString: (text) => new OnigString(text) }),
    loadGrammar: async (scope) => scope === "source.mprx" ? parseRawGrammar(readFileSync(here("syntaxes/mprx.tmLanguage.json"), "utf8"), "mprx.tmLanguage.json") : null,
  }).loadGrammar("source.mprx");
})();

/** Every token of `text` as `[text, innermost-scope-after-source.mprx...]`, and whether the grammar ended back at the top level. */
const tokenize = async (text: string) => {
  const grammar = (await registry)!;
  let state = INITIAL;
  const tokens: Array<{ readonly text: string; readonly scopes: ReadonlyArray<string> }> = [];

  for (const line of text.split("\n")) {
    const result = grammar.tokenizeLine(line, state);

    for (const token of result.tokens) { tokens.push({ text: line.slice(token.startIndex, token.endIndex), scopes: token.scopes.slice(1) }); }

    state = result.ruleStack;
  }

  return { tokens, closed: state.depth <= 1 };
};

const scopeOf = (tokens: ReadonlyArray<{ readonly text: string; readonly scopes: ReadonlyArray<string> }>, text: string, nth = 0): string => {
  const found = tokens.filter((token) => token.text === text)[nth];

  if (found === undefined) { throw new Error(`no token "${text}" in ${JSON.stringify(tokens.map((token) => token.text))}`); }

  return found.scopes.at(-1)!;
};

describe("the MPRX TextMate grammar", () => {
  it("scopes tags, attributes, strings and delimiters", async () => {
    const { tokens, closed } = await tokenize('<user-card compact="yes" label={name} />');

    expect(scopeOf(tokens, "user-card")).toBe("entity.name.tag.mprx");
    expect(scopeOf(tokens, "<")).toBe("punctuation.definition.tag.begin.mprx");
    expect(scopeOf(tokens, "/>")).toBe("punctuation.definition.tag.end.mprx");
    expect(scopeOf(tokens, "compact")).toBe("entity.other.attribute-name.mprx");
    expect(scopeOf(tokens, "yes")).toBe("string.quoted.double.mprx");
    expect(scopeOf(tokens, "label")).toBe("entity.other.attribute-name.mprx");
    expect(closed).toBe(true);
  });

  it("scopes expressions: references, members, literals, operators, commands and the event value", async () => {
    const { tokens, closed } = await tokenize('<a x={user.name} y={count + 1 > 2 ? "big" : null} on.click={save($event, true)} />');

    expect(scopeOf(tokens, "user")).toBe("variable.other.readwrite.mprx");
    expect(scopeOf(tokens, "name")).toBe("variable.other.property.mprx");
    expect(scopeOf(tokens, "1")).toBe("constant.numeric.mprx");
    expect(scopeOf(tokens, ">")).toBe("keyword.operator.mprx");
    expect(scopeOf(tokens, "?")).toBe("keyword.operator.mprx");
    expect(scopeOf(tokens, "big")).toBe("string.quoted.double.mprx");
    expect(scopeOf(tokens, "null")).toBe("constant.language.null.mprx");
    expect(scopeOf(tokens, "on")).toBe("keyword.other.event.mprx");
    expect(scopeOf(tokens, "click")).toBe("entity.other.attribute-name.event.mprx");
    expect(scopeOf(tokens, "save")).toBe("entity.name.function.mprx");
    expect(scopeOf(tokens, "$event")).toBe("variable.language.event.mprx");
    expect(scopeOf(tokens, "true")).toBe("constant.language.boolean.mprx");
    expect(closed).toBe(true);
  });

  it("scopes text interpolation and closing tags, and an object argument", async () => {
    const { tokens, closed } = await tokenize('<button on.click={save(user, { force: true })}>Save {user.name}</button>');

    expect(scopeOf(tokens, "force")).toBe("variable.other.property.mprx");
    expect(tokens.find((token) => token.text === "Save ")!.scopes).toEqual([]);                  // plain text has no scope: the theme's default
    expect(scopeOf(tokens, "name")).toBe("variable.other.property.mprx");
    expect(tokens.filter((token) => token.text === "button").map((token) => token.scopes.at(-1))).toEqual(["entity.name.tag.mprx", "entity.name.tag.mprx"]);
    expect(closed).toBe(true);
  });

  it("highlights across lines, and a string with an escaped quote", async () => {
    const { tokens, closed } = await tokenize('<page\n  title="say \\"hi\\""\n  on.close={shut()}\n>\n  text\n</page>');

    expect(tokens.filter((token) => token.scopes.at(-1) === "constant.character.escape.mprx").map((token) => token.text)).toEqual(['\\"', '\\"']);
    expect(scopeOf(tokens, "shut")).toBe("entity.name.function.mprx");
    expect(closed).toBe(true);
  });

  it("returns to the top level after every template of the example application and of the built-in kit", async () => {
    const files = [
      ...readdirSync(here("../../examples/docs-app/src")).filter((name) => name.endsWith(".mprx")).map((name) => here(`../../examples/docs-app/src/${name}`)),
      ...readdirSync(here("../../packages/app/views")).map((name) => here(`../../packages/app/views/${name}`)),
    ];

    expect(files.length).toBeGreaterThanOrEqual(10);

    for (const file of files) {
      const { tokens, closed } = await tokenize(readFileSync(file, "utf8").trimEnd());

      expect(closed, file).toBe(true);
      expect(tokens.some((token) => token.scopes.at(-1) === "entity.name.tag.mprx"), file).toBe(true);
      expect(tokens.filter((token) => token.scopes.length > 0 && token.scopes.at(-1)!.startsWith("invalid")), file).toEqual([]);
    }
  });
});
