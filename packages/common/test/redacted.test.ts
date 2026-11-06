// C-3: the application's state schema stays a plain struct (a TypeLiteral) whatever `persist` and the framework's fields add, so `redactedFields` finds the secrets.
import { Redacted, Schema } from "effect";
import { redactedFields } from "@valancex/valance";
import { describe, expect, it } from "vitest";

import { defineApp, field } from "../src/index.js";
import { stateSchema } from "../src/internal.js";

describe("the application's state schema and Redacted fields", () => {
  it("is still a struct with persist set, and names the secret", () => {
    const author = defineApp({
      state: { name: field(Schema.String, "a"), token: field(Schema.Redacted(Schema.String), Redacted.make("d")) },
      persist: ["name"],
    });

    expect(stateSchema(author).ast._tag).toBe("Objects");
    expect(redactedFields(stateSchema(author))).toEqual(["token"]);
  });
});
