// Every specification and the realizations are valid against their schemas, and agree with each other.
import { Ajv } from "ajv";
import { describe, expect, it } from "vitest";

import { loadSchema, loadSpecifications, loadWeb } from "../src/index.js";

const ajv = new Ajv({ allErrors: true, strict: false });
const specificationSchema = ajv.compile(loadSchema("primitive-v1.schema.json") as object);
const realizationSchema = ajv.compile(loadSchema("realization-web-v1.schema.json") as object);
const specifications = loadSpecifications();
const web = loadWeb();

describe("the specifications", () => {
  for (const [name, specification] of Object.entries(specifications)) {
    it(`${name} is a valid primitive-v1`, () => {
      expect(specificationSchema(specification), JSON.stringify(specificationSchema.errors)).toBe(true);
    });
  }

  it("a schema rejects a specification that lacks what it must have", () => {
    const { role: _role, ...broken } = specifications.button!;

    expect(specificationSchema(broken)).toBe(false);
    expect(specificationSchema({ ...specifications.button!, extra: 1 })).toBe(false);
  });
});

describe("the web realization", () => {
  it("is a valid realization-web-v1", () => {
    expect(realizationSchema(web), JSON.stringify(realizationSchema.errors)).toBe(true);
  });

  it("realizes only primitives that are specified, with portable props the specification declares", () => {
    for (const [tag, each] of Object.entries(web.primitives)) {
      const specification = specifications[each.primitive];

      expect(specification, `${tag} realizes ${each.primitive}`).toBeDefined();

      for (const name of Object.keys(each.props ?? {})) {
        const portable = Object.entries(each.rename ?? {}).find(([, renamed]) => renamed === name)?.[0] ?? name;
        const declared = specification!.props[portable];

        // a prop the specification does not declare is not allowed: a hook of the web's is declared `webOnly`
        expect(declared, `${tag}.${name} is declared by ${each.primitive}`).toBeDefined();
      }

      for (const name of Object.keys(each.events ?? {})) {
        expect(Object.keys(specification!.events), `${tag} event ${name}`).toContain(name);
      }
    }
  });

  it("realizes every portable primitive", () => {
    const realized = new Set(Object.values(web.primitives).map((each) => each.primitive));

    for (const [name, specification] of Object.entries(specifications)) {
      if (specification.status !== "desktop-only") {
        expect(realized.has(name), `${name} is realized on the web`).toBe(true);
      }
    }
  });
});
