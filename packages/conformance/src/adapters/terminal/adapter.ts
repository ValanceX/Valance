// The terminal PORT's adapter: the five operations over the skeleton, nothing more. This file is the measurement of decision Q3: a new PORT passes the kit with an adapter of at most 300 lines.
import type { Adapter, Observation } from "../../protocol.js";
import { Refused } from "../../protocol.js";
import type { Part } from "./port.js";
import { table, Terminal, unsupported } from "./port.js";

export const terminalAdapter = (): Adapter => {
  let reported: Array<readonly [string, unknown?]> = [];
  let terminal: Terminal | undefined;

  const drawn = (): Terminal => {
    if (terminal === undefined) throw new Error("nothing is drawn");

    return terminal;
  };
  const draw = (tree: unknown): void => {
    const next = terminal ?? new Terminal((handler, payload) => reported.push(payload === undefined ? [handler] : [handler, payload]));

    try {
      next.draw(tree as { root: Part });
    } catch (error) {
      throw new Refused("refused", error instanceof Error ? error.message : String(error));
    }

    terminal = next;
  };

  return {
    capabilities: async () => ({
      port: "port-terminal",
      version: "0.0.0",
      can: ["roles", "names"],
      unsupported,
    }),
    load: async (tree) => {
      terminal = undefined;
      reported = [];
      draw(tree);
    },
    update: async (tree) => draw(tree),
    observe: async (key): Promise<Observation | undefined> => {
      const part = drawn().parts.get(key);
      const def = part === undefined ? undefined : table[part.component];

      if (part === undefined || def === undefined) return undefined;

      const text = drawn().text(part);
      const label = part.props["label"];
      // ARIA 1.2: only a button and a heading are named by their words; a paragraph, a status and the rest have no name, or the author's
      const fromWords = def.role === "button" || def.role === "heading";
      const name = typeof label === "string" && label !== "" ? label : fromWords && text !== "" ? text : undefined;

      return {
        key,
        component: part.component,
        ...(def.role === undefined ? {} : { role: def.role }),
        ...(name === undefined ? {} : { name }),
        text,
        ...(def.act === "edit"
          ? {
              value: drawn().typed.get(key) ?? String(part.props["value"] ?? ""),
            }
          : {}),
        enabled: part.props["disabled"] !== true,
        ...(def.act === "tick" ? { checked: part.props["checked"] === true } : {}),
        ...(part.component === "toggle" ? { pressed: part.props["pressed"] === true } : {}),
        ...(typeof part.props["invalid"] === "boolean" ? { invalid: part.props["invalid"] } : {}),
        children: part.children.flatMap((child) => ("component" in child ? [child.key] : [])),
      };
    },
    interact: async (key, how) => {
      reported = [];
      drawn().act(key, how);

      return reported.splice(0);
    },
    unmount: async () => {
      terminal = undefined;
      reported = [];
    },
  };
};
