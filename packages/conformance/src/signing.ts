// The conformance report (decision A15): the verifiers' results as data, regenerated for each release candidate and committed with the tag. A named accessibility maintainer signs it and can block a release;
// who that is, is an open item of the project (decision X6), so the report is built to be signed, and until it is signed it says so, in its own text and in the data: the name is empty and visible as such.
import { createPrivateKey, createPublicKey, sign as cryptoSign, verify as cryptoVerify } from "node:crypto";
import { createHash } from "node:crypto";

import type { Verification } from "./verify.js";

export interface Maintainer {
  /** The person who signed; `null` while no one is named. */
  readonly name: string | null;
  /** When they signed; `null` while no one has. */
  readonly signedOn: string | null;
}

export interface Signature {
  readonly algorithm: "ed25519";
  /** The maintainer's public key, SPKI in PEM, so the report can be checked with nothing else. */
  readonly publicKey: string;
  /** The signature of the digest, base64. */
  readonly value: string;
}

export interface ConformanceReport {
  readonly version: 1;
  readonly kind: "conformance-report";
  /** What the report is about: the release candidate. */
  readonly subject: {
    readonly name: string;
    readonly version: string;
    readonly commit: string | null;
  };
  /** The tools the verifiers ran on. */
  readonly environment: Readonly<Record<string, string>>;
  readonly verifiers: ReadonlyArray<Verification>;
  /** `pass` when no verifier failed and every required one ran. */
  readonly result: "pass" | "fail";
  /** The verifiers a release requires (a skipped one among them is a failure). */
  readonly required: ReadonlyArray<string>;
  readonly accessibilityMaintainer: Maintainer;
  /** SHA-256 of the report's compact JSON without `signature` and `digest`. */
  readonly digest: string;
  readonly signature: Signature | null;
}

/** Compact JSON with members in key order: the form a digest is taken over. */
const canonical = (value: unknown): string => {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(",")}]`;
  }

  const record = value as Record<string, unknown>;

  return `{${Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(",")}}`;
};

const digestOf = (report: Omit<ConformanceReport, "digest" | "signature">): string => createHash("sha256").update(canonical(report)).digest("hex");

export interface BuildOptions {
  readonly subject: ConformanceReport["subject"];
  readonly environment: Readonly<Record<string, string>>;
  readonly required: ReadonlyArray<string>;
}

/** Builds an unsigned report. A required verifier that was skipped, or one that failed, makes the result `fail`. */
export const buildReport = (verifiers: ReadonlyArray<Verification>, options: BuildOptions): ConformanceReport => {
  const body = {
    version: 1 as const,
    kind: "conformance-report" as const,
    subject: options.subject,
    environment: options.environment,
    verifiers,
    result: (verifiers.some((each) => each.status === "fail") || options.required.some((id) => verifiers.find((each) => each.id === id)?.status !== "pass") ? "fail" : "pass") as
      | "pass"
      | "fail",
    required: options.required,
    accessibilityMaintainer: { name: null, signedOn: null } as Maintainer,
  };

  return { ...body, digest: digestOf(body), signature: null };
};

/** Signs a report as the accessibility maintainer `name`, with their ed25519 private key (PEM). The name and the date become part of what the digest covers. */
export const signReport = (
  report: ConformanceReport,
  maintainer: {
    readonly name: string;
    readonly signedOn: string;
    readonly privateKeyPem: string;
  },
): ConformanceReport => {
  if (maintainer.name.trim() === "") {
    throw new Error("a signature names the accessibility maintainer who gives it");
  }

  const { digest: _digest, signature: _signature, ...rest } = report;
  const body = {
    ...rest,
    accessibilityMaintainer: {
      name: maintainer.name,
      signedOn: maintainer.signedOn,
    },
  };
  const digest = digestOf(body);
  const key = createPrivateKey(maintainer.privateKeyPem);
  const publicKey = createPublicKey(key).export({
    type: "spki",
    format: "pem",
  }) as string;

  return {
    ...body,
    digest,
    signature: {
      algorithm: "ed25519",
      publicKey,
      value: cryptoSign(null, Buffer.from(digest, "hex"), key).toString("base64"),
    },
  };
};

export interface Signing {
  /** Someone has signed. */
  readonly signed: boolean;
  /** The digest is the report's, and the signature is of the digest. */
  readonly valid: boolean;
  readonly maintainer: string | null;
  readonly problem?: string;
}

/** Whether a report is signed, and whether the signature holds: the digest is recomputed from the report, and the signature checked against the key the report carries. */
export const checkSignature = (report: ConformanceReport): Signing => {
  const { digest, signature, ...rest } = report;
  const recomputed = digestOf(rest);

  if (recomputed !== digest) {
    return {
      signed: signature !== null,
      valid: false,
      maintainer: report.accessibilityMaintainer.name,
      problem: "the report was changed after its digest was taken",
    };
  }

  if (signature === null) {
    return { signed: false, valid: true, maintainer: null };
  }

  const holds = cryptoVerify(null, Buffer.from(digest, "hex"), createPublicKey(signature.publicKey), Buffer.from(signature.value, "base64"));

  return {
    signed: true,
    valid: holds && report.accessibilityMaintainer.name !== null,
    maintainer: report.accessibilityMaintainer.name,
    ...(holds ? {} : { problem: "the signature is not of this digest" }),
  };
};

/** The report as text for a person. */
export const render = (report: ConformanceReport): string => {
  const signing = checkSignature(report);
  const mark = {
    pass: "pass   ",
    fail: "FAIL   ",
    skipped: "skipped",
  } as const;

  return [
    `Conformance report: ${report.subject.name} ${report.subject.version}${report.subject.commit === null ? "" : ` (${report.subject.commit.slice(0, 12)})`}: ${report.result.toUpperCase()}`,
    ...report.verifiers.map(
      (each) =>
        `  ${mark[each.status]} ${each.id.padEnd(17)} ${each.title}: ${each.checked} checked; ${each.tool}; against ${each.standard}${each.detail === undefined ? "" : `\n          ${each.detail}`}`,
    ),
    report.accessibilityMaintainer.name === null
      ? "UNSIGNED: no accessibility maintainer is named, so no one has signed this report (decisions A15 and X6)."
      : signing.valid
        ? `Signed by ${report.accessibilityMaintainer.name} on ${report.accessibilityMaintainer.signedOn}.`
        : `SIGNATURE INVALID (${signing.problem ?? "the signature does not hold"}) for ${report.accessibilityMaintainer.name}.`,
    `digest ${report.digest}`,
  ].join("\n");
};
