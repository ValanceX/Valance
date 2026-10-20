// The checks of a loaded theme that need the primitives' specifications: a recipe names a part, state, variant, property and token that exist, a value has the type the property takes, a focus indicator
// is not removed, and the contrast of the declared pairs. Each is an error with a code, the file and a path into it; a suggestion where a near name exists.
import { toRgb, type DtcgColor } from "./color.js";
import { composite, ratio } from "./contrast.js";
import { loadContract } from "./load.js";
import { primitives } from "./primitives.js";
import { didYouMean } from "./suggest.js";
import type { Accepts, Contract, Declarations, LoadedTheme, PrimitiveInfo, Problem, Recipe, RecipeValue } from "./types.js";

export interface Inputs {
  readonly contract: Contract;
  readonly primitives: Readonly<Record<string, PrimitiveInfo>>;
}

export const defaultInputs = (): Inputs => ({ contract: loadContract(), primitives });

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** The selector that reaches a primitive's root on the web: its hook attribute, which names the primitive and nothing about its element. Undefined where the web has no hook for it. */
export const hookOf = (inputs: Inputs, primitive: string): string | undefined => {
  const hook = inputs.primitives[primitive]?.hook;

  return hook === undefined ? undefined : `[data-vlx="${hook}"]`;
};

/** The states a recipe for `primitive` may style: the interaction states if a person acts on it, and the semantic states its specification declares. */
export const statesOf = (inputs: Inputs, primitive: string): ReadonlyArray<string> => {
  const info = inputs.primitives[primitive];

  if (info === undefined) {
    return [];
  }

  return [...(info.interactive ? Object.keys(inputs.contract.interactionStates) : []), ...info.states.filter((state) => inputs.contract.semanticStates.includes(state))];
};

/** Whether `path` is a token of type `type` in every mode; the message of the first mode that is not. */
const tokenProblem = (modes: LoadedTheme["modes"], path: string, types: ReadonlyArray<string>): string | undefined => {
  for (const [mode, tokens] of Object.entries(modes)) {
    const token = tokens.get(path);

    if (token === undefined) {
      const near = didYouMean(
        path,
        [...tokens.keys()].filter((each) => types.includes(tokens.get(each)!.type)),
      );

      return `${path} is not a token${Object.keys(modes).length > 1 ? ` in the ${mode} mode` : ""}${near}`;
    }

    if (!types.includes(token.type)) {
      return `${path} is a ${token.type} token, and ${types.length === 1 ? `a ${types[0]}` : `one of ${types.join(", ")}`} is needed here`;
    }
  }

  return undefined;
};

const ALIGN = ["start", "center", "end", "stretch"];

/** What is wrong with `value` as the value of a property that takes `accepts`, or undefined. */
const valueProblem = (accepts: Accepts, value: RecipeValue, property: string, modes: LoadedTheme["modes"]): string | undefined => {
  switch (accepts) {
    case "color":
      return typeof value === "string" ? tokenProblem(modes, value, ["color"]) : `${property} takes a color token`;
    case "dimension":
      return typeof value === "string" ? (value === "0" ? undefined : tokenProblem(modes, value, ["dimension"])) : `${property} takes a dimension token`;
    case "space-list": {
      const list = typeof value === "string" ? [value] : Array.isArray(value) ? (value as ReadonlyArray<string>) : undefined;

      if (list === undefined) {
        return `${property} takes a dimension token, or one to four of them`;
      }

      for (const each of list) {
        const problem = each === "0" ? undefined : tokenProblem(modes, each, ["dimension"]);

        if (problem !== undefined) {
          return problem;
        }
      }

      return undefined;
    }
    case "stroke": {
      if (value === "none") {
        return undefined;
      }

      if (!isObject(value) || typeof value["width"] !== "string" || typeof value["color"] !== "string") {
        return `${property} takes "none" or { width, color } (a dimension token and a color token)`;
      }

      return (
        tokenProblem(modes, value["width"], ["dimension"]) ??
        tokenProblem(modes, value["color"], ["color"]) ??
        (typeof value["offset"] === "string" ? tokenProblem(modes, value["offset"], ["dimension"]) : undefined)
      );
    }
    case "typography":
      return typeof value === "string" ? tokenProblem(modes, value, ["typography"]) : `${property} takes a typography token`;
    case "shadow":
      return value === "none" ? undefined : typeof value === "string" ? tokenProblem(modes, value, ["shadow"]) : `${property} takes "none" or a shadow token`;
    case "opacity":
      return typeof value === "number" && value >= 0 && value <= 1 ? undefined : `${property} takes a number from 0 to 1`;
    case "alignment":
      return typeof value === "string" && ALIGN.includes(value)
        ? undefined
        : `${property} takes one of ${ALIGN.join(", ")}${typeof value === "string" ? didYouMean(value, ALIGN) : ""}`;
  }
};

const declarationProblems = (file: string, where: string, declarations: Declarations, inputs: Inputs, modes: LoadedTheme["modes"]): Problem[] => {
  const problems: Problem[] = [];

  for (const [property, value] of Object.entries(declarations)) {
    const definition = inputs.contract.properties[property];

    if (definition === undefined) {
      problems.push({
        file,
        path: `${where}/${property}`,
        code: "unknown-property",
        message: `${property} is not a property of the style contract${didYouMean(property, Object.keys(inputs.contract.properties))}; a property outside it goes in \`escape\`, for one target`,
      });
      continue;
    }

    const problem = valueProblem(definition.accepts, value, property, modes);

    if (problem !== undefined) {
      problems.push({ file, path: `${where}/${property}`, code: problem.includes("is not a token") ? "unresolved-token" : "bad-value", message: problem });
    }
  }

  return problems;
};

const removesFocus = (declarations: Declarations | undefined): boolean => declarations !== undefined && declarations["outline"] === "none";

/** The problems in one recipe. */
export const checkRecipe = (file: string, recipe: Recipe, modes: LoadedTheme["modes"], inputs: Inputs): Problem[] => {
  const problems: Problem[] = [];
  const { primitive, part } = recipe.target;
  const info = inputs.primitives[primitive];

  if (info === undefined) {
    return [
      { file, path: "/target/primitive", code: "unknown-primitive", message: `there is no primitive "${primitive}"${didYouMean(primitive, Object.keys(inputs.primitives))}` },
    ];
  }

  if (inputs.contract.parts[part] === undefined) {
    problems.push({
      file,
      path: "/target/part",
      code: "unknown-part",
      message: `"${part}" is not a part${didYouMean(part, Object.keys(inputs.contract.parts))}; the parts are ${Object.keys(inputs.contract.parts).join(", ")}`,
    });
  }

  if (info.status === "desktop-only") {
    problems.push({ file, path: "/target/primitive", code: "not-on-the-web", message: `${primitive} is desktop-only; the web has no element for it` });
  }

  problems.push(...declarationProblems(file, "/base", recipe.base ?? {}, inputs, modes));

  for (const [variant, values] of Object.entries(recipe.variants ?? {})) {
    const definition = inputs.contract.variants[variant];

    if (definition === undefined || !info.variants.some((each) => each.name === variant)) {
      const known = info.variants.map((each) => each.name).filter((each) => inputs.contract.variants[each] !== undefined);

      problems.push({
        file,
        path: `/variants/${variant}`,
        code: "unknown-variant",
        message: `${primitive} has no variant "${variant}"${didYouMean(variant, known)}${known.length === 0 ? "; it takes none" : `; it takes ${known.join(", ")}`}`,
      });
      continue;
    }

    for (const [value, declarations] of Object.entries(values)) {
      if (!definition.values.includes(value)) {
        problems.push({
          file,
          path: `/variants/${variant}/${value}`,
          code: "unknown-variant-value",
          message: `${variant} has no value "${value}"${didYouMean(value, definition.values)}; the values are ${definition.values.join(", ")}`,
        });
      }

      problems.push(...declarationProblems(file, `/variants/${variant}/${value}`, declarations, inputs, modes));
    }
  }

  const allowed = statesOf(inputs, primitive);
  for (const [state, declarations] of Object.entries(recipe.states ?? {})) {
    if (!allowed.includes(state)) {
      problems.push({
        file,
        path: `/states/${state}`,
        code: "unknown-state",
        message: `${primitive} has no state "${state}"${didYouMean(state, allowed)}; its states are ${allowed.length === 0 ? "none" : allowed.join(", ")}`,
      });
    } else if (!(state in inputs.contract.interactionStates) && info.stateSelectors[state] === undefined) {
      problems.push({ file, path: `/states/${state}`, code: "state-unreachable", message: `the web has no selector for the state "${state}" of ${primitive}` });
    }

    problems.push(...declarationProblems(file, `/states/${state}`, declarations, inputs, modes));
  }

  for (const [condition, declarations] of Object.entries(recipe.when ?? {})) {
    const [name, value] = condition.split(":") as [string, string];
    const definition = inputs.contract.conditions[name];

    if (definition === undefined) {
      problems.push({
        file,
        path: `/when/${condition}`,
        code: "unknown-condition",
        message: `"${name}" is not a condition${didYouMean(name, Object.keys(inputs.contract.conditions))}; the conditions are ${Object.keys(inputs.contract.conditions).join(", ")}`,
      });
    } else if (!definition.values.includes(value)) {
      problems.push({
        file,
        path: `/when/${condition}`,
        code: "unknown-condition-value",
        message: `${name} has no value "${value}"${didYouMean(value, definition.values)}; the values are ${definition.values.join(", ")}`,
      });
    }

    problems.push(...declarationProblems(file, `/when/${condition}`, declarations, inputs, modes));
  }

  // A recipe that removes the focus indicator must put another in its place: it is detectable in static data.
  const focus = recipe.states?.["focus-visible"]?.["outline"];
  const replaced = isObject(focus);
  const removed =
    removesFocus(recipe.base) ||
    Object.values(recipe.variants ?? {}).some((values) => Object.values(values).some(removesFocus)) ||
    removesFocus(recipe.states?.["focus-visible"]) ||
    Object.values(recipe.when ?? {}).some(removesFocus) ||
    /outline(-style)?\s*:\s*(none|0)\b/.test(recipe.escape?.web?.css ?? "");

  if (removed && !replaced) {
    problems.push({
      file,
      path: "/states/focus-visible",
      code: "focus-removed",
      message: `${primitive}'s recipe removes the focus indicator and does not give another: set states.focus-visible.outline to a width and a color`,
    });
  }

  return problems;
};

/** The contrast of every pair a theme declares, in each mode it applies to. `ratio` is what WCAG 2.2 computes (see contrast.ts). */
export interface ContrastResult {
  readonly mode: string;
  readonly text: string;
  readonly on: string;
  readonly min: number;
  readonly ratio: number;
  readonly passes: boolean;
}

export const contrastOf = (loaded: LoadedTheme): { readonly results: ReadonlyArray<ContrastResult>; readonly problems: ReadonlyArray<Problem> } => {
  const results: ContrastResult[] = [];
  const problems: Problem[] = [];
  const file = "theme.json";

  for (const pair of loaded.theme.contrast ?? []) {
    for (const [mode, tokens] of Object.entries(loaded.modes)) {
      if (pair.modes !== undefined && !pair.modes.includes(mode)) {
        continue;
      }

      const text = tokens.get(pair.text);
      const on = tokens.get(pair.on);

      if (text?.type !== "color" || on?.type !== "color") {
        problems.push({
          file,
          path: `/contrast`,
          code: "contrast-unresolved",
          message: `${text?.type !== "color" ? pair.text : pair.on} is not a color token in the ${mode} mode`,
        });
        continue;
      }

      try {
        const surface = toRgb(on.value as DtcgColor);
        const value = ratio(composite(toRgb(text.value as DtcgColor), surface), surface);
        const passes = value + 1e-9 >= pair.min;

        results.push({ mode, text: pair.text, on: pair.on, min: pair.min, ratio: value, passes });

        if (!passes) {
          problems.push({
            file,
            path: "/contrast",
            code: "contrast-below-minimum",
            message: `${pair.text} on ${pair.on} is ${value.toFixed(2)}:1 in the ${mode} mode, below the ${pair.min}:1 the theme declares`,
          });
        }
      } catch (error) {
        problems.push({ file, path: "/contrast", code: "contrast-unsupported", message: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  return { results, problems };
};

export interface Checked {
  readonly problems: ReadonlyArray<Problem>;
  readonly contrast: ReadonlyArray<ContrastResult>;
}

/** Everything about a loaded theme that can be wrong: what loading found, each recipe, and the contrast. */
export const checkTheme = (loaded: LoadedTheme, inputs: Inputs = defaultInputs()): Checked => {
  const contrast = contrastOf(loaded);

  return {
    problems: [...loaded.problems, ...loaded.recipes.flatMap(({ file, recipe }) => checkRecipe(file, recipe, loaded.modes, inputs)), ...contrast.problems],
    contrast: contrast.results,
  };
};
