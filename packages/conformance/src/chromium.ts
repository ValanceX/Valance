// Forced states in a real browser (decision Q10): hovering, pressing and tabbing to a node are states a person puts it in, and a stylesheet's rules for them can only be seen when the node is in them.
// Chromium's DevTools protocol forces them: `CSS.forcePseudoState` "ensures that the given node will have specified pseudo-classes whenever its style is computed by the browser".
import type { Page } from "playwright";

import type { ForcedState } from "./protocol.js";

/** The pseudo-class each forced state is. */
export const PSEUDO: Readonly<Record<ForcedState, string>> = {
  hover: "hover",
  pressed: "active",
  focus: "focus",
  "focus-visible": "focus-visible",
};

/** Forces `states` on the first element `selector` matches, until `release` is called. */
export const force = async (
  page: Page,
  selector: string,
  states: ReadonlyArray<ForcedState>,
): Promise<() => Promise<void>> => {
  const session = await page.context().newCDPSession(page);

  await session.send("DOM.enable");
  await session.send("CSS.enable");

  const { root } = (await session.send("DOM.getDocument")) as {
    root: { nodeId: number };
  };
  const { nodeId } = (await session.send("DOM.querySelector", {
    nodeId: root.nodeId,
    selector,
  })) as { nodeId: number };

  if (nodeId === 0) {
    throw new Error(`nothing matches ${selector}`);
  }

  await session.send("CSS.forcePseudoState", {
    nodeId,
    forcedPseudoClasses: states.map((state) => PSEUDO[state]),
  });

  return async () => {
    await session.send("CSS.forcePseudoState", {
      nodeId,
      forcedPseudoClasses: [],
    });
    await session.detach();
  };
};

/** The computed values of `properties` on the first element `selector` matches. */
export const computed = (
  page: Page,
  selector: string,
  properties: ReadonlyArray<string>,
): Promise<Readonly<Record<string, string>>> =>
  page.evaluate(
    ([where, names]) => {
      const style = getComputedStyle(document.querySelector(where as string)!);

      return Object.fromEntries(
        (names as string[]).map((name) => [name, style.getPropertyValue(name)]),
      );
    },
    [selector, [...properties]] as const,
  );
