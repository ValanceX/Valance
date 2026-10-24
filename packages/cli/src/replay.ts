// `vlx replay <log>`: plays a session log (recorded by `vlx dev --record`, or one of MESH's conformance logs) against the project's own templates, by the three routes of the equivalence law,
// and says where the first differs from the log. It runs no command and reads no clock: a log is a bug report a machine can run. Development only.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { ReplayResult, ReplaySetup, Route } from "@valancex/valance/replay";
import { parseLog, programHash, replay, ROUTES, sha256 } from "@valancex/valance/replay";

import { loadAuthor } from "./author.js";
import { loadConfig } from "./config.js";
import { generateContent, generateProgram, programFile } from "./emit.js";
import { generated } from "./project.js";
import { createLoader } from "./vite.js";

/** Where `vlx dev --record` writes when it is not told: `.valance/sessions/<time>.jsonl`. */
export const defaultRecording = (root: string, now: Date = new Date()): string => join(root, ".valance", "sessions", `${now.toISOString().replace(/[:.]/g, "-")}.jsonl`);

/** The project's web program, compiled as `vlx build` would, with the hashes a log's header is checked against. */
export const setupOf = async (root: string): Promise<ReplaySetup> => {
  const config = await loadConfig(root);

  await generateContent(root, config);

  const server = await createLoader(root, config);

  try {
    await generateProgram(root, await loadAuthor(server, root), config, ["web"]);
  } finally {
    await server.close();
  }

  const program = JSON.parse(readFileSync(generated(root, programFile(config, "web")), "utf8")) as {
    readonly root: string;
    readonly templates: ReadonlyArray<string>;
    readonly model: unknown;
  };
  const model = typeof program.model === "string" ? program.model : JSON.stringify(program.model);

  return { program: { root: program.root, templates: program.templates }, model, hashes: { program: await programHash(program.templates), manifest: await sha256(model) } };
};

const describe = (result: ReplayResult): ReadonlyArray<string> =>
  result.routes.map((route) =>
    route.ok
      ? `  ${route.route}: ${route.hashes.length} trees as recorded`
      : `  ${route.route}: line ${route.divergence!.line}, ${route.divergence!.kind}: the log has ${JSON.stringify(route.divergence!.expected)}, this gave ${JSON.stringify(route.divergence!.actual)}`,
  );

export interface ReplayRun {
  readonly code: number;
  readonly output: string;
}

/** Replays the log at `file` in the project at `root`. 0 when every route gave what the log recorded, 1 when one did not, 2 for a log or a route that cannot be read. */
export const replayFile = async (root: string, file: string, options?: { readonly routes?: ReadonlyArray<string>; readonly json?: boolean }): Promise<ReplayRun> => {
  if (!existsSync(file)) {
    return { code: 2, output: `vlx replay: ${file} is not a file` };
  }

  const routes = (options?.routes ?? ROUTES).filter((each): each is Route => ROUTES.includes(each as Route));

  if (routes.length === 0 || routes.length !== (options?.routes ?? ROUTES).length) {
    return { code: 2, output: `vlx replay: --route is one or more of ${ROUTES.join(", ")}` };
  }

  let lines;

  try {
    lines = parseLog(readFileSync(file, "utf8"));
  } catch (error) {
    return { code: 2, output: `vlx replay: ${error instanceof Error ? error.message : String(error)}` };
  }

  const result = await replay(lines, await setupOf(root), { routes });

  if (options?.json === true) {
    return { code: result.ok && result.agree ? 0 : 1, output: JSON.stringify({ file, ...result }) };
  }

  const header = `vlx replay: ${file}: ${lines.length} lines, ${result.trees} trees`;

  return result.ok && result.agree
    ? { code: 0, output: `${header}\n${describe(result).join("\n")}\nevery route gave the recorded trees${routes.length > 1 ? " and the routes agree" : ""}` }
    : { code: 1, output: `${header}\n${describe(result).join("\n")}\n${result.ok ? "the routes gave different trees from one another" : "a route differs from the log"}` };
};
