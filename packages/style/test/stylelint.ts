// The rules the compiled stylesheet must pass, from stylelint's own (core) rules: every property, value, at-rule, media query, pseudo-class and unit is one CSS has; no empty block, duplicate
// property or duplicate selector; and (the contract's own boundary) no selector reaches a primitive by a class, an id, an element, a universal selector or a combinator.
import stylelint from "stylelint";

export const config = {
  rules: {
    "at-rule-no-unknown": true,
    "block-no-empty": true,
    "color-no-invalid-hex": true,
    "custom-property-no-missing-var-function": true,
    "declaration-block-no-duplicate-properties": true,
    "declaration-property-value-no-unknown": true,
    "function-no-unknown": true,
    "media-feature-name-no-unknown": true,
    "media-query-no-invalid": true,
    "no-duplicate-selectors": true,
    "no-invalid-double-slash-comments": true,
    "no-invalid-position-at-import-rule": true,
    "property-no-unknown": true,
    "selector-pseudo-class-no-unknown": true,
    "selector-pseudo-element-no-unknown": true,
    "unit-no-unknown": true,
    "selector-max-class": 0,
    "selector-max-combinators": 0,
    "selector-max-id": 0,
    "selector-max-type": 0,
    "selector-max-universal": 0,
  },
};

/** The warnings stylelint gives for `css`, as `rule: text`. */
export const lint = async (css: string): Promise<string[]> => {
  const result = await stylelint.lint({ code: css, config, codeFilename: "theme.css" });

  return result.results.flatMap((each) => [...each.warnings.map((warning) => `${warning.rule}: ${warning.text}`), ...each.parseErrors.map((error) => `parse: ${error.text}`)]);
};
