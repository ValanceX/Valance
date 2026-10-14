// The engine as a program: the to-do application behind stdin and stdout, for a native renderer to start and talk to. `node dist/main.js [address]` (the address it is opened at, `/` by default).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";

import { application, initial, starting } from "./app.js";
import type { Programs } from "./app.js";
import { serve } from "./host.js";

const programs = JSON.parse(readFileSync(fileURLToPath(new URL("./programs.json", import.meta.url)), "utf8")) as Programs;
const at = process.argv[2] ?? "/";
const start = await starting(initial(), at);

process.stdin.setEncoding("utf8");
await Effect.runPromise(serve(application(programs, start), { input: process.stdin, output: process.stdout }));
process.exit(0);
