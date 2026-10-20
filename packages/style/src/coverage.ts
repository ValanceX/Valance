// Which primitives a theme styles, and what it asks that a target does not apply. A target that cannot honor something says so here, instead of the theme silently doing less (decision S5: the Desktop
// honors the viewport and the color scheme first, and reports the rest as unsupported).
import { hookOf, type Inputs } from "./check.js";
import type { LoadedTheme } from "./types.js";

export type Target = "web" | "desktop";

export interface NotApplied {
  readonly primitive: string;
  readonly kind: "property" | "condition" | "state";
  readonly name: string;
  readonly support: "partial" | "unsupported";
  readonly note?: string;
}

export interface Coverage {
  readonly target: Target;
  /** The primitives the target has a hook for, and a recipe styles. */
  readonly styled: ReadonlyArray<string>;
  /** The primitives the target has a hook for, and no recipe styles. */
  readonly unstyled: ReadonlyArray<string>;
  readonly notApplied: ReadonlyArray<NotApplied>;
}

/** The portable-core primitives: the ones a theme must be able to style (they carry the web's hook). */
export const styleable = (inputs: Inputs): ReadonlyArray<string> =>
  Object.keys(inputs.primitives).filter((name) => hookOf(inputs, name) !== undefined && inputs.primitives[name]!.status === "portable");

export const coverageOf = (loaded: LoadedTheme, inputs: Inputs, target: Target): Coverage => {
  const recipes = new Map(loaded.recipes.map(({ recipe }) => [recipe.target.primitive, recipe]));
  const all = styleable(inputs);
  const notApplied: NotApplied[] = [];

  if (target === "desktop") {
    const note = inputs.contract.desktopNotes ?? {};

    for (const name of all) {
      const recipe = recipes.get(name);

      if (recipe === undefined) {
        continue;
      }

      const properties = new Set<string>();
      const add = (declarations: Readonly<Record<string, unknown>> | undefined): void => Object.keys(declarations ?? {}).forEach((property) => properties.add(property));

      add(recipe.base);
      Object.values(recipe.variants ?? {}).forEach((values) => Object.values(values).forEach(add));

      for (const property of properties) {
        const support = inputs.contract.properties[property]?.desktop;

        if (support !== undefined && support !== "supported") {
          notApplied.push({ primitive: name, kind: "property", name: property, support, ...(note[property] === undefined ? {} : { note: note[property] }) });
        }
      }

      for (const [state, declarations] of Object.entries(recipe.states ?? {})) {
        const support = inputs.contract.desktopStates?.[state] ?? "unsupported";

        if (support !== "supported") {
          notApplied.push({ primitive: name, kind: "state", name: state, support, ...(note["states"] === undefined ? {} : { note: note["states"] }) });
        } else {
          // a supported state still applies only the properties the Desktop honors
          for (const property of Object.keys(declarations)) {
            const propertySupport = inputs.contract.properties[property]?.desktop;

            if (propertySupport !== undefined && propertySupport !== "supported") {
              notApplied.push({ primitive: name, kind: "property", name: `${state}: ${property}`, support: propertySupport });
            }
          }
        }
      }

      for (const condition of Object.keys(recipe.when ?? {})) {
        const [kind] = condition.split(":") as [string];
        const support = inputs.contract.conditions[kind]?.desktop;

        if (support === "unsupported") {
          notApplied.push({ primitive: name, kind: "condition", name: condition, support: "unsupported" });
        }
      }
    }

    // modes the Desktop cannot choose (it has light and dark; high contrast is the person's setting, not reported to it)
    for (const mode of Object.keys(loaded.modes)) {
      const condition = inputs.contract.modeConditions?.[mode];
      const kind = condition?.split(":")[0];

      if (kind !== undefined && inputs.contract.conditions[kind]?.desktop === "unsupported") {
        notApplied.push({ primitive: "(theme)", kind: "condition", name: `mode ${mode}`, support: "unsupported" });
      }
    }
  }

  return { target, styled: all.filter((name) => recipes.has(name)), unstyled: all.filter((name) => !recipes.has(name)), notApplied };
};
