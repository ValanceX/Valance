// The role an element has, by the two verifiers together: `dom-accessibility-api`'s `getRole` (an explicit role attribute, then the element's implicit role) and, where that has none, the element-to-role
// table of ARIA in HTML as `aria-query` has it. `generic` is no role (the elements ARIA in HTML maps to it have none to report).
import type { getRole as GetRole } from "dom-accessibility-api";
import type { elementRoles as ElementRoles } from "aria-query";

export const roleOfElement = (element: Element, verifiers: { getRole: typeof GetRole; elementRoles: typeof ElementRoles }): string => {
  const found = verifiers.getRole(element);

  if (found !== null) {
    return found;
  }

  for (const [description, names] of verifiers.elementRoles.entries()) {
    const attributes = description.attributes ?? [];
    const matches =
      description.name === element.localName &&
      attributes.every((each: { name: string; value?: string | number | undefined }) =>
        each.value === undefined ? element.hasAttribute(each.name) : element.getAttribute(each.name) === String(each.value),
      );

    if (matches) {
      return [...names][0] ?? "generic";
    }
  }

  return "generic";
};
