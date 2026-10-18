import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { build } from "../src/build.js";
import { AppError } from "../src/diagnostics.js";
import { assertOneRuntime, runtimeCopies } from "../src/runtime-guard.js";
import { cleanup, PAGE, project } from "./fixture.js";

afterEach(cleanup);

/** A `@valancex/valance` in the project that brings a MESH runtime of its own, as one did in a plain install of the published set. */
const withSecondRuntime = (root: string, version: string): void => {
  const valance = join(root, "node_modules", "@valancex", "valance");
  const runtime = join(valance, "node_modules", "@valancex", "mesh-runtime");

  mkdirSync(runtime, { recursive: true });
  writeFileSync(join(valance, "package.json"), JSON.stringify({ name: "@valancex/valance", version: "0.13.0" }));
  writeFileSync(join(runtime, "package.json"), JSON.stringify({ name: "@valancex/mesh-runtime", version }));
};

describe("one MESH runtime in a production build (W20)", () => {
  it("is one copy in the workspace, used by the packages that import it", () => {
    const copies = runtimeCopies(project({}));

    expect(copies).toHaveLength(1);
    expect(copies[0]?.usedBy).toContain("@valancex/common");
  });

  it("finds a second copy and who uses it", () => {
    const root = project({});

    withSecondRuntime(root, "0.99.0");

    const copies = runtimeCopies(root);

    expect(copies).toHaveLength(2);
    expect(copies.find((copy) => copy.version === "0.99.0")?.usedBy).toEqual(["@valancex/valance"]);
  });

  it("refuses to build when two copies resolve, naming both with their versions, and what to do", async () => {
    const root = project({ "content/index.md": PAGE() });
    const other = runtimeCopies(root)[0]!.version;

    withSecondRuntime(root, "0.99.0");

    const failure = await build(root).then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(AppError);

    const [found] = (failure as AppError).diagnostics;

    expect(found?.code).toBe("runtime-duplicate");
    expect(found?.message).toContain(other);
    expect(found?.message).toContain("0.99.0");
    expect(found?.message).toContain("@valancex/valance");
    expect(found?.message).toContain("@valancex/common");
    expect(found?.message).toContain('"overrides": { "@valancex/mesh-runtime": "0.99.0" }');
  });

  it("builds when there is one copy", async () => {
    const root = project({ "content/index.md": PAGE() });

    expect(() => assertOneRuntime(root)).not.toThrow();
    await expect(build(root)).resolves.toBeDefined();
  });
});
