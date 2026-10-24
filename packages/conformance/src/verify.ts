// The specification verifiers (decisions Q14, Q15, A15): each checks real output against the official text of a standard, not against a browser or a screen reader, and each is run on a deliberately
// wrong input too and must find it. A verifier whose control is not found is itself broken, and its result is `fail`: "the checker is running" is part of the check.
//
//   html      the HTML Standard and ARIA in HTML, by the Nu Html Checker, over the gallery page
//   names     the Accessible Name and Description Computation, by dom-accessibility-api, and the rule that a control that needs a name has one
//   roles     WAI-ARIA, by aria-query: every role is one the specification defines, and a primitive has the role its specification gives
//   css       CSS, by stylelint's core rules, over the compiled theme (and its own boundary: no class, id or element selects a primitive)
//   tokens    the Design Tokens Community Group's format, by its official JSON Schema and its 220 tests
//   vectors   the primitive vectors through each PORT: the Web PORT in jsdom and a terminal PORT in another process
//   replay    MESH's session logs, by the three routes
//   chromium  the primitive vectors through the Web PORT in a real browser
//   desktop   the Desktop's AccessKit tree, by accesskit_consumer and an invariant checker (the PORT's own tests, run where its source is)
import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { computeAccessibleName, getRole } from "dom-accessibility-api";
import { elementRoles, roles } from "aria-query";
import { JSDOM } from "jsdom";
import stylelint from "stylelint";
import { loadSpecifications } from "@valancex/primitives";
import {
  compileWeb,
  defaultInputs,
  loadTheme,
  resolveDocument,
  root as styleRoot,
  validateDocument,
} from "@valancex/style";

import { jsdomAdapter, jsdomWorld } from "./adapters/jsdom.js";
import { connect } from "./lines.js";
import type { Adapter } from "./protocol.js";
import { run } from "./run.js";
import { gallerySite } from "./site.js";
import type { VectorFile } from "./vectors.js";

export type Status = "pass" | "fail" | "skipped";

export interface Verification {
  readonly id: string;
  readonly title: string;
  /** The tool, and its version where it has one. */
  readonly tool: string;
  /** The official text the output is checked against. */
  readonly standard: string;
  readonly status: Status;
  /** How many things it looked at. */
  readonly checked: number;
  /** The deliberate wrong value, and whether the verifier found it. */
  readonly control: { readonly wrong: string; readonly found: boolean };
  readonly detail?: string;
}

export interface Context {
  /** A checkout of the Desktop PORT's repository (`valancex/port`), where its AccessKit tests are run. */
  readonly portDir?: string | undefined;
  readonly vectors: VectorFile;
}

const require_ = createRequire(import.meta.url);
/** The version of an installed package: its `package.json`, found from where its entry resolves (some packages do not export it). */
const version = (name: string): string => {
  try {
    return (
      JSON.parse(
        readFileSync(require_.resolve(`${name}/package.json`), "utf8"),
      ) as { version: string }
    ).version;
  } catch {
    // not exported: look for it from its entry
  }

  let at = dirname(require_.resolve(name));

  while (
    !existsSync(join(at, "package.json")) ||
    (
      JSON.parse(readFileSync(join(at, "package.json"), "utf8")) as {
        name?: string;
      }
    ).name !== name
  ) {
    const up = dirname(at);

    if (up === at) {
      return "unknown";
    }

    at = up;
  }

  return (
    JSON.parse(readFileSync(join(at, "package.json"), "utf8")) as {
      version: string;
    }
  ).version;
};
export const settle = (
  verification: Omit<Verification, "status"> & {
    readonly failures: ReadonlyArray<string>;
  },
): Verification => {
  const { failures, ...rest } = verification;
  const broken = !rest.control.found;

  return {
    ...rest,
    status: failures.length === 0 && !broken ? "pass" : "fail",
    ...(failures.length > 0 || broken
      ? {
          detail: [
            ...failures.slice(0, 5),
            ...(failures.length > 5
              ? [`… and ${failures.length - 5} more`]
              : []),
            ...(broken
              ? [
                  "the control (a deliberately wrong input) was NOT found: the verifier is not running",
                ]
              : []),
          ].join("; "),
        }
      : {}),
  };
};

// ---- html ---------------------------------------------------------------------------------------------------------------------------------------------------------------------

const vnu = (html: string): ReadonlyArray<string> => {
  const directory = mkdtempSync(join(tmpdir(), "vnu-report-"));
  const jar = join(
    require_.resolve("vnu-jar/package.json"),
    "..",
    "build",
    "dist",
    "vnu.jar",
  );

  try {
    writeFileSync(join(directory, "page.html"), html);

    const result = spawnSync(
      "java",
      ["-jar", jar, "--format", "json", directory],
      { encoding: "utf8" },
    );

    if (result.error !== undefined) {
      throw new Error(
        `the Nu Html Checker needs Java: ${result.error.message}`,
      );
    }

    const report = JSON.parse(
      result.stderr.slice(result.stderr.indexOf("{")),
    ) as {
      messages: Array<{ type: string; subType?: string; message: string }>;
    };

    return report.messages
      .filter((each) => (each.subType ?? each.type) === "error")
      .map((each) => each.message);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

const html = (): Verification => {
  const site = gallerySite();
  const control = vnu(
    site.html.replace("<main>", "<main><button><button>x</button></button>"),
  );

  return settle({
    id: "html",
    title: "HTML and ARIA in HTML",
    tool: `Nu Html Checker (vnu-jar ${version("vnu-jar")})`,
    standard: "HTML Standard; ARIA in HTML",
    checked: site.cells.length * site.modes.length,
    control: { wrong: "a button inside a button", found: control.length > 0 },
    failures: vnu(site.html),
  });
};

// ---- names and roles ----------------------------------------------------------------------------------------------------------------------------------------------------

const gallery = (): {
  readonly document: Document;
  readonly cells: ReturnType<typeof gallerySite>["cells"];
} => {
  const site = gallerySite();

  return { document: new JSDOM(site.html).window.document, cells: site.cells };
};

const NEEDS_NAME = new Set(["checkbox", "textbox", "radiogroup", "radio"]);

const names = (): Verification => {
  const { document, cells } = gallery();
  const specifications = loadSpecifications();
  const failures: string[] = [];
  let checked = 0;

  // every control that must be named, wherever the gallery draws it, has a name by the computation the standard defines
  for (const element of document.querySelectorAll(
    "input, [role=radiogroup], [role=radio]",
  )) {
    const role = getRole(element);

    if (role !== null && NEEDS_NAME.has(role)) {
      checked += 1;

      if (computeAccessibleName(element) === "") {
        failures.push(
          `<${element.localName}> (${role}) has no accessible name`,
        );
      }
    }
  }

  // and the name is the one the specification's rule gives
  for (const cell of cells) {
    const specification = specifications[cell.primitive]!;
    const rule = specification.accessibleName;

    if (rule.from !== "prop" || rule.prop === undefined) {
      continue;
    }

    const prop = cell.props[rule.prop];
    const element = [
      ...document.querySelectorAll(`[data-theme="light"] *`),
    ].find(
      (each) =>
        (each.getAttribute("aria-label") ?? "") === prop &&
        getRole(each) === (specification.webRole ?? specification.role),
    );

    if (typeof prop === "string" && element !== undefined) {
      checked += 1;

      if (computeAccessibleName(element) !== prop) {
        failures.push(
          `${cell.id}: the name is "${computeAccessibleName(element)}", the specification gives "${prop}"`,
        );
      }
    }
  }

  const unnamed = new JSDOM(
    `<!doctype html><body><input type="checkbox"></body>`,
  ).window.document.querySelector("input")!;

  return settle({
    id: "names",
    title: "Accessible names",
    tool: `dom-accessibility-api ${version("dom-accessibility-api")}`,
    standard:
      "Accessible Name and Description Computation 1.2; the name-presence rule of the primitive specifications",
    checked,
    control: {
      wrong: "a checkbox with no label",
      found: computeAccessibleName(unnamed) === "",
    },
    failures,
  });
};

const rolesVerifier = (): Verification => {
  const { document, cells } = gallery();
  const specifications = loadSpecifications();
  const defined = new Set(
    [...roles.keys()].filter(
      (name) =>
        !(roles.get(name) as unknown as { abstract?: boolean }).abstract,
    ),
  );
  const failures: string[] = [];
  let checked = 0;

  for (const element of document.querySelectorAll("[role]")) {
    checked += 1;

    for (const role of (element.getAttribute("role") ?? "")
      .split(/\s+/)
      .filter(Boolean)) {
      if (!defined.has(role as never)) {
        failures.push(
          `<${element.localName} role="${role}"> is not a role WAI-ARIA defines`,
        );
      }
    }
  }

  // an element a primitive draws has the role ARIA in HTML gives its element, which is the role its specification gives (aria-query's table of elements, nothing of the PORT's)
  const world = jsdomWorld();

  for (const cell of cells.filter((each) => each.dimension === "example")) {
    const expected =
      specifications[cell.primitive]!.webRole ??
      specifications[cell.primitive]!.role;
    const port = world.create(() => undefined);

    port.draw(cell.tree as never);

    const element = port.inspect(cell.key) as Element | undefined;

    if (
      expected !== null &&
      expected !== undefined &&
      expected !== "generic" &&
      element !== undefined
    ) {
      checked += 1;

      const explicit = element.getAttribute("role");
      // the most specific entry of the table that fits: `a` is generic, `a[href]` is a link; a constraint `undefined` is an attribute that is absent (an `input` with no `type` is a text box), `set` one that is present
      const matches = (each: {
        readonly name: string;
        readonly value?: string | number;
        readonly constraints?: ReadonlyArray<string>;
      }): boolean => {
        const found = element.getAttribute(each.name);

        if (each.constraints?.includes("undefined") === true) {
          return found === null;
        }

        return each.value === undefined
          ? found !== null
          : found === String(each.value);
      };
      const fits = [...elementRoles.entries()]
        .filter(
          ([description, names]) =>
            description.name === element.localName &&
            [...names].length > 0 &&
            (description.attributes ?? []).every((each) =>
              matches(each as never),
            ),
        )
        .sort(
          (left, right) =>
            (right[0].attributes?.length ?? 0) -
            (left[0].attributes?.length ?? 0),
        );
      const implicit = fits[0]?.[1];
      const found =
        explicit ?? (implicit === undefined ? undefined : [...implicit][0]);

      if (found !== expected) {
        failures.push(
          `${cell.id}: <${element.localName}> is ${String(found)}, the specification says ${expected}`,
        );
      }
    }

    port.unmount();
  }

  const bogus = new JSDOM(
    `<!doctype html><body><div role="bogus">x</div></body>`,
  ).window.document.querySelector("div")!;

  return settle({
    id: "roles",
    title: "Roles",
    tool: `aria-query ${version("aria-query")}`,
    standard: "WAI-ARIA 1.2; ARIA in HTML",
    checked,
    control: {
      wrong: 'role="bogus"',
      found: !defined.has(bogus.getAttribute("role") as never),
    },
    failures,
  });
};

// ---- css ---------------------------------------------------------------------------------------------------------------------------------------------------------------------

const CONFIG = {
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

const lint = async (css: string): Promise<string[]> => {
  const result = await stylelint.lint({
    code: css,
    config: CONFIG,
    codeFilename: "theme.css",
  });

  return result.results.flatMap((each) => [
    ...each.warnings.map((warning) => `${warning.rule}: ${warning.text}`),
    ...each.parseErrors.map((error) => `parse: ${error.text}`),
  ]);
};

const css = async (): Promise<Verification> => {
  const loaded = loadTheme(
    join(styleRoot, "themes", "default", "theme.json"),
    (path) => path,
  );
  const sheet = compileWeb(loaded, defaultInputs());

  return settle({
    id: "css",
    title: "CSS of the default theme",
    tool: `stylelint ${version("stylelint")} (core rules)`,
    standard:
      "CSS (the properties, values, at-rules and media queries CSS defines); the style contract's selector boundary",
    checked: sheet.split("\n").length,
    control: {
      wrong: "color: #zzz",
      found: (await lint("a { color: #zzz; }")).length > 0,
    },
    failures: await lint(sheet),
  });
};

// ---- tokens ------------------------------------------------------------------------------------------------------------------------------------------------------------------

const tokens = (): Verification => {
  const suite = join(styleRoot, "test", "fixtures", "dtcg-2025.10");
  const manifest = JSON.parse(
    readFileSync(join(suite, "manifest.json"), "utf8"),
  ) as { tests: Array<{ id: string; type: string; input: string }> };
  const failures: string[] = [];

  for (const { id, type, input } of manifest.tests) {
    const document = JSON.parse(
      readFileSync(join(suite, input), "utf8"),
    ) as unknown;
    const schema = validateDocument(document);
    const graph = schema.valid ? resolveDocument(document, input) : undefined;
    const again =
      graph !== undefined && graph.problems.length === 0
        ? validateDocument(graph.resolved)
        : undefined;
    const valid = schema.valid && graph!.problems.length === 0 && again!.valid;

    if (valid !== (type === "PositiveEvaluationTest")) {
      failures.push(
        `${id}: the validator says ${valid ? "valid" : "invalid"}, the suite says ${type}`,
      );
    }
  }

  return settle({
    id: "tokens",
    title: "Design tokens",
    tool: `the official JSON Schema and test suite, through Ajv (@valancex/style ${version("@valancex/style")})`,
    standard: "Design Tokens Community Group format 2025.10",
    checked: manifest.tests.length,
    control: {
      wrong: 'a dimension written as "0.5rem"',
      found: !validateDocument({ a: { $type: "dimension", $value: "0.5rem" } })
        .valid,
    },
    failures,
  });
};

// ---- vectors -----------------------------------------------------------------------------------------------------------------------------------------------------------------

const sabotaged = (adapter: Adapter): Adapter => ({
  ...adapter,
  observe: async (key) => ({ ...(await adapter.observe(key))!, enabled: true }),
});

const vectors = async (
  id: string,
  title: string,
  make: () => Promise<{ adapter: Adapter; close: () => void }>,
  context: Context,
): Promise<Verification> => {
  const live = await make();
  const wrong = await make();

  try {
    const report = await run(live.adapter, context.vectors, { adapter: id });
    const control = await run(sabotaged(wrong.adapter), context.vectors, {
      adapter: `${id}-control`,
      only: ["button"],
    });

    return settle({
      id,
      title,
      tool: "@valancex/conformance",
      standard:
        "the primitive specifications (role, name, state, keys, events), through the five-operation adapter",
      checked: report.summary.pass + report.summary.fail,
      control: {
        wrong: "a PORT that ignores `disabled`",
        found: control.results.some((each) => each.result === "fail"),
      },
      failures: report.results
        .filter((each) => each.result === "fail")
        .map((each) => `${each.primitive}/${each.case}: ${each.detail}`),
      ...{},
    });
  } finally {
    live.close();
    wrong.close();
  }
};

const terminal = async (): Promise<{ adapter: Adapter; close: () => void }> => {
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(
        new URL("../dist/adapters/terminal/main.js", import.meta.url),
      ),
    ],
    { stdio: ["pipe", "pipe", "inherit"] },
  );

  return {
    adapter: connect(child.stdout, child.stdin),
    close: () => void child.kill(),
  };
};

// ---- replay ------------------------------------------------------------------------------------------------------------------------------------------------------------------

const replayLogs = async (): Promise<Verification> => {
  const { compile } = await import("@valancex/mesh-compiler");
  const { programHash, parseLog, replay, sha256 } =
    await import("@valancex/valance/replay");
  const directory = join(
    require_.resolve("@valancex/mesh-conformance/package.json"),
    "..",
    "conformance",
    "replay",
  );

  if (!existsSync(directory)) {
    return {
      id: "replay",
      title: "Session logs",
      tool: "@valancex/valance/replay",
      standard: "MESH's session-log vectors (replay/)",
      status: "skipped",
      checked: 0,
      control: { wrong: "a log with a changed tree hash", found: false },
      detail: `the installed @valancex/mesh-conformance ${version("@valancex/mesh-conformance")} has no replay/ (MESH 0.16 publishes it)`,
    };
  }

  const model = readFileSync(join(directory, "components.json"), "utf8");
  const failures: string[] = [];
  let checked = 0;
  let control = false;

  for (const name of readdirSync(directory).filter((each) =>
    existsSync(join(directory, each, "scenario.json")),
  )) {
    const program = JSON.parse(
      readFileSync(join(directory, name, "program.json"), "utf8"),
    ) as { root: string; templates: string[] };
    const templates: string[] = [];
    const sources: string[] = [];

    for (const component of program.templates) {
      const source = readFileSync(
        join(directory, name, `${component}.mprx`),
        "utf8",
      );
      const compiled = await compile({
        source,
        path: `${component}.mprx`,
        model: { manifest: model, path: "components.json", component },
      });

      templates.push(JSON.stringify(compiled.template));
      sources.push(source);
    }

    const lines = parseLog(
      readFileSync(join(directory, name, "log.jsonl"), "utf8"),
    );
    const setup = {
      program: { root: program.root, templates },
      model,
      hashes: {
        program: await programHash(sources),
        manifest: await sha256(model),
      },
    };
    const result = await replay(lines, setup);

    checked += 1;

    if (!result.ok || !result.agree) {
      failures.push(
        `${name}: ${
          result.routes
            .filter((each) => !each.ok)
            .map((each) => `${each.route} line ${each.divergence?.line}`)
            .join(", ") || "the routes disagree"
        }`,
      );
    }

    if (!control) {
      const wrong = [...lines];
      const at = wrong.findIndex(
        (line, index) => index > 0 && line.line === "tree",
      );

      wrong[at] = { line: "tree", sha256: "0".repeat(64) };
      control = !(await replay(wrong, setup)).ok;
    }
  }

  return settle({
    id: "replay",
    title: "Session logs",
    tool: "@valancex/valance/replay",
    standard:
      "MESH's session-log vectors (replay/), by the three routes of the equivalence law",
    checked,
    control: { wrong: "a log with a changed tree hash", found: control },
    failures,
  });
};

// ---- chromium and the desktop (other processes) -----------------------------------------------------------------------------------------------------------------------------

const here = fileURLToPath(new URL("..", import.meta.url));

const chromium = (): Verification => {
  const directory = mkdtempSync(join(tmpdir(), "vlx-chromium-"));
  const outputFile = join(directory, "result.json");

  try {
    const result = spawnSync(
      "pnpm",
      [
        "exec",
        "vitest",
        "run",
        "-c",
        "vitest.browser.config.ts",
        "--reporter=json",
        `--outputFile=${outputFile}`,
      ],
      { cwd: here, encoding: "utf8", env: { ...process.env, CI: "true" } },
    );
    const parsed = existsSync(outputFile)
      ? (JSON.parse(readFileSync(outputFile, "utf8")) as {
          testResults: Array<{
            assertionResults: Array<{
              title: string;
              status: string;
              failureMessages: string[];
            }>;
          }>;
        })
      : undefined;
    const tests =
      parsed?.testResults.flatMap((each) => each.assertionResults) ?? [];
    const control = tests.find((each) =>
      each.title.includes("finds a PORT that ignores `disabled`"),
    );

    return settle({
      id: "chromium",
      title: "Primitive vectors in Chromium",
      tool: "Playwright 1.56, Chromium",
      standard:
        "the primitive specifications, with real clicks, real key presses and a real top layer",
      checked: tests.length,
      control: {
        wrong: "a PORT that ignores `disabled`",
        found: control?.status === "passed",
      },
      failures: tests
        .filter((each) => each.status !== "passed")
        .map(
          (each) =>
            `${each.title}: ${(each.failureMessages[0] ?? "").split("\n")[0]}`,
        )
        .concat(
          parsed === undefined
            ? [
                `the browser suite did not run: ${`${result.stderr}`.split("\n").slice(0, 2).join(" | ")}`,
              ]
            : [],
        ),
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

const desktop = (context: Context): Verification => {
  const skipped = (detail: string): Verification => ({
    id: "desktop",
    title: "The Desktop's accessibility tree",
    tool: "accesskit_consumer, an invariant checker",
    standard:
      "AccessKit's tree (roles, names, focus, the nodes' parents), as its own consumer reads it",
    status: "skipped",
    checked: 0,
    control: {
      wrong: "a corrupted update, an unnamed control, a heading with no level",
      found: false,
    },
    detail,
  });

  if (
    context.portDir === undefined ||
    !existsSync(join(context.portDir, "packages", "port-desktop", "Cargo.toml"))
  ) {
    return skipped(
      "no checkout of the Desktop PORT (set PORT_DIR to one): its AccessKit tests run where its source is",
    );
  }

  const result = spawnSync(
    "cargo",
    [
      "test",
      "--locked",
      "--features",
      "window",
      "--test",
      "spec_invariants",
      "--test",
      "accesskit_keys",
      "--test",
      "overlay_vectors",
      "--test",
      "accessibility",
    ],
    {
      cwd: join(context.portDir, "packages", "port-desktop"),
      encoding: "utf8",
      env: { ...process.env, CARGO_PROFILE_DEV_DEBUG: "0" },
    },
  );
  const out = `${result.stdout}${result.stderr}`;
  const passed = [...out.matchAll(/test result: ok\. (\d+) passed/g)].reduce(
    (sum, each) => sum + Number(each[1]),
    0,
  );
  const controls = [
    "corrupted_updates_are_caught",
    "a_heading_without_a_level_would_be_caught",
    "an_unnamed_control_is_reported",
    "a_dialog_with_no_name_would_be_caught",
  ];

  return settle({
    id: "desktop",
    title: "The Desktop's accessibility tree",
    tool: "accesskit_consumer 0.26, an invariant checker (valancex-port-desktop's tests)",
    standard:
      "AccessKit's tree (roles, names, focus, the nodes' parents), as its own consumer reads it",
    checked: passed,
    control: {
      wrong:
        "a corrupted update, an unnamed control, a heading with no level, a dialog with no name",
      found: controls.every((name) =>
        new RegExp(`${name} \\.\\.\\. ok`).test(out),
      ),
    },
    failures:
      result.status === 0
        ? []
        : [
            `cargo test failed: ${out
              .split("\n")
              .filter((line) => /FAILED|panicked|error/.test(line))
              .slice(0, 3)
              .join(" | ")}`,
          ],
  });
};

/** Every verifier that can run here, in order. `only` and `skip` choose by id. */
export const verify = async (
  context: Context,
  choose?: {
    readonly only?: ReadonlyArray<string>;
    readonly skip?: ReadonlyArray<string>;
  },
): Promise<ReadonlyArray<Verification>> => {
  const all: ReadonlyArray<
    readonly [string, () => Promise<Verification> | Verification]
  > = [
    ["html", html],
    ["names", names],
    ["roles", rolesVerifier],
    ["css", css],
    ["tokens", tokens],
    [
      "vectors-jsdom",
      () =>
        vectors(
          "vectors-jsdom",
          "Primitive vectors: the Web PORT in jsdom",
          async () => ({
            adapter: jsdomAdapter(version("@valancex/port-web")),
            close: () => undefined,
          }),
          context,
        ),
    ],
    [
      "vectors-terminal",
      () =>
        vectors(
          "vectors-terminal",
          "Primitive vectors: a terminal PORT in another process",
          terminal,
          context,
        ),
    ],
    ["replay", replayLogs],
    ["chromium", chromium],
    ["desktop", () => desktop(context)],
  ];
  const out: Verification[] = [];

  for (const [id, work] of all) {
    if (
      (choose?.only !== undefined && !choose.only.includes(id)) ||
      choose?.skip?.includes(id) === true
    ) {
      continue;
    }

    out.push(await work());
  }

  return out;
};
