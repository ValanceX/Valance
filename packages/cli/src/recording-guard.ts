// The three guards of a recording that holds user data (decision R16): the warning `vlx dev --record` gives when it starts, the flag a log must be given to be replayed or attached
// (`--allow-user-data`), and the places a project keeps recordings out of its repository. A recording holds what a person typed and saw; a recorder that cannot keep a secret out says so every time.
import { spawnSync } from "node:child_process";
import { relative } from "node:path";

import type { Config } from "./config.js";

/** True when `file` is in a git work tree of `root` and git does not ignore it. Nothing is said when `git` is not there or `root` is not a work tree. */
const trackedByMistake = (root: string, file: string): boolean => {
  const inside = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: root, encoding: "utf8" });

  if (inside.status !== 0) {
    return false;
  }

  return spawnSync("git", ["check-ignore", "--quiet", file], { cwd: root }).status === 1;
};

/** The lines `vlx dev --record` prints before it records: where, what the log holds, what is redacted, and whether git would commit it. */
export const recordingNotice = (root: string, file: string, config: Config): ReadonlyArray<string> => {
  const redact = config.record.redact;
  const shown = relative(root, file) || file;
  const redacting = redact.scope.length > 0 || redact.commands.length > 0;

  return [
    `vlx dev --record: WARNING. This session is being written to ${shown}.`,
    "  It holds what is typed and shown: names, passwords, anything on the page. It is for you, on this machine. Do not commit it, attach it to an issue or share it.",
    redacting
      ? `  Redacted (valance.json "record"): ${[...redact.scope.map((path) => path.join(".")), ...redact.commands].join(", ")}. Everything else is written as it is.`
      : '  Nothing is redacted. Mark what must not be written in valance.json: { "record": { "redact": { "scope": [["password"]], "commands": ["login/type"] } } } (docs/how-to/replay-and-conformance.md).',
    ...(trackedByMistake(root, file) ? [`  git does NOT ignore ${shown}: add it to .gitignore before you commit anything.`] : []),
  ];
};

/** What `vlx replay` says when it is given a log that holds user data without being told it may read it. */
export const userDataRefusal = (file: string): string =>
  `vlx replay: ${file} holds user data (its header says containsUserData). Replaying it prints what was typed and shown when a route differs; run it again with --allow-user-data when you mean to read it, and do not attach it anywhere.`;
