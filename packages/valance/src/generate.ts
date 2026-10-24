/**
 * Generated UI (direction Bet 13; decisions G1 to G14). Provisional, and for a host that lets a model write the interface: nothing in an ordinary application, in `start` or in a built page imports it (a boundary
 * test enforces it).
 *
 * - **Tier 1**: `profile(manifest, { page })` says what a model may use; `promptOf(profile)` is the vocabulary written from that data; `generation(profile)` takes the chunks as they come (`push`) and says,
 *   after each, what is wrong and what can be drawn, and `finish()` ends the round. `previewProgram` makes a preview into a program that `admit` puts into the running application.
 * - **Tier 2**: which components and commands a profile offers, the limits, the number of correction rounds, the consent a command needs and who gives it, a log of the generation.
 * - **Tier 3**: none. A generation can only reach what the profile names; the checker's repair and limits are not options.
 *
 * Mechanism stays below: the repair of a prefix and its check are MESH's (`openSession`); this module keeps the profile, the rounds, the guard and the log. It runs no model, draws nothing and starts no command.
 */
import type { Diagnostic, Session, StreamStep } from "@valancex/mesh-compiler";
import { compileProgram, openSession } from "@valancex/mesh-compiler";

import type { Program } from "./index.js";
import { compact, sha256 } from "./replay.js";

// ---- the profile ---------------------------------------------------------------------------------------------------------------------------------------------------------------

/** What a command does to the world: `read` changes nothing, `write` changes data and can be changed back, `destructive` cannot be (the manifest's `effect`). */
export type Effect = "read" | "write" | "destructive";

/** A command a profile offers, as a person is told about it. */
export interface OfferedCommand {
  readonly name: string;
  readonly effect: Effect;
  readonly title: string;
  readonly parameters: ReadonlyArray<{ readonly name: string; readonly type: string }>;
}

/** What a profile leaves out of a manifest, and why: information for the author, never for the model. */
export interface Omission {
  readonly what: "component" | "command";
  readonly name: string;
  readonly reason: "not-named" | "no-effect" | "no-title" | "destructive-not-named";
}

/** The vocabulary of one generation: a subset of a manifest, with a hash that names it. */
export interface Profile {
  readonly name: string;
  /** The page component: the one whose template the model writes. */
  readonly page: string;
  /** The subset manifest's text: what a session checks against. */
  readonly manifest: string;
  /** SHA-256 of the subset manifest in the compact form of the session logs: equal profiles have equal hashes. */
  readonly hash: string;
  readonly components: ReadonlyArray<string>;
  readonly commands: ReadonlyArray<OfferedCommand>;
  readonly omitted: ReadonlyArray<Omission>;
}

/** The profile's tuning (Tier 2). Each has a default that is right without it. */
export interface ProfileOptions {
  /** The component whose template is written. Default `"page"`. */
  readonly page?: string;
  /** The profile's name, for the log. Default `"generated"`. */
  readonly name?: string;
  /** The components a model may use. Default: every component of the manifest except the page. */
  readonly components?: ReadonlyArray<string>;
  /**
   * The commands a model may bind, by name. Default: every command of the page that carries an `effect` and a `title`, except those that are `destructive`; a destructive command is offered only when it is named
   * here (and then it always asks a person).
   */
  readonly commands?: ReadonlyArray<string>;
}

interface RawType {
  readonly kind: string;
  readonly [member: string]: unknown;
}
interface RawComponent {
  props?: Record<string, { type: RawType; required?: boolean }>;
  events?: Record<string, { payload?: RawType }>;
  commands?: Record<string, { parameters?: Array<{ name: string; type: RawType }>; effect?: string; title?: string }>;
  scope?: Record<string, RawType>;
}
interface RawManifest {
  version: number;
  types?: Record<string, unknown>;
  components: Record<string, RawComponent>;
}

const EFFECTS: ReadonlyArray<string> = ["read", "write", "destructive"];

/** A type as one line of the prompt: `string`, `list of record`, a closed set as `"a" | "b"`. */
const typeText = (type: RawType): string => {
  switch (type.kind) {
    case "enum":
      return (type["values"] as ReadonlyArray<string>).map((value) => JSON.stringify(value)).join(" | ");
    case "list":
      return `list of ${typeText(type["element"] as RawType)}`;
    case "optional":
      return `${typeText(type["inner"] as RawType)} or nothing`;
    case "ref":
      return String(type["name"]);
    default:
      return type.kind;
  }
};

/**
 * Makes a profile from a manifest (its text or its parsed form). It throws a `TypeError` if the page is not a component of the manifest or if a name is not found, so a profile that is wrong is found
 * before a model is asked anything, and the manifest it holds loads (MESH's `openSession` checks it again when a generation opens).
 */
export const profile = async (manifest: string | object, options: ProfileOptions = {}): Promise<Profile> => {
  const raw = (typeof manifest === "string" ? JSON.parse(manifest) : manifest) as RawManifest;
  const page = options.page ?? "page";
  const pageComponent = raw.components[page];

  if (pageComponent === undefined) {
    throw new TypeError(`the manifest has no component "${page}" to write (the page)`);
  }

  const named = (list: ReadonlyArray<string> | undefined, among: Record<string, unknown>, what: string): ReadonlySet<string> | undefined => {
    for (const each of list ?? []) {
      if (!(each in among)) {
        throw new TypeError(`the profile names ${what} "${each}", which the manifest does not have`);
      }
    }

    return list === undefined ? undefined : new Set(list);
  };

  const wanted = named(options.components, raw.components, "the component");
  const wantedCommands = named(options.commands, pageComponent.commands ?? {}, "the command");
  const omitted: Omission[] = [];
  const components: Record<string, RawComponent> = {};

  for (const [name, component] of Object.entries(raw.components)) {
    if (name === page) {
      continue;
    }

    if (wanted === undefined || wanted.has(name)) {
      components[name] = { ...component, commands: {} };
    } else {
      omitted.push({ what: "component", name, reason: "not-named" });
    }
  }

  const commands: Record<string, NonNullable<RawComponent["commands"]>[string]> = {};
  const offered: OfferedCommand[] = [];

  for (const [name, command] of Object.entries(pageComponent.commands ?? {})) {
    const effect = command.effect;
    const reason: Omission["reason"] | undefined =
      wantedCommands !== undefined && !wantedCommands.has(name)
        ? "not-named"
        : effect === undefined || !EFFECTS.includes(effect)
          ? "no-effect"
          : command.title === undefined || command.title === ""
            ? "no-title"
            : effect === "destructive" && wantedCommands === undefined
              ? "destructive-not-named"
              : undefined;

    if (reason !== undefined) {
      omitted.push({ what: "command", name, reason });
      continue;
    }

    commands[name] = command;
    offered.push({
      name,
      effect: effect as Effect,
      title: command.title as string,
      parameters: (command.parameters ?? []).map((parameter) => ({ name: parameter.name, type: typeText(parameter.type) })),
    });
  }

  const subset: RawManifest = { ...raw, components: { [page]: { ...pageComponent, commands }, ...components } };

  return {
    name: options.name ?? "generated",
    page,
    manifest: JSON.stringify(subset),
    hash: await sha256(compact(subset)),
    components: Object.keys(components),
    commands: offered,
    omitted,
  };
};

/**
 * The vocabulary as the prompt tells it, written from the profile's data and nothing else: the components with their props, events and the page's scope, and the commands with their titles, effects
 * and typed arguments. The same profile gives the same text. It is the part of a prompt that is about what exists; the rest (the task, the style) is the host's.
 */
export const promptOf = (given: Profile): string => {
  const manifest = JSON.parse(given.manifest) as RawManifest;
  const lines: string[] = ["Write one MPRX template. Use only these.", ""];
  const describe = (name: string, component: RawComponent): void => {
    const props = Object.entries(component.props ?? {}).map(([prop, shape]) => `${prop}${shape.required === true ? "" : "?"}: ${typeText(shape.type)}`);
    const events = Object.entries(component.events ?? {}).map(([event, shape]) => `on.${event}${shape.payload === undefined ? "" : `($event: ${typeText(shape.payload)})`}`);

    lines.push(`<${name}> props: ${props.length === 0 ? "none" : props.join(", ")}; events: ${events.length === 0 ? "none" : events.join(", ")}`);
  };

  lines.push("Components:");
  given.components.forEach((name) => describe(name, manifest.components[name]!));
  lines.push("", "Values you can show (the page's scope):");

  for (const [name, type] of Object.entries(manifest.components[given.page]!.scope ?? {})) {
    lines.push(`${name}: ${typeText(type)}`);
  }

  lines.push("", "Commands you can bind to an event:");

  if (given.commands.length === 0) {
    lines.push("none");
  }

  for (const command of given.commands) {
    lines.push(`${command.name}(${command.parameters.map((parameter) => `${parameter.name}: ${parameter.type}`).join(", ")}): ${command.title} [${command.effect}]`);
  }

  return lines.join("\n");
};

// ---- limits and the generation -------------------------------------------------------------------------------------------------------------------------------------------

/** The limits a generation is held to (decision G5). The first four are the checker's and cannot be raised; the push budget can be lowered. */
export const LIMITS = { bytes: 65_536, elements: 5_000, attributes: 64, depth: 128, pushMs: 50 } as const;

/** How many times the model is asked to correct (decision G7). */
export const ROUNDS = 3;

/** A mistake as a line: the code and where it is, which is all a correction needs and all a log keeps. */
const spot = (diagnostic: Diagnostic): string => `${diagnostic.code}@${diagnostic.span.start.byte}-${diagnostic.span.end.byte}`;

/** A preview: a checked prefix to draw. `n` counts them in the generation, so a host that draws asynchronously drops a result older than the latest it has seen. */
export interface Preview {
  readonly n: number;
  readonly round: number;
  readonly text: string;
}

/** What one chunk did. */
export interface Update {
  /** The mistakes this chunk added, each once. */
  readonly diagnostics: ReadonlyArray<Diagnostic>;
  /** Present only while no error stands. */
  readonly preview?: Preview;
  /** What is open: a host may show a placeholder for it. */
  readonly pending: StreamStep["pending"];
  /** Present when the checker's time budget ended the round: the host falls back to the last preview or to text, and the round's `finish()` still gives the whole check. */
  readonly ended?: StreamStep["ended"];
}

/** How a round ended. */
export interface Outcome {
  readonly round: number;
  readonly ok: boolean;
  /** The whole text, as the model wrote it. */
  readonly source: string;
  /** What `check` says about the whole text (errors and warnings). */
  readonly diagnostics: ReadonlyArray<Diagnostic>;
}

/** The record of a generation (decision G12). Chunks are written verbatim, so it holds what the model wrote and nothing of the prompt or its reasoning; it is a development tool and holds user data when the page shows any. */
export type GenerationLine =
  | {
      readonly line: "header";
      readonly format: 1;
      readonly profile: string;
      readonly profileHash: string;
      readonly limits: string;
      readonly page: string;
      readonly manifest: string;
    }
  | { readonly line: "round"; readonly round: number }
  | { readonly line: "chunk"; readonly round: number; readonly text: string }
  | { readonly line: "step"; readonly round: number; readonly n: number; readonly codes: ReadonlyArray<string>; readonly preview: string | null }
  | { readonly line: "budget"; readonly round: number; readonly after: number; readonly elapsedMs: number }
  | { readonly line: "close"; readonly round: number; readonly ok: boolean; readonly codes: ReadonlyArray<string> };

/** Tuning of a generation (Tier 2). */
export interface GenerationOptions {
  /** Called with each line of the record, in order. Nothing is written when it is absent. */
  readonly record?: (line: GenerationLine) => void;
  /** Milliseconds of checker time one push may take (at most 50). */
  readonly pushMs?: number;
  /** Correction rounds after the first (at most 3). */
  readonly rounds?: number;
}

/** A generation: a model's attempts at one page, one round at a time. */
export interface Generation {
  /** Adds a chunk of the round that is open. */
  push(chunk: string): Promise<Update>;
  /** Ends the round: the check of the whole text. `ok` when there is no error. */
  finish(): Promise<Outcome>;
  /**
   * After a round that is not `ok`: the text to send the model, one line for each mistake it has not been told about yet (a mistake is sent once, matched on its code and place), or `undefined` when
   * the rounds are spent or there is nothing new to say. Opens the next round when it returns text.
   */
  correction(outcome: Outcome): Promise<string | undefined>;
  /** The round that is open (1 is the first). */
  readonly round: number;
}

const limitsText = (pushMs: number, rounds: number): string => compact({ ...LIMITS, pushMs, rounds });

/** Opens a generation against a profile. It rejects if the profile's manifest does not load. */
export const generation = async (given: Profile, options: GenerationOptions = {}): Promise<Generation> => {
  const pushMs = Math.min(options.pushMs ?? LIMITS.pushMs, LIMITS.pushMs);
  const rounds = Math.min(options.rounds ?? ROUNDS, ROUNDS);
  const record = options.record ?? (() => undefined);
  const told = new Set<string>();
  let round = 0;
  let previews = 0;
  let pushes = 0;
  let session!: Session;
  let over: StreamStep["ended"];

  const open = async (): Promise<void> => {
    round += 1;
    pushes = 0;
    over = undefined;
    session = await openSession({ manifest: given.manifest, component: given.page, budgetMs: pushMs });
    record({ line: "round", round });
  };

  record({ line: "header", format: 1, profile: given.name, profileHash: given.hash, limits: limitsText(pushMs, rounds), page: given.page, manifest: given.manifest });
  await open();

  return {
    get round() {
      return round;
    },
    async push(chunk) {
      record({ line: "chunk", round, text: chunk });

      if (over !== undefined) {
        // the round ended on the checker's budget: the chunk is kept in the record and nothing more is checked (the host shows the last preview or text)
        return { diagnostics: [], pending: [], ended: over };
      }

      const step = await session.push(chunk);

      pushes += 1;
      step.diagnostics.forEach((diagnostic) => told.add(spot(diagnostic)));

      const preview: Preview | undefined = step.preview === undefined ? undefined : { n: (previews += 1), round, text: step.preview.text };

      record({ line: "step", round, n: preview?.n ?? 0, codes: step.diagnostics.map(spot), preview: preview === undefined ? null : await sha256(preview.text) });

      if (step.ended !== undefined) {
        over = step.ended;
        record({ line: "budget", round, after: pushes, elapsedMs: step.ended.elapsedMs });
      }

      return { diagnostics: step.diagnostics, ...(preview === undefined ? {} : { preview }), pending: step.pending, ...(step.ended === undefined ? {} : { ended: step.ended }) };
    },
    async finish() {
      const source = session.text;
      const checked = await session.close();
      const ok = !checked.diagnostics.some((diagnostic) => diagnostic.severity === "error");

      record({ line: "close", round, ok, codes: checked.diagnostics.map(spot) });

      return { round, ok, source, diagnostics: checked.diagnostics };
    },
    async correction(outcome) {
      if (outcome.ok || round > rounds) {
        return undefined;
      }

      const fresh = outcome.diagnostics.filter((diagnostic) => diagnostic.severity === "error" && !told.has(`sent|${spot(diagnostic)}`));

      if (fresh.length === 0) {
        return undefined;
      }

      fresh.forEach((diagnostic) => told.add(`sent|${spot(diagnostic)}`));
      await open();

      return feedbackOf(outcome.source, fresh);
    },
  };
};

/** The correction as text: each mistake with the code, the text it points at and, when MESH has one, its suggestion. Built from the diagnostic's code and span, never from a model's words. */
export const feedbackOf = (source: string, diagnostics: ReadonlyArray<Diagnostic>): string =>
  [
    "The template has mistakes. Write the whole template again with these fixed:",
    ...diagnostics.map((diagnostic) => {
      const at = source.slice(diagnostic.span.start.utf16, diagnostic.span.end.utf16);
      const suggestion = diagnostic.suggestions[0];

      return `- ${diagnostic.code}${at === "" ? "" : ` at \`${at}\``}: ${diagnostic.message}${suggestion === undefined ? "" : ` (try \`${suggestion.replacement}\`)`}`;
    }),
  ].join("\n");

/**
 * A preview as a program that `admit` puts into a running application. It is checked again as a whole program, so a preview is never drawn without the check the batch route gives; it rejects (with the
 * diagnostics) if it does not pass. A new preview is a new program: draw it afresh, and drop it if a later preview has been seen (`Preview.n`).
 */
export const previewProgram = async (given: Profile, preview: Preview): Promise<Program> => {
  const result = await compileProgram({
    model: { manifest: given.manifest, path: "components.json" },
    root: given.page,
    components: [{ component: given.page, path: "generated.mprx", source: preview.text }],
  });

  if (result.program === undefined) {
    throw new Error(`a preview did not pass the program check: ${result.components.flatMap((each) => each.diagnostics.diagnostics.map(spot)).join(", ")}`);
  }

  return result.program as unknown as Program;
};

// ---- commands and consent ------------------------------------------------------------------------------------------------------------------------------------------------

/** What a person is shown before a command runs: from the manifest and the typed arguments, never from text the model wrote. */
export interface Consent {
  readonly command: string;
  readonly title: string;
  readonly effect: Effect;
  readonly arguments: ReadonlyArray<{ readonly name: string; readonly value: unknown }>;
}

/** The decision for one command the generated UI asks to run. */
export type Decision = { readonly allowed: true } | { readonly allowed: false; readonly reason: "not-offered" | "declined" | "no-consent" };

/**
 * The guard in front of the commands a generated page may run (decision G11). A command the profile does not offer is refused; a `read` runs; a `write` or `destructive` command asks `consent` with the
 * prompt built from the manifest, and is refused when `consent` says no or when there is no `consent` (the default is to ask nobody and run nothing that changes anything).
 */
export const commandGuard =
  (given: Profile, consent?: (prompt: Consent) => boolean | Promise<boolean>) =>
  async (name: string, args: Readonly<Record<string, unknown>> = {}): Promise<Decision> => {
    const command = given.commands.find((each) => each.name === name);

    if (command === undefined) {
      return { allowed: false, reason: "not-offered" };
    }

    if (command.effect === "read") {
      return { allowed: true };
    }

    if (consent === undefined) {
      return { allowed: false, reason: "no-consent" };
    }

    const yes = await consent({
      command: command.name,
      title: command.title,
      effect: command.effect,
      arguments: command.parameters.map((parameter) => ({ name: parameter.name, value: args[parameter.name] })),
    });

    return yes ? { allowed: true } : { allowed: false, reason: "declined" };
  };

// ---- replay of a generation ----------------------------------------------------------------------------------------------------------------------------------------------

/** The first difference between a generation's record and what a fresh run of the same chunks gives, or `undefined` when they agree. */
export interface GenerationDivergence {
  readonly index: number;
  readonly expected: GenerationLine;
  readonly actual: GenerationLine | undefined;
}

/**
 * Replays a record: opens the profile's session again, feeds it the chunks, and compares the lines the checker decides (steps and closes). The checker's budget is a fact about a machine, so a `budget` line
 * is an input: the replay ends the round at the same push and never reads a clock. It refuses a record made against another profile.
 */
export const replayGeneration = async (given: Profile, lines: ReadonlyArray<GenerationLine>): Promise<GenerationDivergence | undefined> => {
  const header = lines[0];

  if (header === undefined || header.line !== "header" || header.profileHash !== given.hash) {
    throw new TypeError("the record is not of this profile");
  }

  const produced: GenerationLine[] = [];
  const stops = new Map<number, number>(lines.flatMap((line) => (line.line === "budget" ? ([[line.round, line.after]] as Array<[number, number]>) : [])));
  let session: Session | undefined;
  let pushes = 0;
  let previews = 0;
  let current = 0;
  let ended = false;

  for (const line of lines.slice(1)) {
    switch (line.line) {
      case "round":
        current = line.round;
        pushes = 0;
        ended = false;
        session = await openSession({ manifest: given.manifest, component: given.page, budgetMs: Number.POSITIVE_INFINITY });
        produced.push(line);
        break;
      case "chunk": {
        produced.push(line);

        if (!ended) {
          const step = await session!.push(line.text);

          pushes += 1;
          produced.push({
            line: "step",
            round: current,
            n: step.preview === undefined ? 0 : (previews += 1),
            codes: step.diagnostics.map(spot),
            preview: step.preview === undefined ? null : await sha256(step.preview.text),
          });

          if (stops.get(current) === pushes) {
            ended = true;
            produced.push(lines.find((each) => each.line === "budget" && each.round === current)!);
          }
        }

        break;
      }
      case "close": {
        const checked = await session!.close();

        produced.push({ line: "close", round: current, ok: !checked.diagnostics.some((diagnostic) => diagnostic.severity === "error"), codes: checked.diagnostics.map(spot) });
        break;
      }
      default:
        break;
    }
  }

  const expected = lines.slice(1);

  for (let index = 0; index < Math.max(expected.length, produced.length); index += 1) {
    const want = expected[index];
    const got = produced[index];

    if (compact(want) !== compact(got)) {
      return { index: index + 1, expected: want!, actual: got };
    }
  }

  return undefined;
};
