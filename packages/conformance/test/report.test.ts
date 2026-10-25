// The specification verifiers and the signed conformance report (decision A15). Each verifier is run on real output, and on a deliberately wrong input that it must find; the report is built to be
// signed by a named accessibility maintainer, says plainly that it is not while no one is named, and refuses a signature that does not hold.
import { generateKeyPairSync } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { VectorFile } from "../src/index.js";
import { buildReport, checkSignature, render, settle, signReport, verify } from "../src/index.js";

const vectors = JSON.parse(readFileSync(new URL("../vectors/primitives.vectors.json", import.meta.url), "utf8")) as VectorFile;
const script = fileURLToPath(new URL("../scripts/report.mjs", import.meta.url));
const options = {
  subject: { name: "valance", version: "0.0.0", commit: null },
  environment: { node: "test" },
  required: [],
};

describe("the verifiers", () => {
  it("each pass on the real output, and each found its deliberately wrong input (the control)", async () => {
    const results = await verify({ vectors }, { skip: ["chromium", "desktop", "replay"] });

    expect(results.map((each) => each.id)).toEqual(["html", "names", "roles", "css", "tokens", "vectors-jsdom", "vectors-terminal", "generated"]);

    for (const each of results) {
      expect(each.detail, each.id).toBeUndefined();
      expect(each.status, each.id).toBe("pass");
      expect(each.control.found, `${each.id}: ${each.control.wrong}`).toBe(true);
      expect(each.checked, each.id).toBeGreaterThan(0);
    }

    expect(results.find((each) => each.id === "tokens")!.checked).toBe(220);
  }, 120_000);

  it("a verifier whose control is not found is itself a failure: it is not running", () => {
    const broken = settle({
      id: "x",
      title: "X",
      tool: "t",
      standard: "s",
      checked: 3,
      control: { wrong: "a wrong value", found: false },
      failures: [],
    });

    expect(broken.status).toBe("fail");
    expect(broken.detail).toContain("the verifier is not running");
  });

  it("a finding is a failure that names the thing", () => {
    const failed = settle({
      id: "x",
      title: "X",
      tool: "t",
      standard: "s",
      checked: 3,
      control: { wrong: "w", found: true },
      failures: ["<input> has no accessible name"],
    });

    expect(failed).toMatchObject({
      status: "fail",
      detail: "<input> has no accessible name",
    });
  });

  it("one that cannot run here says so, and does not pass: the Desktop's tree without a checkout of its PORT, and the session logs without MESH 0.16", async () => {
    const skipped = await verify({ vectors, portDir: undefined }, { only: ["desktop", "replay"] });

    expect(skipped.find((each) => each.id === "desktop")).toMatchObject({
      status: "skipped",
    });
    expect(skipped.find((each) => each.id === "desktop")!.detail).toContain("PORT_DIR");
    expect(skipped.find((each) => each.id === "replay")!.status).toMatch(/skipped|pass/);
  });
});

describe("the report", () => {
  const passing = settle({
    id: "a",
    title: "A",
    tool: "t",
    standard: "s",
    checked: 1,
    control: { wrong: "w", found: true },
    failures: [],
  });
  const failing = settle({
    id: "b",
    title: "B",
    tool: "t",
    standard: "s",
    checked: 1,
    control: { wrong: "w", found: true },
    failures: ["bad"],
  });
  const skipped = { ...passing, id: "c", status: "skipped" as const };

  it("passes when every verifier passes, fails when one does, and fails when a required one was skipped", () => {
    expect(buildReport([passing], options).result).toBe("pass");
    expect(buildReport([passing, failing], options).result).toBe("fail");
    expect(buildReport([passing, skipped], options).result).toBe("pass");
    expect(buildReport([passing, skipped], { ...options, required: ["c"] }).result).toBe("fail");
    expect(buildReport([passing], { ...options, required: ["desktop"] }).result).toBe("fail");
  });

  it("is unsigned while no one is named, and says so where a person reads it and in the data", () => {
    const report = buildReport([passing], options);

    expect(report.accessibilityMaintainer).toEqual({
      name: null,
      signedOn: null,
    });
    expect(report.signature).toBeNull();
    expect(render(report)).toContain("UNSIGNED: no accessibility maintainer is named");
    expect(checkSignature(report)).toMatchObject({
      signed: false,
      valid: true,
      maintainer: null,
    });
  });

  it("is signed by a named maintainer, whose name and date are part of what is signed, and the signature holds", () => {
    const { privateKey } = generateKeyPairSync("ed25519");
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }) as string;
    const signed = signReport(buildReport([passing], options), {
      name: "A. Maintainer",
      signedOn: "2026-10-24",
      privateKeyPem: pem,
    });

    expect(signed.accessibilityMaintainer).toEqual({
      name: "A. Maintainer",
      signedOn: "2026-10-24",
    });
    expect(checkSignature(signed)).toMatchObject({
      signed: true,
      valid: true,
      maintainer: "A. Maintainer",
    });
    expect(render(signed)).toContain("Signed by A. Maintainer on 2026-10-24.");
    expect(render(signed)).not.toContain("UNSIGNED");
  });

  it("refuses a signature that does not hold: a report changed after it was signed, a name changed, a signature of another digest, and a signer who is not named", () => {
    const { privateKey } = generateKeyPairSync("ed25519");
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }) as string;
    const signed = signReport(buildReport([passing], options), {
      name: "A. Maintainer",
      signedOn: "2026-10-24",
      privateKeyPem: pem,
    });

    expect(checkSignature({ ...signed, result: "fail" })).toMatchObject({
      valid: false,
      problem: expect.stringContaining("changed"),
    });
    expect(
      checkSignature({
        ...signed,
        accessibilityMaintainer: {
          name: "Someone Else",
          signedOn: "2026-10-24",
        },
      }).valid,
    ).toBe(false);

    const other = signReport(buildReport([passing, failing], options), {
      name: "A. Maintainer",
      signedOn: "2026-10-24",
      privateKeyPem: pem,
    });

    expect(checkSignature({ ...signed, signature: other.signature }).valid).toBe(false);
    expect(() =>
      signReport(buildReport([passing], options), {
        name: "  ",
        signedOn: "2026-10-24",
        privateKeyPem: pem,
      }),
    ).toThrow("names the accessibility maintainer");
  });
});

describe("the release gate (--check)", () => {
  const run = (...args: string[]) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });

  it("exits 0 when the verifiers it ran pass, and 1 when a required verifier did not run", () => {
    expect(run("--check", "--only", "roles,css").status).toBe(0);

    const missing = run("--check", "--only", "roles", "--require", "desktop");

    expect(missing.status).toBe(1);
    expect(missing.stdout).toContain("FAIL");
  }, 60_000);

  it("exits 1 when a verifier fails: the same run against a project whose theme has a wrong value", () => {
    // a deliberately failing verifier: the tokens of a theme directory that does not hold the official suite's fixtures
    const failing = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `
      import { settle } from ${JSON.stringify(new URL("../dist/verify.js", import.meta.url).href)};
      import { buildReport, render } from ${JSON.stringify(new URL("../dist/signing.js", import.meta.url).href)};
      const report = buildReport([settle({ id: "x", title: "X", tool: "t", standard: "s", checked: 1, control: { wrong: "w", found: true }, failures: ["a finding"] })], { subject: { name: "v", version: "0", commit: null }, environment: {}, required: [] });
      console.log(render(report));
      process.exit(report.result === "pass" ? 0 : 1);
    `,
      ],
      { encoding: "utf8" },
    );

    expect(failing.status).toBe(1);
    expect(failing.stdout).toContain("FAIL    x");
  });

  it("verifies a written report: a changed one exits 1", () => {
    const written = spawnSync(process.execPath, [script, "--only", "roles", "--out", "/tmp/vlx-report-test.json"], { encoding: "utf8" });

    expect(written.status).toBe(0);
    expect(run("--verify", "/tmp/vlx-report-test.json").status).toBe(0);
    expect(run("--verify", "/tmp/vlx-report-test.json", "--require-signed").status).toBe(1);

    const report = JSON.parse(readFileSync("/tmp/vlx-report-test.json", "utf8")) as { result: string };

    report.result = "fail";
    spawnSync("sh", ["-c", `cat > /tmp/vlx-report-changed.json`], {
      input: JSON.stringify(report),
    });
    expect(run("--verify", "/tmp/vlx-report-changed.json").status).toBe(1);
  }, 60_000);
});
