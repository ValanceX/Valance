// What Valance costs to ship, start and update, measured from the packages published on npm, so a number can be reproduced by anyone and compared between releases.
//
//   node scripts/measure-footprint.mjs [--runtime 0.13.0] [--json results.json] [--skip-browser]
//
// It installs a pinned, mutually compatible set into a temporary directory (it never touches the repository), then measures: the size of a counter application's bundle and of the WebAssembly runtime,
// how long a real browser takes to show it, what an update costs for a keyed list, and how many bytes a whole-tree update sends against the patches the runtime already computes. It also tries to
// install the latest version of every package, because "the latest of each installs" is a budget too. The browser part needs Playwright and Chromium and is skipped without them.
//
// Metrics are chosen so they can be trusted: sizes are compressed (what travels), update cost reports the least of several runs (noise only adds time), and the wire bytes are exact. Wall-clock
// numbers are for the machine that ran them; compare them only with numbers from the same machine.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import zlib from "node:zlib";

const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const RUNTIME = option("--runtime");
const JSON_OUT = option("--json");

// A set the published peer ranges accept together. Update it when the ranges move.
const PINNED = [
  "effect@3",
  "@valancex/mesh-runtime@0.12.0",
  "@valancex/mesh-compiler@0.12.0",
  "@valancex/nexus@0.12.3",
  "@valancex/valance@0.13.0",
  "@valancex/port-web@0.6.1",
  "esbuild",
];
const LATEST = ["effect@3", "@valancex/mesh-runtime", "@valancex/mesh-compiler", "@valancex/nexus", "@valancex/valance", "@valancex/port-web"];
const EXTERNAL = ["--external:node:fs/promises", "--external:node:url", "--external:node:module"];

const run = (command, commandArgs, cwd) => execFileSync(command, commandArgs, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const sizes = (bytes) => ({ raw: bytes.length, gzip: zlib.gzipSync(bytes, { level: 9 }).length, brotli: zlib.brotliCompressSync(bytes).length });
const least = async (runs, work) => {
  let best = Infinity;

  for (let i = 0; i < runs; i++) {
    const started = performance.now();

    await work();
    best = Math.min(best, performance.now() - started);
  }

  return best;
};
const median = (values) => values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)];
const workspace = (name, packages) => {
  const dir = mkdtempSync(join(tmpdir(), `valance-${name}-`));

  writeFileSync(join(dir, "package.json"), JSON.stringify({ name, private: true, type: "module" }));
  run("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error", ...packages], dir);

  return dir;
};

const results = { measuredAt: new Date().toISOString(), node: process.version, packages: PINNED };

// 1. Can the newest version of every @valancex package be installed together? npm backtracks to older versions that satisfy the peer ranges instead of failing, so the question is whether what it picks is
// the newest. (Effect is pinned to the major version the packages accept, so it is not compared.)
{
  const dir = mkdtempSync(join(tmpdir(), "valance-latest-"));

  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "latest", private: true, type: "module" }));
  run("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error", ...LATEST], dir);

  const installed = JSON.parse(run("npm", ["ls", "--depth=0", "--json"], dir)).dependencies;
  const newest = Object.fromEntries(
    LATEST.filter((spec) => spec.startsWith("@valancex/")).map((spec) => [spec.replace(/@\d.*$/, ""), run("npm", ["view", spec.replace(/@\d.*$/, ""), "version"], dir).trim()]),
  );

  results.newestInstallsTogether = {
    installed: Object.fromEntries(Object.keys(newest).map((name) => [name, installed[name]?.version])),
    newest,
    behind: Object.keys(newest).filter((name) => installed[name]?.version !== newest[name]),
  };
}

// 2. The size of a counter application, bundled for a browser.
const dir = workspace("footprint", PINNED);
const counterManifest = JSON.stringify({
  version: 1,
  types: {},
  components: {
    page: { props: {}, events: {}, commands: {}, scope: {} },
    text: { props: {}, events: {}, commands: {}, scope: {} },
    button: { props: {}, events: { click: {} }, commands: {}, scope: {} },
    counter: { props: {}, events: {}, commands: { increment: { parameters: [] } }, scope: { count: { kind: "number" } } },
  },
});

writeFileSync(
  join(dir, "build-program.mjs"),
  `import { compileProgram } from "@valancex/mesh-compiler";
import { writeFileSync } from "node:fs";
const built = await compileProgram({ model: { manifest: ${JSON.stringify(counterManifest)}, path: "components.json" }, root: "counter", components: [{ component: "counter", source: "<page><text>Count: {count}</text><button on.click={increment()}>Add one</button></page>", path: "counter.mprx" }] });
if (built.program === undefined) throw new Error(JSON.stringify(built));
writeFileSync("program.json", JSON.stringify(built.program));
`,
);
run("node", ["build-program.mjs"], dir);
writeFileSync(
  join(dir, "entry.mjs"),
  `import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import { Schema } from "effect";
import program from "./program.json" with { type: "json" };
const app = Valance.define({
  name: "counter",
  state: { schema: Schema.Struct({ count: Schema.Number }), initial: { count: 0 } },
  views: { counter: { program, scope: ({ count }) => ({ count }) } },
  view: () => "counter",
  commands: (state) => { const command = Valance.command(state); return { increment: command((current) => ({ count: current.count + 1 })) }; },
});
const primitives = { page: { element: "main" }, text: { element: "p" }, button: { element: "button", events: { click: { type: "click" } } } };
await Web.run(app, { container: document.getElementById("root"), primitives, present: "mount" });
`,
);
mkdirSync(join(dir, "out"), { recursive: true });
run(
  "npx",
  ["esbuild", "entry.mjs", "--bundle", "--minify", "--format=esm", "--platform=browser", ...EXTERNAL, "--metafile=meta.json", "--outfile=out/app.js", "--log-level=error"],
  dir,
);

const bundle = readFileSync(join(dir, "out/app.js"));
const wasmPath = join(dir, "node_modules/@valancex/mesh-runtime/dist/mesh-runtime.wasm");
const meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8"));
const byPackage = {};

for (const [file, input] of Object.entries(meta.outputs["out/app.js"].inputs)) {
  const name = file.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/)?.[1] ?? "(application)";

  byPackage[name] = (byPackage[name] ?? 0) + input.bytesInOutput;
}

results.bundle = { js: sizes(bundle), wasm: sizes(readFileSync(wasmPath)), rawBytesByPackage: byPackage };
copyFileSync(wasmPath, join(dir, "out/mesh-runtime.wasm"));
writeFileSync(join(dir, "out/index.html"), '<!doctype html><meta charset="utf-8"><div id="root"></div><script type="module" src="app.js"></script>');

// 3. How long a real browser takes to show it (optional).
if (!args.includes("--skip-browser")) {
  let playwright;

  for (const base of [import.meta.url, process.env.PLAYWRIGHT_MODULES ? `file://${process.env.PLAYWRIGHT_MODULES}/` : undefined]) {
    try {
      playwright ??= base === undefined ? undefined : createRequire(base)("playwright");
    } catch {
      // not here; try the next place
    }
  }

  if (playwright === undefined) {
    results.browser = "skipped: Playwright was not found (set PLAYWRIGHT_MODULES to a node_modules directory that has it)";
  } else {
    // Compress each file once, up front: compressing per request at maximum quality takes seconds and would be measured as the application's start-up.
    const served = new Map(["index.html", "app.js", "mesh-runtime.wasm"].map((name) => [name, zlib.brotliCompressSync(readFileSync(join(dir, "out", name)))]));
    const types = { html: "text/html", js: "text/javascript", wasm: "application/wasm" };
    const server = http
      .createServer((request, response) => {
        const name = request.url === "/" ? "index.html" : request.url.slice(1).split("?")[0];
        const body = served.get(name);

        if (body === undefined) {
          response.writeHead(404);
          response.end();

          return;
        }

        response.writeHead(200, { "content-type": types[name.split(".").pop()], "content-encoding": "br", "cache-control": "no-store" });
        response.end(body);
      })
      .listen(0);
    const browser = await playwright.chromium.launch();

    results.browser = {};

    for (const [label, rate] of [
      ["noThrottling", 1],
      ["cpu4x", 4],
    ]) {
      const first = [];
      const click = [];
      const transferred = [];

      for (let i = 0; i < 7; i++) {
        const context = await browser.newContext();
        const page = await context.newPage();
        const session = await context.newCDPSession(page);
        let bytes = 0;

        await session.send("Emulation.setCPUThrottlingRate", { rate });
        await session.send("Network.enable");
        session.on("Network.loadingFinished", (event) => {
          bytes += event.encodedDataLength;
        });
        await page.addInitScript(() => {
          window.__first = undefined;
          new MutationObserver(() => {
            if (window.__first === undefined && document.getElementById("root")?.textContent.includes("Count: 0")) window.__first = performance.now();
          }).observe(document, { childList: true, subtree: true, characterData: true });
        });
        await page.goto(`http://localhost:${server.address().port}/`);
        await page.waitForFunction(() => window.__first !== undefined);
        first.push(await page.evaluate(() => window.__first));
        click.push(
          await page.evaluate(async () => {
            const started = performance.now();

            document.querySelector("button").click();

            while (!document.getElementById("root").textContent.includes("Count: 1")) await new Promise((resolve) => setTimeout(resolve, 0));

            return performance.now() - started;
          }),
        );
        transferred.push(bytes);
        await context.close();
      }

      // Known answer: a page that never showed the count would have stalled above, so reaching here means the numbers are for the real page.
      results.browser[label] = { firstPaintMs: median(first), clickToDomMs: median(click), bytesTransferredBrotli: median(transferred) };
    }

    await browser.close();
    server.close();
  }
}

// 4. What an update costs for a keyed list, and what a whole-tree update sends against patches.
const benchDir = RUNTIME === undefined ? dir : workspace("runtime", [`@valancex/mesh-runtime@${RUNTIME}`, `@valancex/mesh-compiler@${RUNTIME}`]);
const runtime = await import(pathToFileURL(join(benchDir, "node_modules/@valancex/mesh-runtime/dist/index.js")).href);
const compiler = await import(pathToFileURL(join(benchDir, "node_modules/@valancex/mesh-compiler/dist/index.js")).href);
const MODEL = JSON.stringify({
  version: 1,
  types: {},
  components: {
    page: { props: {}, events: {}, commands: {}, scope: {} },
    row: { props: { title: { type: { kind: "string" }, required: true } }, events: {}, commands: {}, scope: {} },
    view: {
      props: {},
      events: {},
      commands: {},
      scope: {
        items: { kind: "list", element: { kind: "record", fields: { id: { type: { kind: "number" }, required: true }, label: { type: { kind: "string" }, required: true } } } },
      },
    },
  },
});
const compiled = await compiler.compile({
  source: "<page>{#each items as item (item.id)}<row title={item.label}>{item.label}</row>{/each}</page>",
  path: "view.mprx",
  model: { manifest: MODEL, path: "m.json", component: "view" },
});
const program = { root: "view", templates: [JSON.stringify(compiled.template)] };
const items = (count, changed) => ({ items: Array.from({ length: count }, (_, id) => ({ id, label: id === changed ? "changed" : `item ${id}` })) });

results.runtimeVersion = JSON.parse(readFileSync(join(benchDir, "node_modules/@valancex/mesh-runtime/package.json"), "utf8")).version;
results.update = {};
results.wire = {};

for (const count of [1000, 10000]) {
  const base = items(count);
  const edited = items(count, Math.floor(count / 2));
  const fullMs = await least(10, () => runtime.render({ program, model: MODEL, snapshot: edited }));
  let { render: current } = await runtime.render({ program, model: MODEL, snapshot: base });
  let flip = false;
  const updateMs = await least(15, async () => {
    flip = !flip;

    const next = await runtime.update(current, flip ? edited : base);

    current.release();
    current = next.render;
  });

  current.release();

  let { render: kept } = await runtime.render({ program, model: MODEL, snapshot: base });
  let toggled = false;
  const changesMs = await least(15, async () => {
    toggled = !toggled;

    const next = await runtime.updateChanges(kept, {
      base: kept.version,
      changes: [{ op: "set", path: ["items", Math.floor(count / 2), "label"], value: toggled ? "changed" : `item ${Math.floor(count / 2)}` }],
    });

    kept.release();
    kept = next.render;
  });

  kept.release();
  results.update[count] = { fullRenderMs: fullMs, updateMs, updateFromChangesMs: changesMs };

  const { render: first } = await runtime.render({ program, model: MODEL, snapshot: base });
  const next = await runtime.update(first, edited);

  results.wire[count] = { wholeTreeBytes: JSON.stringify(next.render.tree).length, patchBytes: JSON.stringify(next.patches).length };
}

console.log(JSON.stringify(results, null, 2));

if (JSON_OUT !== undefined) {
  writeFileSync(JSON_OUT, JSON.stringify(results, null, 2));
  console.error(`wrote ${JSON_OUT}`);
}
