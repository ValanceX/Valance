// What `vlx check`, `vlx build` and `vlx dev` show in a terminal. They are views of results the commands already compute: the commands run the same with or without them, and a pipe, a CI log or
// `--json` never gets one (see `../tty.ts`).
import { Box, Text } from "ink";

import type { BuildStage, Built } from "../build.js";
import type { Checked } from "../check.js";
import type { Diagnostic } from "../diagnostics.js";
import { Spinner } from "./Spinner.js";

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? "" : "s"}`;

export const Working = ({ label }: { readonly label: string }) => (
  <Text>
    <Spinner /> {label}
  </Text>
);

/** Mistakes grouped by file, each `line:column  code  message`. A line of 0 is "no line" (a whole file, or the configuration). */
export const Diagnostics = ({ diagnostics }: { readonly diagnostics: ReadonlyArray<Diagnostic> }) => {
  const byFile = new Map<string, Array<Diagnostic>>();

  for (const each of diagnostics) {
    byFile.set(each.file, [...(byFile.get(each.file) ?? []), each]);
  }

  return (
    <Box flexDirection="column">
      {[...byFile].map(([file, list]) => (
        <Box key={file} flexDirection="column" marginBottom={1}>
          <Text bold underline>
            {file}
          </Text>
          {list.map((each, index) => (
            <Text key={`${each.line}:${each.column}:${each.code}:${index}`}>
              <Text dimColor>{each.line > 0 ? `${each.line}:${each.column}`.padEnd(8) : "".padEnd(8)}</Text>
              <Text color="red">{each.code}</Text>
              <Text> {each.message}</Text>
            </Text>
          ))}
        </Box>
      ))}
    </Box>
  );
};

export const CheckResult = ({ result }: { readonly result: Checked }) =>
  result.diagnostics.length === 0 ? (
    <Text>
      <Text color="green" bold>
        ✔ No problems
      </Text>
      <Text dimColor>
        {" "}
        · {plural(result.pages, "page")}, {plural(result.components.length, "component")}
      </Text>
    </Text>
  ) : (
    <Box flexDirection="column">
      <Diagnostics diagnostics={result.diagnostics} />
      <Text color="red" bold>
        ✖ {plural(result.diagnostics.length, "problem")}
      </Text>
    </Box>
  );

const STAGES: ReadonlyArray<{ readonly stage: BuildStage; readonly label: string }> = [
  { stage: "configuration", label: "Reading the configuration" },
  { stage: "content", label: "Reading the content" },
  { stage: "templates", label: "Compiling the templates" },
  { stage: "bundle", label: "Bundling the browser code" },
  { stage: "pages", label: "Writing the pages" },
];

/** The stages up to `current` are done, `current` is spinning, the rest wait. With no `current`, all are done. */
export const BuildProgress = ({ current }: { readonly current: BuildStage | undefined }) => {
  const at = current === undefined ? STAGES.length : STAGES.findIndex((each) => each.stage === current);

  return (
    <Box flexDirection="column">
      {STAGES.map(({ stage, label }, index) =>
        index > at ? (
          <Text key={stage} dimColor>
            ○ {label}
          </Text>
        ) : index === at ? (
          <Text key={stage}>
            <Spinner /> {label}
          </Text>
        ) : (
          <Text key={stage}>
            <Text color="green">✔</Text> {label}
          </Text>
        ),
      )}
    </Box>
  );
};

export const BuildResult = ({ built, seconds }: { readonly built: Built; readonly seconds: number }) => (
  <Box flexDirection="column">
    <BuildProgress current={undefined} />
    <Text>
      <Text color="green" bold>
        ✔ Built {plural(built.pages.length, "page")}
      </Text>
      <Text dimColor>
        {" "}
        · {plural(built.files.length, "file")} → {built.dir} · {seconds.toFixed(1)}s
      </Text>
    </Text>
    {(built.report ?? []).map((line, index) => (
      <Text key={index} dimColor={!/WARNING|ERROR/.test(line)} {...(/WARNING/.test(line) ? { color: "yellow" } : /ERROR/.test(line) ? { color: "red" } : {})}>
        {line}
      </Text>
    ))}
  </Box>
);

export interface DevState {
  readonly url?: string;
  readonly open: ReadonlyArray<Diagnostic>;
  /** The latest reports, oldest first. */
  readonly lines: ReadonlyArray<string>;
  readonly starting: boolean;
}

export const DevScreen = ({ state }: { readonly state: DevState }) => (
  <Box flexDirection="column">
    <Text>
      <Text bold color="cyan">
        vlx dev
      </Text>
      {state.starting ? (
        <Text>
          {"  "}
          <Spinner /> starting
        </Text>
      ) : (
        <Text>
          {"  "}
          <Text color="green">●</Text> {state.url}
        </Text>
      )}
    </Text>
    {state.open.length === 0 ? (
      state.starting ? null : (
        <Text color="green">✔ No problems</Text>
      )
    ) : (
      <Box flexDirection="column" marginTop={1}>
        <Diagnostics diagnostics={state.open} />
        <Text color="red">✖ {plural(state.open.length, "problem")}: fix and save; the last good build keeps serving</Text>
      </Box>
    )}
    {state.lines.length === 0 ? null : (
      <Box flexDirection="column" marginTop={1}>
        {state.lines.map((line, index) => (
          <Text key={`${index}:${line}`} dimColor>
            {line}
          </Text>
        ))}
      </Box>
    )}
    <Box marginTop={1}>
      <Text dimColor>Ctrl+C to stop</Text>
    </Box>
  </Box>
);
