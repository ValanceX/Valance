// The Desktop's realization of a theme: resolved values, not references. The Desktop draws its own pixels (egui) and keeps a typed map; it is told it once, in the `appearance` message it already has.
// Colors are `#rrggbb[aa]`, lengths are points (a rem is 16), and only what the Desktop honors is in it: a property it does not apply is left out here and listed in the coverage report, so the window never
// has to guess. A mode the Desktop cannot choose (high contrast is the person's setting; the window is not told it) is left out too.
import { toRgb, type DtcgColor } from "./color.js";
import { hookOf, statesOf, type Inputs } from "./check.js";
import type { LoadedTheme, RecipeValue, ResolvedToken } from "./types.js";

export interface DesktopStyle {
  background?: string;
  text?: string;
  border?: { width: number; color: string } | "none";
  radius?: number;
  /** Top, right, bottom, left. */
  padding?: [number, number, number, number];
  gap?: number;
  minSize?: number;
  fontSize?: number;
  fontWeight?: number;
}

export interface DesktopRecipe {
  base?: DesktopStyle;
  variants?: Record<string, Record<string, DesktopStyle>>;
  states?: Record<string, DesktopStyle>;
  when?: Record<string, DesktopStyle>;
}

export interface DesktopTheme {
  readonly version: 1;
  readonly name: string;
  /** Each variant's default value (the one that applies when a template does not say). */
  readonly defaults: Record<string, string>;
  /** Mode name to primitive name to its recipe. */
  readonly modes: Record<string, Record<string, DesktopRecipe>>;
}

const byte = (value: number): string =>
  Math.round(Math.min(1, Math.max(0, value)) * 255)
    .toString(16)
    .padStart(2, "0");

const color = (token: ResolvedToken): string => {
  const rgb = toRgb(token.value as DtcgColor);

  return `#${byte(rgb.r)}${byte(rgb.g)}${byte(rgb.b)}${rgb.a === 1 ? "" : byte(rgb.a)}`;
};

const length = (token: ResolvedToken): number => {
  const { value, unit } = token.value as { value: number; unit: string };

  return unit === "rem" ? value * 16 : value;
};

const resolveStyle = (declarations: Readonly<Record<string, RecipeValue>> | undefined, tokens: ReadonlyMap<string, ResolvedToken>, inputs: Inputs): DesktopStyle => {
  const out: DesktopStyle = {};
  const token = (path: string): ResolvedToken => tokens.get(path)!;

  for (const [property, value] of Object.entries(declarations ?? {})) {
    if (inputs.contract.properties[property]?.desktop === "unsupported") {
      continue;
    }

    switch (property) {
      case "background":
        out.background = color(token(value as string));
        break;
      case "text":
        out.text = color(token(value as string));
        break;
      case "border": {
        const stroke = value as { width: string; color: string } | "none";

        out.border = stroke === "none" ? "none" : { width: length(token(stroke.width)), color: color(token(stroke.color)) };
        break;
      }
      case "radius":
        out.radius = value === "0" ? 0 : length(token(value as string));
        break;
      case "padding": {
        const list = (Array.isArray(value) ? (value as string[]) : [value as string]).map((each) => (each === "0" ? 0 : length(token(each))));
        const [a = 0, b = a, c = a, d = b] = list;

        out.padding = [a, b, c, d];
        break;
      }
      case "gap":
        out.gap = value === "0" ? 0 : length(token(value as string));
        break;
      case "min-size":
        out.minSize = length(token(value as string));
        break;
      case "type": {
        const type = token(value as string).value as { fontSize: { value: number; unit: string }; fontWeight: number | string };

        out.fontSize = type.fontSize.unit === "rem" ? type.fontSize.value * 16 : type.fontSize.value;

        if (typeof type.fontWeight === "number") {
          out.fontWeight = type.fontWeight;
        }

        break;
      }
      default:
        break;
    }
  }

  return out;
};

/** The theme as the Desktop is told it. */
export const resolveForDesktop = (loaded: LoadedTheme, inputs: Inputs): DesktopTheme => {
  const modes: DesktopTheme["modes"] = {};

  for (const [mode, tokens] of Object.entries(loaded.modes)) {
    const condition = inputs.contract.modeConditions?.[mode];
    const kind = condition?.split(":")[0];

    if (kind !== undefined && inputs.contract.conditions[kind]?.desktop === "unsupported") {
      continue;
    }

    const recipes: Record<string, DesktopRecipe> = {};

    for (const { recipe } of loaded.recipes) {
      const primitive = recipe.target.primitive;

      if (hookOf(inputs, primitive) === undefined) {
        continue;
      }

      const out: DesktopRecipe = {};
      const base = resolveStyle(recipe.base, tokens, inputs);

      // `target:desktop` is the Desktop's own refinement of the base; `target:web` is not for it
      Object.assign(base, resolveStyle(recipe.when?.["target:desktop"], tokens, inputs));
      out.base = base;

      for (const [variant, values] of Object.entries(recipe.variants ?? {})) {
        out.variants = {
          ...out.variants,
          [variant]: Object.fromEntries(Object.entries(values).map(([value, declarations]) => [value, resolveStyle(declarations, tokens, inputs)])),
        };
      }

      for (const state of statesOf(inputs, primitive)) {
        const style = inputs.contract.desktopStates?.[state] === "supported" ? resolveStyle(recipe.states?.[state], tokens, inputs) : {};

        if (Object.keys(style).length > 0) {
          out.states = { ...out.states, [state]: style };
        }
      }

      for (const [condition, declarations] of Object.entries(recipe.when ?? {})) {
        if (condition.startsWith("viewport:")) {
          out.when = { ...out.when, [condition]: resolveStyle(declarations, tokens, inputs) };
        }
      }

      recipes[primitive] = out;
    }

    modes[mode] = recipes;
  }

  return {
    version: 1,
    name: loaded.theme.name,
    defaults: Object.fromEntries(Object.entries(inputs.contract.variants).map(([name, definition]) => [name, definition.default])),
    modes,
  };
};
