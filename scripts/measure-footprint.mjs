// What Valance costs to ship, start, update and keep in memory, measured from the packages published on npm and built the way an application is built, with `vlx build` (Vite). Anyone can reproduce a number,
// and numbers can be compared between releases.
//
//   node scripts/measure-footprint.mjs [--json results.json] [--skip-browser] [--runtime 0.13.0] [--updates 200] [--pages 20] [--docs-app examples/docs-app] [--chromium /path/to/chrome]
//
// It installs published packages into temporary directories (it never touches the repository, and never measures the working tree by accident), builds two applications with `vlx build --web`, and measures:
//
//   - the counter, one view, one number, one command: the size of what `vlx build` writes, split into JavaScript, WebAssembly and CSS, and how it behaves in a real browser (first paint, the time until a click
//     is handled, one click to the updated page, bytes transferred, and, after a fixed number of updates, the JavaScript heap and the WebAssembly memory, W18);
//   - `docs-app` (a copy of the example in this repository, built against the published packages): the same sizes, the number of chunks, and the bytes each added page costs the client (W17);
//   - what an update costs for a keyed list in the runtime, and how many bytes a whole-tree update sends against the patches the runtime already computes (these use the runtime directly, not a build);
//   - whether the newest version of every package installs together.
//
// Metrics are chosen so they can be trusted: sizes are compressed (what travels), wall-clock numbers report the least of several runs (noise only adds time) or a median, memory is taken after a forced garbage
// collection, and wire bytes are exact. Wall-clock numbers are for the machine that ran them; compare them only with numbers from the same machine, and gate on ratios. The browser part needs Playwright and
// Chromium and is skipped without them (set PLAYWRIGHT_MODULES to a node_modules directory that has `playwright` or `playwright-core`, and --chromium or CHROMIUM to the executable if Playwright's own is not installed).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import zlib from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const RUNTIME = option("--runtime", "0.13.0");
const JSON_OUT = option("--json");
const UPDATES = Number(option("--updates", "200"));
const PAGES = Number(option("--pages", "20"));
const DOCS_APP = resolve(option("--docs-app", join(here, "..", "examples", "docs-app")));
const CHROMIUM = option("--chromium", process.env.CHROMIUM);
const KEEP = args.includes("--keep");

// What an application is built with: the published tooling, at versions whose peer ranges accept each other. Update it when the ranges move.
const BUILD_WITH = ["@valancex/cli@0.13.0", "@valancex/common@0.13.0", "effect@3"];
const LATEST = ["effect@3", "@valancex/mesh-runtime", "@valancex/mesh-compiler", "@valancex/nexus", "@valancex/valance", "@valancex/port-web"];
const made = [];

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
const scratch = (name) => {
  const dir = mkdtempSync(join(tmpdir(), `valance-${name}-`));

  made.push(dir);

  return dir;
};
const workspace = (name, packages) => {
  const dir = scratch(name);

  writeFileSync(join(dir, "package.json"), JSON.stringify({ name, private: true, type: "module" }));
  run("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error", ...packages], dir);

  return dir;
};
const files = (dir, base = dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? files(join(dir, entry.name), base) : [relative(base, join(dir, entry.name))]));
const write = (dir, tree) => {
  for (const [path, text] of Object.entries(tree)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
};

const results = { measuredAt: new Date().toISOString(), node: process.version, builtWith: BUILD_WITH, bundler: "vlx build (Vite)" };

// 1. Can the newest version of every @valancex package be installed together? npm backtracks to older versions that satisfy the peer ranges instead of failing, so the question is whether what it picks is
// the newest. (Effect is pinned to the major version the packages accept, so it is not compared.)
{
  const dir = scratch("latest");

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

// 2. Two applications, built with `vlx build --web`.
const COUNTER = {
  "valance.json": JSON.stringify({ version: 1, name: "Counter" }),
  "content/index.md": "---\ntitle: Counter\ndescription: One number and one command.\n---\n\n# Counter\n",
  "src/main.ts": `import { component, defineApp, field } from "@valancex/common";
import { Schema } from "effect";
import layout from "./layout.mprx";

export default defineApp({
  layout: component(layout),
  state: { count: field(Schema.Number, 0) },
  commands: (command) => ({
    increment: command((state) => ({ ...state, count: state.count + 1 })),
  }),
});
`,
  "src/layout.mprx": `<shell class="layout" theme="light">
  <main id="content" tabindex="-1">
    <para class="count">Count: {count}</para>
    <button class="add" on.click={increment()}>Add one</button>
  </main>
</shell>
`,
};

// Installing the published set as it resolves puts two copies of `@valancex/mesh-runtime` in the tree (valance accepts 0.11 and 0.12, common brings 0.11), and a build ships both WebAssembly files and the browser
// fetches both. `DEDUPED` forces one, the 0.12.0 that `@valancex/valance` accepts, which is what a careful author gets and what the ceilings are set from.
const DEDUPED = { "@valancex/mesh-runtime": "0.12.0" };

/** A project directory with the build tooling installed, holding `tree`. */
const project = (name, tree, overrides) => {
  const dir = scratch(name);

  writeFileSync(join(dir, "package.json"), JSON.stringify({ name, private: true, type: "module", ...(overrides ? { overrides } : {}) }));
  run("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error", ...BUILD_WITH], dir);
  write(dir, tree);

  return dir;
};

/** What `vlx build --web` wrote: every asset's size, by kind, and how many chunks of JavaScript there are. */
const built = (dir) => {
  const root = join(dir, "dist", "web");
  const assets = files(join(root, "assets")).map((name) => ({ name, ...sizes(readFileSync(join(root, "assets", name))) }));
  const total = (extension) => {
    const own = assets.filter((asset) => asset.name.endsWith(extension));

    return {
      files: own.length,
      raw: own.reduce((sum, asset) => sum + asset.raw, 0),
      gzip: own.reduce((sum, asset) => sum + asset.gzip, 0),
      brotli: own.reduce((sum, asset) => sum + asset.brotli, 0),
    };
  };
  // A WebAssembly file nothing refers to is not fetched; count only the ones a script names.
  const scripts = assets.filter((asset) => asset.name.endsWith(".js")).map((asset) => readFileSync(join(root, "assets", asset.name), "utf8"));
  const referenced = assets.filter((asset) => asset.name.endsWith(".wasm") && scripts.some((script) => script.includes(asset.name)));

  return {
    js: total(".js"),
    css: total(".css"),
    wasm: {
      files: referenced.length,
      raw: referenced.reduce((sum, asset) => sum + asset.raw, 0),
      gzip: referenced.reduce((sum, asset) => sum + asset.gzip, 0),
      brotli: referenced.reduce((sum, asset) => sum + asset.brotli, 0),
    },
    wasmFilesInOutput: assets.filter((asset) => asset.name.endsWith(".wasm")).length,
    assets,
  };
};

const buildCounter = (name, overrides) => {
  const dir = project(name, COUNTER, overrides);
  const startedAt = performance.now();

  run("npx", ["vlx", "build", "--web"], dir);

  return { dir, buildSeconds: (performance.now() - startedAt) / 1000, ...built(dir) };
};
const counterBuilds = { installed: buildCounter("counter", undefined), deduped: buildCounter("counter-deduped", DEDUPED) };

results.counter = Object.fromEntries(Object.entries(counterBuilds).map(([label, { dir, ...own }]) => [label, own]));

// docs-app (deduplicated), with the repository's sources and the published tooling, then with PAGES more pages to see what a page costs the client (W17: page content is compiled into the client).
const docsTree = () => {
  const tree = {};

  for (const name of files(DOCS_APP)) {
    if (/^(node_modules|dist|\.valance|test)\//.test(name) || name === "package.json" || name.startsWith("vitest.config") || name.endsWith("README.md")) continue;

    tree[name] = readFileSync(join(DOCS_APP, name), "utf8");
  }

  return tree;
};
// Prose that differs from page to page: identical pages would compress to almost nothing and the compressed cost of a page would be a fiction (a measurement caught doing this is in the baseline).
const WORDS =
  "page text link code build state view list item title route model event value field label render tree patch keyed small fast plain static client server shell layout content theme guide start update change section heading note table cell row".split(
    " ",
  );
const prose = (seed, count) => {
  let state = seed * 2654435761 + 12345;
  const out = [];

  for (let i = 0; i < count; i++) {
    state = (state * 1103515245 + 12345) % 2147483648;
    out.push(WORDS[(state >>> 10) % WORDS.length]);
  }

  return `${out.join(" ")}.`;
};
const added = (count) =>
  Object.fromEntries(
    Array.from({ length: count }, (_, i) => [
      `content/generated/page-${String(i).padStart(3, "0")}.md`,
      `---\ntitle: Generated page ${i}\ndescription: ${prose(i, 8)}\norder: ${i + 10}\n---\n\n# Generated page ${i}\n\n${prose(i + 1000, 60)}\n\n## Section ${i}\n\n${prose(i + 2000, 60)} See [the home page](/).\n\n${prose(i + 3000, 60)}\n`,
    ]),
  );

if (existsSync(DOCS_APP)) {
  const measure = (name, extra) => {
    const dir = project(name, { ...docsTree(), ...extra }, DEDUPED);
    const startedAt = performance.now();

    run("npx", ["vlx", "build", "--web"], dir);

    return { dir, buildSeconds: (performance.now() - startedAt) / 1000, ...built(dir) };
  };
  const base = measure("docs-app", {});
  const more = measure("docs-app-more", added(PAGES));
  const pagesOf = (dir) => files(join(dir, "dist", "web")).filter((name) => name.endsWith(".html") && name !== "404.html").length;

  results.docsApp = {
    pages: pagesOf(base.dir),
    buildSeconds: base.buildSeconds,
    js: base.js,
    css: base.css,
    wasm: base.wasm,
    wasmFilesInOutput: base.wasmFilesInOutput,
    assets: base.assets,
    perAddedPage: {
      added: PAGES,
      pagesAfter: pagesOf(more.dir),
      jsRawPerPage: (more.js.raw - base.js.raw) / PAGES,
      jsBrotliPerPage: (more.js.brotli - base.js.brotli) / PAGES,
      jsGzipPerPage: (more.js.gzip - base.js.gzip) / PAGES,
      chunksBefore: base.js.files,
      chunksAfter: more.js.files,
    },
  };
} else {
  results.docsApp = `skipped: ${DOCS_APP} was not found (--docs-app)`;
}

/** The counter in a real browser: first paint, until a click is handled, one click, bytes transferred, and the memory after UPDATES updates, with and without CPU throttling. */
const measureBrowser = async (browser, root) => {
  // Compress each file once, up front: compressing per request at maximum quality takes seconds and would be measured as the application's start-up.
  const served = new Map(files(root).map((name) => [`/${name}`, zlib.brotliCompressSync(readFileSync(join(root, name)))]));
  const types = { html: "text/html", js: "text/javascript", css: "text/css", wasm: "application/wasm", svg: "image/svg+xml" };
  const server = http
    .createServer((request, response) => {
      const path = request.url.split("?")[0];
      const name = path === "/" ? "/index.html" : served.has(path) ? path : `${path.replace(/\/$/, "")}.html`;
      const body = served.get(name);

      if (body === undefined) {
        response.writeHead(404);
        response.end();

        return;
      }

      response.writeHead(200, {
        "content-type": types[name.split(".").pop()] ?? "application/octet-stream",
        "content-encoding": "br",
        "cache-control": "no-store",
        "cross-origin-opener-policy": "same-origin",
      });
      response.end(body);
    })
    .listen(0);
  const resident = (pid) => Number(readFileSync(`/proc/${pid}/status`, "utf8").match(/VmRSS:\s+(\d+)/)?.[1] ?? 0) * 1024;
  const measured = {};

  for (const [label, rate] of [
    ["noThrottling", 1],
    ["cpu4x", 4],
  ]) {
    const paint = [];
    const interactive = [];
    const click = [];
    const transferred = [];
    const heap = [];
    const wasm = [];
    const startHeap = [];
    const startWasm = [];
    const rss = [];

    for (let i = 0; i < 7; i++) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const session = await context.newCDPSession(page);
      let bytes = 0;

      await session.send("Emulation.setCPUThrottlingRate", { rate });
      await session.send("Network.enable");
      await session.send("Performance.enable");
      session.on("Network.loadingFinished", (event) => {
        bytes += event.encodedDataLength;
      });
      await page.addInitScript(() => {
        // The memory the WebAssembly runtime owns, found as it is instantiated.
        window.__memories = [];
        const remember = (instance) => {
          for (const value of Object.values(instance?.exports ?? {})) if (value instanceof WebAssembly.Memory) window.__memories.push(value);
        };
        const instantiate = WebAssembly.instantiate;
        const streaming = WebAssembly.instantiateStreaming;

        WebAssembly.instantiate = async function (...rest) {
          const result = await instantiate.apply(this, rest);

          remember(result.instance ?? result);

          return result;
        };

        if (streaming) {
          WebAssembly.instantiateStreaming = async function (...rest) {
            const result = await streaming.apply(this, rest);

            remember(result.instance);

            return result;
          };
        }

        // The page is server-rendered, so the count is there at first paint, and a click before the application has started does nothing (Bet 14). Click every 10 ms until one is handled.
        window.__interactive = undefined;
        const timer = setInterval(() => {
          const button = document.querySelector("button.add");
          const text = document.querySelector(".count")?.textContent ?? "";

          if (text.includes("Count: 1")) {
            window.__interactive = performance.now();
            clearInterval(timer);
          } else if (button) {
            button.click();
          }
        }, 10);
      });
      await page.goto(`http://localhost:${server.address().port}/`);
      // Known answer: a page that never counted would stall here instead of reporting a number.
      await page.waitForFunction(() => window.__interactive !== undefined, undefined, { timeout: 60000 });
      paint.push(await page.evaluate(() => performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? NaN));
      interactive.push(await page.evaluate(() => window.__interactive));
      click.push(
        await page.evaluate(async () => {
          const before = Number(document.querySelector(".count").textContent.replace("Count: ", ""));
          const started = performance.now();

          document.querySelector("button.add").click();

          while (document.querySelector(".count").textContent !== `Count: ${before + 1}`) await new Promise((resolve) => setTimeout(resolve, 0));

          return performance.now() - started;
        }),
      );
      transferred.push(bytes);

      // W18: the memory when the application has just started, then after a fixed number of updates.
      startHeap.push(Object.fromEntries((await session.send("Performance.getMetrics")).metrics.map((metric) => [metric.name, metric.value])).JSHeapUsedSize);
      startWasm.push(await page.evaluate(() => window.__memories.reduce((sum, memory) => sum + memory.buffer.byteLength, 0)));
      await page.evaluate(async (updates) => {
        for (let n = 0; n < updates; n++) {
          const before = document.querySelector(".count").textContent;

          document.querySelector("button.add").click();

          while (document.querySelector(".count").textContent === before) await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }, UPDATES);
      await session.send("HeapProfiler.enable");
      await session.send("HeapProfiler.collectGarbage");

      const metrics = Object.fromEntries((await session.send("Performance.getMetrics")).metrics.map((metric) => [metric.name, metric.value]));
      const processes = (await (await browser.newBrowserCDPSession()).send("SystemInfo.getProcessInfo")).processInfo;

      heap.push(metrics.JSHeapUsedSize);
      wasm.push(await page.evaluate(() => window.__memories.reduce((sum, memory) => sum + memory.buffer.byteLength, 0)));
      rss.push(Math.max(0, ...processes.filter((process) => process.type === "renderer").map((process) => resident(process.id))));
      await context.close();
    }

    measured[label] = {
      firstPaintMs: median(paint),
      interactiveAtMs: median(interactive),
      clickToDomMs: median(click),
      bytesTransferredBrotli: median(transferred),
      atStart: { jsHeapUsedBytes: median(startHeap), wasmMemoryBytes: median(startWasm) },
      afterUpdates: {
        updates: UPDATES,
        jsHeapUsedBytes: median(heap),
        jsHeapUsedRange: [Math.min(...heap), Math.max(...heap)],
        wasmMemoryBytes: median(wasm),
        wasmMemoryRange: [Math.min(...wasm), Math.max(...wasm)],
        rendererResidentBytes: median(rss),
      },
    };
  }

  server.close();

  return measured;
};

// 3. How long a real browser takes to show the counter, how long until a click is handled, and what it holds in memory after a fixed number of updates (optional).
if (!args.includes("--skip-browser")) {
  let playwright;

  for (const base of [import.meta.url, process.env.PLAYWRIGHT_MODULES ? `file://${resolve(process.env.PLAYWRIGHT_MODULES)}/` : undefined]) {
    for (const name of ["playwright", "playwright-core"]) {
      try {
        playwright ??= base === undefined ? undefined : createRequire(base)(name);
      } catch {
        // not here; try the next place
      }
    }
  }

  if (playwright === undefined) {
    results.browser = "skipped: Playwright was not found (set PLAYWRIGHT_MODULES to a node_modules directory that has it)";
  } else {
    const browser = await playwright.chromium.launch({ executablePath: CHROMIUM, args: ["--enable-precise-memory-info"] });

    results.browser = { updates: UPDATES, chromium: browser.version() };

    for (const [build, { dir }] of Object.entries(counterBuilds)) {
      results.browser[build] = await measureBrowser(browser, join(dir, "dist", "web"));
    }

    await browser.close();
  }
}

// 4. What an update costs for a keyed list, and what a whole-tree update sends against patches.
const benchDir = workspace("runtime", [`@valancex/mesh-runtime@${RUNTIME}`, `@valancex/mesh-compiler@${RUNTIME}`]);
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

if (!KEEP) {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
}
