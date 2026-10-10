// Build time, in Node: source code becomes tokens, so the page draws colour and the browser never tokenizes. Small on purpose: a few languages, each a list of rules tried in order
// at the current position; text no rule claims is `plain`. Not a parser: it colours, it does not understand (a regex is not a regex literal here).
import type { Token, TokenKind } from "../../src/model/site.js";

type Rule = readonly [TokenKind, RegExp];

const word = (words: string): RegExp => new RegExp(`(?<![\\w$.])(?:${words.split(" ").join("|")})\\b`, "y");

const SCRIPT: ReadonlyArray<Rule> = [
  ["comment", /\/\/[^\n]*|\/\*[\s\S]*?\*\//y],
  ["string", /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\[\s\S])*`/y],
  ["number", /\b\d[\d_]*(?:\.\d+)?\b/y],
  ["keyword", word("import export from as const let var function return if else for while await async new class extends interface type implements readonly yield of in typeof instanceof throw try catch finally switch case default break continue void this true false null undefined satisfies")],
  ["name", /(?<![\w$])[A-Z][A-Za-z0-9_]*/y],
  ["punctuation", /[{}()[\];,.:<>=+\-*/%!&|?]+/y],
];

const JSON_RULES: ReadonlyArray<Rule> = [
  ["name", /"(?:[^"\\\n]|\\.)*"(?=\s*:)/y],
  ["string", /"(?:[^"\\\n]|\\.)*"/y],
  ["number", /-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/y],
  ["keyword", word("true false null")],
  ["punctuation", /[{}[\],:]/y],
];

const SHELL: ReadonlyArray<Rule> = [
  ["comment", /#[^\n]*/y],
  ["string", /"(?:[^"\\\n]|\\.)*"|'[^'\n]*'/y],
  ["punctuation", /^\$ /my],
  ["attribute", /(?<=\s)--?[A-Za-z][\w-]*/y],
  ["keyword", /(?<![\w$-])(?:npm|pnpm|yarn|npx|node|git|cd|mkdir|cargo|echo)\b/y],
];

const MARKUP: ReadonlyArray<Rule> = [
  ["comment", /<!--[\s\S]*?-->/y],
  ["tag", /<\/?[A-Za-z][\w-.]*|\/?>/y],
  ["string", /"[^"\n]*"/y],
  ["attribute", /[A-Za-z][\w.:-]*(?==)/y],
  ["punctuation", /[={}]/y],
];

const LANGUAGES: Readonly<Record<string, ReadonlyArray<Rule>>> = {
  ts: SCRIPT, typescript: SCRIPT, tsx: SCRIPT, js: SCRIPT, javascript: SCRIPT, mjs: SCRIPT,
  json: JSON_RULES,
  sh: SHELL, bash: SHELL, shell: SHELL, console: SHELL,
  mprx: MARKUP, html: MARKUP, xml: MARKUP,
};

/** The languages this highlights; any other is shown as plain text. */
export const languages = (): ReadonlyArray<string> => Object.keys(LANGUAGES);

/** `source` as tokens, ids `<id>.0`, `<id>.1`, ... Adjacent text no rule claimed is one `plain` token. The tokens' texts joined are `source` exactly. */
export const highlight = (source: string, lang: string, id: string): ReadonlyArray<Token> => {
  const rules = LANGUAGES[lang.toLowerCase()];
  const tokens: Array<Token> = [];
  const push = (kind: TokenKind, text: string): void => {
    const last = tokens[tokens.length - 1];

    if (last !== undefined && last.kind === kind) {
      tokens[tokens.length - 1] = { ...last, text: last.text + text };
    } else {
      tokens.push({ id: `${id}.${tokens.length}`, kind, text });
    }
  };

  if (rules === undefined || source === "") {
    return source === "" ? [] : [{ id: `${id}.0`, kind: "plain", text: source }];
  }

  for (let at = 0; at < source.length;) {
    let matched = false;

    for (const [kind, pattern] of rules) {
      pattern.lastIndex = at;
      const found = pattern.exec(source);

      if (found !== null && found.index === at && found[0].length > 0) {
        push(kind, found[0]);
        at += found[0].length;
        matched = true;
        break;
      }
    }

    if (!matched) {
      push("plain", source[at]!);
      at += 1;
    }
  }

  // Re-id after merging, so ids are consecutive.
  return tokens.map((token, index) => ({ ...token, id: `${id}.${index}` }));
};
