// Copies files into a directory `node copy-into.mjs <directory> <file or dir/*.ext>...`. A stand-in for `cp src/*.mprx dist/sercer/` in package scripts, which cmd.exe cannot run. Quote a pattern so
// the shell leaves it to this script.
import { cpSync, mkdirSync, readdirSync } from "node:fs";
import { join, basename, dirname } from "node:path";

const [into, ...patterns] = process.argv.slice(2);

if (into === undefined || patterns.length === 0) {
  throw new Error("Usage: node copy-into.mjs <directory> <file or dir/*.ext>...");
}

const escape = (text) => text.replace(/[.+?^${}()|[\]\\]/g, "\\$&");

const expand = (pattern) => {
  if (!basename(pattern).includes("*")) {
    return [pattern];
  }

	const matcher = new RegExp(`^${basename(pattern).split("*").map(escape).join(".*")}$`);
	const found = readdirSync(dirname(pattern)).filter((name) => matcher.test(name)).map((name) => join(dirname(pattern), name));

	if (found.length === 0) {
		throw new Error(`${pattern} matches no file`);
	}

	return found;
};

mkdirSync(into, { recursive: true });

for (const file of patterns.flatMap(expand)) {
	cpSync(file, join(into, basename(file)), { recursive: true });
}
