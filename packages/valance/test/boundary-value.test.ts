import { describe, expect, it } from "vitest";

import type { BoundaryValue } from "../src/index.js";

describe("BoundaryValue", () => {
  it("is nameable from the package's own entry (the type of an event payload, an invoke argument's value, a history state)", () => {
    const payload: BoundaryValue = { id: "m1", tags: ["a", "b"], done: false, none: null };

    expect(payload).toEqual({ id: "m1", tags: ["a", "b"], done: false, none: null });
  });
});
