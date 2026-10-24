#!/usr/bin/env node
// The conformance report (decision A15): runs the specification verifiers and writes their results as data.
//
//   node scripts/report.mjs [--out file] [--only a,b] [--skip a,b] [--require a,b] [--port-dir path] [--check]
//   node scripts/report.mjs --sign file --maintainer "Name" --key private.pem [--date 2026-10-24]
//   node scripts/report.mjs --verify file [--require-signed]
//
// `--check` is the release gate: it exits 1 when a verifier fails, or when a required verifier did not run (a skipped one is not a pass), and 0 otherwise. The maintainer's signature is a separate
// step (`--sign`), and `--require-signed` is the gate that asks for it; while no accessibility maintainer is named the report says UNSIGNED and the first gate does not wait for it.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { buildReport, checkSignature, render, signReport } from "../dist/signing.js";
import { verify } from "../dist/verify.js";

const args = process.argv.slice(2);
const option = (name) => {
  const at = args.indexOf(name);

  return at < 0 ? undefined : args[at + 1];
};
const list = (name) => option(name)?.split(",").filter(Boolean);
const flag = (name) => args.includes(name);
const here = (path) => fileURLToPath(new URL(path, import.meta.url));

if (option("--sign") !== undefined) {
  const file = option("--sign");
  const signed = signReport(JSON.parse(readFileSync(file, "utf8")), {
    name: option("--maintainer") ?? "",
    signedOn: option("--date") ?? new Date().toISOString().slice(0, 10),
    privateKeyPem: readFileSync(option("--key"), "utf8"),
  });

  writeFileSync(file, `${JSON.stringify(signed, null, 2)}\n`);
  console.log(render(signed));
  process.exit(0);
}

if (option("--verify") !== undefined) {
  const report = JSON.parse(readFileSync(option("--verify"), "utf8"));
  const signing = checkSignature(report);

  console.log(render(report));

  if (!signing.valid) {
    process.exit(1);
  }

  process.exit(flag("--require-signed") && !signing.signed ? 1 : report.result === "pass" ? 0 : 1);
}

const git = (...a) => {
  try {
    return execFileSync("git", a, {
      cwd: here("../../.."),
      encoding: "utf8",
    }).trim();
  } catch {
    return null;
  }
};
const vectors = JSON.parse(readFileSync(here("../vectors/primitives.vectors.json"), "utf8"));
const version = JSON.parse(readFileSync(here("../../valance/package.json"), "utf8")).version;
const verifiers = await verify({ vectors, portDir: option("--port-dir") ?? process.env.PORT_DIR }, { only: list("--only"), skip: list("--skip") });
const report = buildReport(verifiers, {
  subject: { name: "valance", version, commit: git("rev-parse", "HEAD") },
  environment: {
    node: process.version,
    java:
      (() => {
        try {
          return execFileSync("java", ["-version"], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
          });
        } catch (error) {
          return String(error.stderr ?? "none");
        }
      })()
        .split("\n")[0]
        .replace(/^Picked up.*$/, "")
        .trim() || "java",
  },
  required: list("--require") ?? [],
});
const out = option("--out");

if (out !== undefined) {
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
}

console.log(render(report));
process.exit(flag("--check") && report.result !== "pass" ? 1 : 0);
