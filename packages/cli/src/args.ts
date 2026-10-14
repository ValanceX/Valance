// The arguments of `vlx init`, read once: what was given, and what is still to be asked.
import type { PackageManager } from "./init.js";
import { PACKAGE_MANAGERS } from "./init.js";
import type { TargetId } from "./targets.js";
import { isTarget, TARGETS } from "./targets.js";

export interface InitArgs {
  readonly name?: string;
  /** The targets named by flags (`--web`); empty means "ask". */
  readonly targets: ReadonlyArray<TargetId>;
  /** Take the default for every question that has one, and ask none. */
  readonly yes: boolean;
  /** Never draw the interface, even in a terminal. */
  readonly plain: boolean;
  readonly packageManager?: PackageManager;
  readonly install?: boolean;
  readonly git?: boolean;
  readonly base?: string;
  readonly url?: string;
  readonly cli?: string;
}

export const INIT_HELP = `vlx init [app-name] [options]

Make a new application. Without options it asks what it needs to know.

  --web, --desktop           the target: the web, or a desktop window (one per project; a flag per target: ${TARGETS.map((each) => `--${each.id}`).join(", ")})
  -y, --yes                  answer every question with its default (the web)
  --pm <npm|pnpm|yarn|bun>   the package manager (default: the one that ran this, else npm)
  --no-install               do not install the dependencies
  --no-git                   do not run git init
  --base <path>              the web site's base path, e.g. /docs/ (default /)
  --url <address>            where the web site is published, e.g. https://example.com
  --cli <spec>               what to write for @valancex/cli in package.json
  --plain                    no interface: plain text, never a prompt
`;

/** `args` after `init`. Returns the reading, or the sentence that says what is wrong with it. */
export const parseInit = (args: ReadonlyArray<string>): InitArgs | string => {
  const targets: Array<TargetId> = [];
  const positional: Array<string> = [];
  const out: { -readonly [K in keyof InitArgs]?: InitArgs[K] } = { yes: false, plain: false };

  for (let at = 0; at < args.length; at += 1) {
    const arg = args[at]!;
    const value = (): string | undefined => {
      at += 1;

      return args[at];
    };

    if (arg === "-y" || arg === "--yes") {
      out.yes = true;
    } else if (arg === "--plain") {
      out.plain = true;
    } else if (arg === "--no-install") {
      out.install = false;
    } else if (arg === "--install") {
      out.install = true;
    } else if (arg === "--no-git") {
      out.git = false;
    } else if (arg === "--git") {
      out.git = true;
    } else if (arg === "--pm") {
      const manager = value();
      const found = PACKAGE_MANAGERS.find((each) => each === manager);

      if (found === undefined) {
        return `--pm needs one of ${PACKAGE_MANAGERS.join(", ")}`;
      }

      out.packageManager = found;
    } else if (arg === "--base" || arg === "--url" || arg === "--cli") {
      const given = value();

      if (given === undefined || given.startsWith("--")) {
        return `${arg} needs a value`;
      }

      out[arg.slice(2) as "base" | "url" | "cli"] = given;
    } else if (arg.startsWith("--") && isTarget(arg.slice(2))) {
      const id = arg.slice(2) as TargetId;

      if (!targets.includes(id)) {
        targets.push(id);
      }
    } else if (arg.startsWith("-")) {
      return `unknown option "${arg}"`;
    } else {
      positional.push(arg);
    }
  }

  if (targets.length > 1) {
    return `one target per project, not ${targets.length}: ${targets.map((id) => `--${id}`).join(" and ")}`;
  }

  if (positional.length > 1) {
    return `one name, not ${positional.length}: "${positional.join(" ")}" (quote a name with spaces)`;
  }

  return { yes: false, plain: false, ...out, targets, ...(positional[0] === undefined ? {} : { name: positional[0] }) };
};
