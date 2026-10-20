// The web's realization of a theme: one static stylesheet, the same on the server and in the browser, so nothing is inserted at run time and nothing differs at hydration.
//
//   @layer vlx-library, vlx-theme, vlx-app;     the layers, library first: a library's styles lose to a theme's, and a theme's to the application's own (unlayered CSS beats any layer)
//   @layer vlx-theme { … }                      the tokens as custom properties, per mode; then each recipe's rules
//
// A rule reaches a primitive only by what the contract names: its hook (`[data-vlx="button"]`), a variant's attribute (`[data-intent="primary"]`), a state's selector (`:hover`,
// `[aria-invalid="true"]`) and a media condition. Never an element, a class, or a descendant.
import { toCss, type DtcgColor } from "./color.js";
import { hookOf, statesOf, tagsOf, type Inputs } from "./check.js";
import type { Declarations, LoadedTheme, RecipeValue, ResolvedToken } from "./types.js";

const GENERIC_FAMILIES = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-serif",
  "ui-sans-serif",
  "ui-monospace",
  "ui-rounded",
  "emoji",
  "math",
  "fangsong",
]);

export const propertyName = (path: string): string => `--vlx-${path.replaceAll(".", "-")}`;

const dimension = (value: unknown): string => {
  const { value: amount, unit } = value as { value: number; unit: string };

  return `${amount}${unit}`;
};

const family = (value: unknown): string =>
  (Array.isArray(value) ? (value as string[]) : [value as string])
    .map((name) => (GENERIC_FAMILIES.has(name) || /^[A-Za-z][A-Za-z0-9-]*$/.test(name) ? name : JSON.stringify(name)))
    .join(", ");

const shadow = (value: unknown): string =>
  (Array.isArray(value) ? value : [value])
    .map((each) => {
      const s = each as { color: DtcgColor; offsetX: unknown; offsetY: unknown; blur: unknown; spread: unknown; inset?: boolean };

      return `${s.inset === true ? "inset " : ""}${dimension(s.offsetX)} ${dimension(s.offsetY)} ${dimension(s.blur)} ${dimension(s.spread)} ${toCss(s.color)}`;
    })
    .join(", ");

/** The custom properties a token is: one for most, five for a typography. */
export const propertiesOf = (token: ResolvedToken): ReadonlyArray<readonly [name: string, value: string]> => {
  const name = propertyName(token.path);

  switch (token.type) {
    case "color":
      return [[name, toCss(token.value as DtcgColor)]];
    case "dimension":
      return [[name, dimension(token.value)]];
    case "number":
      return [[name, String(token.value)]];
    case "fontWeight":
      return [[name, String(token.value)]];
    case "fontFamily":
      return [[name, family(token.value)]];
    case "duration":
      return [[name, dimension(token.value)]];
    case "shadow":
      return [[name, shadow(token.value)]];
    case "typography": {
      const t = token.value as { fontFamily: unknown; fontSize: unknown; fontWeight: unknown; letterSpacing?: unknown; lineHeight?: unknown };

      return [
        [`${name}-family`, family(t.fontFamily)],
        [`${name}-size`, dimension(t.fontSize)],
        [`${name}-weight`, String(t.fontWeight)],
        [`${name}-letter-spacing`, t.letterSpacing === undefined ? "normal" : dimension(t.letterSpacing)],
        [`${name}-line-height`, t.lineHeight === undefined ? "normal" : String(t.lineHeight)],
      ];
    }
    default:
      return [];
  }
};

const variable = (path: string): string => `var(${propertyName(path)})`;

const stroke = (value: Record<string, unknown>): string =>
  `${variable(value["width"] as string)} ${(value["style"] as string | undefined) ?? "solid"} ${variable(value["color"] as string)}`;

/** The CSS declarations of one property of the contract. */
export const declarationOf = (property: string, value: RecipeValue): ReadonlyArray<string> => {
  switch (property) {
    case "background":
      return [`background-color: ${variable(value as string)}`];
    case "text":
      return [`color: ${variable(value as string)}`];
    case "border":
      return [value === "none" ? "border: none" : `border: ${stroke(value as Record<string, unknown>)}`];
    case "radius":
      return [`border-radius: ${value === "0" ? "0" : variable(value as string)}`];
    case "padding":
      return [`padding: ${(Array.isArray(value) ? (value as string[]) : [value as string]).map((each) => (each === "0" ? "0" : variable(each))).join(" ")}`];
    case "gap":
      return [`gap: ${value === "0" ? "0" : variable(value as string)}`];
    case "min-size":
      return [`min-height: ${variable(value as string)}`, `min-width: ${variable(value as string)}`];
    case "type": {
      const name = propertyName(value as string);

      return [
        `font-family: var(${name}-family)`,
        `font-size: var(${name}-size)`,
        `font-weight: var(${name}-weight)`,
        `line-height: var(${name}-line-height)`,
        `letter-spacing: var(${name}-letter-spacing)`,
      ];
    }
    case "elevation":
      return [value === "none" ? "box-shadow: none" : `box-shadow: ${variable(value as string)}`];
    case "opacity":
      return [`opacity: ${value as number}`];
    case "outline": {
      if (value === "none") {
        return ["outline: none"];
      }

      const o = value as Record<string, unknown>;

      return [`outline: ${stroke(o)}`, ...(typeof o["offset"] === "string" ? [`outline-offset: ${variable(o["offset"])}`] : [])];
    }
    case "align":
      return [`align-items: ${value as string}`];
    default:
      throw new Error(`no CSS for the property "${property}"`);
  }
};

const declarations = (properties: Declarations): ReadonlyArray<string> => Object.entries(properties).flatMap(([property, value]) => declarationOf(property, value));

const block = (selector: string, lines: ReadonlyArray<string>, indent = "  "): string =>
  lines.length === 0 ? "" : `${indent}${selector} {\n${lines.map((line) => `${indent}  ${line};`).join("\n")}\n${indent}}\n`;

const same = (a: ResolvedToken | undefined, b: ResolvedToken | undefined): boolean => JSON.stringify(a?.value) === JSON.stringify(b?.value);

/** The stylesheet of a theme whose problems are none. */
export const compileWeb = (loaded: LoadedTheme, inputs: Inputs): string => {
  const out: string[] = [
    `/* Generated by @valancex/style from the theme "${loaded.theme.name}". Do not edit: it is rewritten whenever the theme changes. */\n`,
    "@layer vlx-library, vlx-theme, vlx-app;\n\n",
    "@layer vlx-theme {\n",
  ];
  const modes = Object.keys(loaded.modes);
  const light = loaded.modes["light"]!;

  // tokens: those that are the same in every mode once, in :root; the others per mode
  const varying = new Set([...light.keys()].filter((path) => modes.some((mode) => !same(light.get(path), loaded.modes[mode]!.get(path)))));
  const props = (tokens: ReadonlyMap<string, ResolvedToken>, only: (path: string) => boolean): ReadonlyArray<string> =>
    [...tokens.values()].filter((token) => only(token.path)).flatMap((token) => propertiesOf(token).map(([name, value]) => `${name}: ${value}`));

  out.push(block(":root", [...props(light, (path) => !varying.has(path)), ...props(light, (path) => varying.has(path))]));

  for (const mode of modes.filter((each) => each !== "light")) {
    const condition = inputs.contract.modeConditions?.[mode];

    if (condition !== undefined) {
      const [name, value] = condition.split(":") as [string, string];
      const query = inputs.contract.conditions[name]?.web?.[value];

      out.push(
        `  @media ${query} {\n${block(
          ":root",
          props(loaded.modes[mode]!, (path) => varying.has(path)),
          "    ",
        )}  }\n`,
      );
    }
  }

  for (const mode of modes) {
    out.push(
      block(
        `[data-theme="${mode}"]`,
        props(loaded.modes[mode]!, (path) => varying.has(path)),
      ),
    );
  }

  // recipes, by primitive
  for (const { recipe } of [...loaded.recipes].sort((a, b) => a.recipe.target.primitive.localeCompare(b.recipe.target.primitive))) {
    const primitive = recipe.target.primitive;
    const hook = hookOf(inputs.web, primitive);

    if (hook === undefined) {
      continue;
    }

    const tag = tagsOf(inputs.web, primitive)[0]!;
    const realization = inputs.web.primitives[tag]!;

    out.push(`\n  /* ${primitive} */\n`);
    out.push(block(hook, declarations(recipe.base ?? {})));

    for (const [variant, values] of Object.entries(recipe.variants ?? {})) {
      const attribute = realization.props?.[variant];
      const name = attribute !== undefined && "name" in attribute ? attribute.name : `data-${variant}`;
      const defaulted = inputs.contract.variants[variant]!.default;

      for (const [value, properties] of Object.entries(values)) {
        const selector = value === defaulted ? `${hook}:is([${name}="${value}"], :not([${name}]))` : `${hook}[${name}="${value}"]`;

        out.push(block(selector, declarations(properties)));
      }
    }

    const interaction = inputs.contract.interactionStates;
    const states = statesOf(inputs, primitive);
    const stateSelector = (state: string): string => interaction[state] ?? realization.style?.states?.[state] ?? "";

    for (const state of states) {
      const properties = recipe.states?.[state];

      if (properties !== undefined) {
        out.push(block(`${hook}${stateSelector(state)}`, declarations(properties)));
      }
    }

    for (const [condition, properties] of Object.entries(recipe.when ?? {})) {
      const [name, value] = condition.split(":") as [string, string];

      if (name === "target") {
        if (value === "web") {
          out.push(block(hook, declarations(properties)));
        }

        continue;
      }

      const query = inputs.contract.conditions[name]?.web?.[value];

      if (query !== undefined) {
        out.push(`  @media ${query} {\n${block(hook, declarations(properties), "    ")}  }\n`);
      }
    }

    if (recipe.escape?.web !== undefined) {
      out.push(
        block(
          hook,
          recipe.escape.web.css
            .split(";")
            .map((line) => line.trim())
            .filter((line) => line !== ""),
        ),
      );
    }
  }

  out.push("}\n");

  return out.join("").replace(/\n{3,}/g, "\n\n");
};
