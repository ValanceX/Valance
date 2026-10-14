// The `vlx init` wizard: the questions flags did not answer, then the work with its progress, then what to do next. The work and the rules are `../init.ts`; this file only asks and shows.
import { Box, Text, useApp } from "ink";
import { useEffect, useRef, useState } from "react";
import { relative } from "node:path";

import type { InitArgs } from "../args.js";
import type { Answers, Outcome, PackageManager, Progress, Step } from "../init.js";
import { directoryFor, directoryProblem, execute as defaultExecute, nameProblem, PACKAGE_MANAGERS, runCommand, titleOf } from "../init.js";
import type { TargetId } from "../targets.js";
import { DEFAULT_TARGETS, TARGETS } from "../targets.js";
import { Spinner } from "./Spinner.js";
import { Answered, Confirm, MultiSelect, Select, TextPrompt } from "./prompts.js";

type Question = "name" | "targets" | "base" | "url" | "pm" | "install" | "git";

const ORDER: ReadonlyArray<Question> = ["name", "targets", "base", "url", "pm", "install", "git"];

interface Draft {
  readonly name?: string;
  readonly targets: ReadonlyArray<TargetId>;
  readonly base?: string;
  readonly url?: string;
  readonly pm: PackageManager;
  readonly install?: boolean;
  readonly git?: boolean;
}

export type Result =
  | { readonly status: "done"; readonly answers: Answers; readonly outcome: Outcome }
  | { readonly status: "failed"; readonly message: string }
  | { readonly status: "cancelled" };

export interface WizardProps {
  readonly args: InitArgs;
  readonly cwd: string;
  readonly detected: PackageManager;
  readonly version: string;
  readonly execute?: typeof defaultExecute;
  readonly onFinish: (result: Result) => void;
}

const BASE = /^\/([\w.~-]+\/)*$/;
const URL_FORM = /^https?:\/\/.*[^/]$/;

/** Whether a question has to be asked: nothing answered it, and the person has not said to take the defaults. */
const asked = (question: Question, draft: Draft, args: InitArgs): boolean => {
  if (args.yes) {
    return false;
  }

  switch (question) {
    case "name":
      return draft.name === undefined;
    case "targets":
      return draft.targets.length === 0;
    case "base":
      return draft.targets.includes("web") && draft.base === undefined;
    case "url":
      return draft.targets.includes("web") && draft.url === undefined;
    case "pm":
      return args.packageManager === undefined;
    case "install":
      return draft.install === undefined;
    case "git":
      return draft.git === undefined;
  }
};

const next = (from: number, draft: Draft, args: InitArgs): number => {
  for (let at = from; at < ORDER.length; at += 1) {
    if (asked(ORDER[at]!, draft, args)) {
      return at;
    }
  }

  return ORDER.length;
};

const STEPS: ReadonlyArray<{ readonly step: Step; readonly label: string }> = [
  { step: "files", label: "Writing the files" },
  { step: "install", label: "Installing the dependencies" },
  { step: "git", label: "Making a git repository" },
];

export const Wizard = ({ args, cwd, detected, version, execute = defaultExecute, onFinish }: WizardProps) => {
  const { exit } = useApp();
  const initial: Draft = {
    ...(args.name === undefined ? {} : { name: args.name }),
    targets: args.targets,
    ...(args.base === undefined ? {} : { base: args.base }),
    ...(args.url === undefined ? {} : { url: args.url }),
    pm: args.packageManager ?? detected,
    ...(args.install === undefined ? {} : { install: args.install }),
    ...(args.git === undefined ? {} : { git: args.git }),
  };
  const [draft, setDraft] = useState<Draft>(initial);
  const [at, setAt] = useState(() => next(0, initial, args));
  const [answered, setAnswered] = useState<ReadonlyArray<readonly [string, string]>>([]);
  const [progress, setProgress] = useState<Partial<Record<Step, { readonly state: Progress; readonly detail?: string | undefined }>>>({});
  const [outcome, setOutcome] = useState<{ readonly answers: Answers; readonly outcome: Outcome } | undefined>(undefined);
  const [failure, setFailure] = useState<string | undefined>(undefined);
  const finished = useRef(false);

  const answer = (patch: Partial<Draft>, label: string, shown: string): void => {
    const merged = { ...draft, ...patch };

    setDraft(merged);
    setAnswered((current) => [...current, [label, shown]]);
    setAt(next(at + 1, merged, args));
  };

  const running = at >= ORDER.length;

  useEffect(() => {
    if (!running || finished.current) {
      return;
    }

    finished.current = true;

    const targets = draft.targets.length === 0 ? DEFAULT_TARGETS : draft.targets;
    const name = draft.name ?? "my-app";
    const answers: Answers = {
      name,
      dir: directoryFor(name, cwd),
      targets,
      web: { base: draft.base ?? "", url: draft.url ?? "" },
      packageManager: draft.pm,
      install: draft.install ?? true,
      git: draft.git ?? true,
      ...(args.cli === undefined ? {} : { cli: args.cli }),
    };

    execute(answers, (step, state, detail) => {
      setProgress((current) => ({ ...current, [step]: { state, detail } }));
    })
      .then((done) => {
        setOutcome({ answers, outcome: done });
        onFinish({ status: "done", answers, outcome: done });
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);

        setFailure(message);
        onFinish({ status: "failed", message });
      });
  }, [running]);

  // Leave once the last frame (what was created, what is next) is on the screen: exiting in the same tick would unmount before it is drawn.
  useEffect(() => {
    if (outcome !== undefined || failure !== undefined) {
      exit();
    }
  }, [outcome, failure]);

  const question = running ? undefined : ORDER[at]!;
  const picked = draft.targets.length === 0 ? DEFAULT_TARGETS : draft.targets;

  return (
    <Box flexDirection="column">
      <Text>
        <Text bold color="cyan">
          vlx init
        </Text>
        <Text dimColor> · VALANCE {version}</Text>
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {answered.map(([label, value]) => (
          <Answered key={label} label={label} value={value} />
        ))}
        {question === "name" ? (
          <TextPrompt
            label="What is the application called?"
            hint="a name, or a path: it is made in a directory of that name"
            initial="my-app"
            validate={(value) => nameProblem(value) ?? directoryProblem(directoryFor(value, cwd))}
            onSubmit={(value) => {
              answer({ name: value.trim() }, "Application", `${titleOf(value)} → ${relative(cwd, directoryFor(value, cwd)) || "."}`);
            }}
          />
        ) : null}
        {question === "targets" ? (
          <MultiSelect
            label="Which targets is it for?"
            hint="one application, built for each"
            choices={TARGETS.map((each) => ({ value: each.id, label: each.label, hint: each.hint }))}
            initial={DEFAULT_TARGETS}
            onSubmit={(values) => {
              answer({ targets: values }, "Targets", values.map((id) => TARGETS.find((each) => each.id === id)?.label ?? id).join(", "));
            }}
          />
        ) : null}
        {question === "base" ? (
          <TextPrompt
            label="Web: where is the site served?"
            hint="a base path: / or /docs/"
            initial="/"
            validate={(value) => (BASE.test(value) ? undefined : "a path that starts and ends with /, like / or /docs/")}
            onSubmit={(value) => {
              answer({ base: value }, "Base path", value);
            }}
          />
        ) : null}
        {question === "url" ? (
          <TextPrompt
            label="Web: where is it published?"
            hint="optional, https://example.com: adds canonical links and a sitemap"
            validate={(value) => (value === "" || URL_FORM.test(value) ? undefined : "an address like https://example.com, without a trailing slash")}
            onSubmit={(value) => {
              answer({ url: value }, "Published at", value === "" ? "not yet" : value);
            }}
          />
        ) : null}
        {question === "pm" ? (
          <Select
            label="Which package manager?"
            choices={PACKAGE_MANAGERS.map((each) => ({ value: each, label: each, ...(each === detected ? { hint: "(running this)" } : {}) }))}
            initial={draft.pm}
            onSubmit={(value) => {
              answer({ pm: value }, "Package manager", value);
            }}
          />
        ) : null}
        {question === "install" ? (
          <Confirm
            label="Install the dependencies now?"
            initial
            onSubmit={(value) => {
              answer({ install: value }, "Install", value ? "yes" : "no");
            }}
          />
        ) : null}
        {question === "git" ? (
          <Confirm
            label="Make a git repository?"
            initial
            onSubmit={(value) => {
              answer({ git: value }, "Git", value ? "yes" : "no");
            }}
          />
        ) : null}
      </Box>
      {running ? (
        <Box flexDirection="column" marginTop={1}>
          {STEPS.map(({ step, label }) => {
            const now = progress[step];

            if (now === undefined || now.state === "skipped") {
              return now === undefined ? null : (
                <Text key={step} dimColor>
                  – {label}: skipped
                </Text>
              );
            }

            return (
              <Text key={step}>
                {now.state === "start" ? <Spinner /> : now.state === "done" ? <Text color="green">✔</Text> : <Text color="yellow">!</Text>} {label}
                {now.state === "failed" ? <Text color="yellow"> (failed)</Text> : null}
              </Text>
            );
          })}
        </Box>
      ) : null}
      {failure === undefined ? null : (
        <Box marginTop={1}>
          <Text color="red">✖ {failure}</Text>
        </Box>
      )}
      {outcome === undefined ? null : <Next answers={outcome.answers} outcome={outcome.outcome} cwd={cwd} picked={picked} />}
    </Box>
  );
};

const Next = ({ answers, outcome, cwd, picked }: { readonly answers: Answers; readonly outcome: Outcome; readonly cwd: string; readonly picked: ReadonlyArray<TargetId> }) => {
  const where = relative(cwd, answers.dir) || ".";
  const run = runCommand(answers.packageManager);

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text>
        <Text color="green" bold>
          ✔ Created {titleOf(answers.name)}
        </Text>
        <Text dimColor>
          {" "}
          in {where} · {outcome.files.length} files · {picked.join(", ")}
        </Text>
      </Text>
      {outcome.notes.map((note) => (
        <Text key={note} color="yellow">
          ! {note}
        </Text>
      ))}
      <Box flexDirection="column" marginTop={1}>
        <Text bold>Next</Text>
        {where === "." ? null : <Text> cd {where}</Text>}
        {outcome.installed ? null : <Text> {answers.packageManager} install</Text>}
        <Text> {run} dev</Text>
        <Text dimColor>
          {" "}
          Start reading at src/main.ts. {run} build writes the site; {run} check finds mistakes.
        </Text>
      </Box>
    </Box>
  );
};
