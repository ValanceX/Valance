// The four questions the wizard asks, as small controlled components: a line of text, one of several, any of several, yes or no. Each takes `onSubmit` and nothing else from its parent; the parent
// keeps what was answered. Keys: Enter answers, arrows (or j and k) move, Space toggles, and the text keys are what they say.
import { Box, Text, useInput } from "ink";
import { useState } from "react";

export interface Choice<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly hint?: string;
}

const Question = ({ label, hint, children }: { readonly label: string; readonly hint?: string | undefined; readonly children?: React.ReactNode }) => (
  <Box flexDirection="column">
    <Text>
      <Text color="cyan">? </Text>
      <Text bold>{label}</Text>
    </Text>
    {hint === undefined ? null : <Text dimColor> {hint}</Text>}
    {children}
  </Box>
);

export const Problem = ({ children }: { readonly children: string }) => <Text color="red"> ✖ {children}</Text>;

export const TextPrompt = ({
  label,
  hint,
  initial = "",
  validate,
  onSubmit,
}: {
  readonly label: string;
  readonly hint?: string;
  readonly initial?: string;
  readonly validate?: (value: string) => string | undefined;
  readonly onSubmit: (value: string) => void;
}) => {
  // `initial` is the default, shown dimmed until something is typed; Enter on nothing takes it.
  const [value, setValue] = useState("");
  const [problem, setProblem] = useState<string | undefined>(undefined);

  useInput((input, key) => {
    if (key.return) {
      const answer = value === "" ? initial : value;
      const found = validate?.(answer);

      if (found === undefined) {
        onSubmit(answer);
      } else {
        setProblem(found);
      }

      return;
    }

    if (key.backspace || key.delete) {
      setValue((current) => current.slice(0, -1));
      setProblem(undefined);

      return;
    }

    if (key.ctrl || key.meta || key.escape || key.tab || key.upArrow || key.downArrow || key.leftArrow || key.rightArrow || input === "") {
      return;
    }

    setValue((current) => current + input.replace(/[\r\n]+/g, ""));
    setProblem(undefined);
  });

  return (
    <Question label={label} hint={hint}>
      <Text>
        {"  "}
        {value === "" ? <Text dimColor>{initial}</Text> : value}
        <Text color="cyan">▌</Text>
      </Text>
      {problem === undefined ? null : <Problem>{problem}</Problem>}
    </Question>
  );
};

export const Select = <T extends string>({
  label,
  hint,
  choices,
  initial,
  onSubmit,
}: {
  readonly label: string;
  readonly hint?: string;
  readonly choices: ReadonlyArray<Choice<T>>;
  readonly initial?: T;
  readonly onSubmit: (value: T) => void;
}) => {
  const [at, setAt] = useState(
    Math.max(
      0,
      choices.findIndex((each) => each.value === initial),
    ),
  );

  useInput((input, key) => {
    if (key.upArrow || input === "k") {
      setAt((current) => (current + choices.length - 1) % choices.length);
    } else if (key.downArrow || input === "j") {
      setAt((current) => (current + 1) % choices.length);
    } else if (key.return) {
      onSubmit(choices[at]!.value);
    }
  });

  return (
    <Question label={label} hint={hint ?? "↑/↓ to move, Enter to choose"}>
      {choices.map((choice, index) => (
        <Text key={choice.value} {...(index === at ? { color: "cyan" } : {})}>
          {"  "}
          {index === at ? "❯" : " "} {choice.label}
          {choice.hint === undefined ? null : <Text dimColor> {choice.hint}</Text>}
        </Text>
      ))}
    </Question>
  );
};

export const MultiSelect = <T extends string>({
  label,
  hint,
  choices,
  initial,
  onSubmit,
}: {
  readonly label: string;
  readonly hint?: string;
  readonly choices: ReadonlyArray<Choice<T>>;
  readonly initial: ReadonlyArray<T>;
  readonly onSubmit: (values: ReadonlyArray<T>) => void;
}) => {
  const [at, setAt] = useState(0);
  const [chosen, setChosen] = useState<ReadonlyArray<T>>(initial);
  const [problem, setProblem] = useState<string | undefined>(undefined);

  useInput((input, key) => {
    if (key.upArrow || input === "k") {
      setAt((current) => (current + choices.length - 1) % choices.length);
    } else if (key.downArrow || input === "j") {
      setAt((current) => (current + 1) % choices.length);
    } else if (input === " ") {
      const value = choices[at]!.value;

      setChosen((current) => (current.includes(value) ? current.filter((each) => each !== value) : [...current, value]));
      setProblem(undefined);
    } else if (input === "a") {
      setChosen((current) => (current.length === choices.length ? [] : choices.map((each) => each.value)));
      setProblem(undefined);
    } else if (key.return) {
      if (chosen.length === 0) {
        setProblem("choose at least one (Space)");
      } else {
        onSubmit(choices.filter((each) => chosen.includes(each.value)).map((each) => each.value));
      }
    }
  });

  return (
    <Question label={label} hint={hint ?? "↑/↓ to move, Space to toggle, a for all, Enter to confirm"}>
      {choices.map((choice, index) => (
        <Text key={choice.value} {...(index === at ? { color: "cyan" } : {})}>
          {"  "}
          {index === at ? "❯" : " "} {chosen.includes(choice.value) ? "◉" : "○"} {choice.label}
          {choice.hint === undefined ? null : <Text dimColor> {choice.hint}</Text>}
        </Text>
      ))}
      {problem === undefined ? null : <Problem>{problem}</Problem>}
    </Question>
  );
};

export const Confirm = ({ label, initial, onSubmit }: { readonly label: string; readonly initial: boolean; readonly onSubmit: (value: boolean) => void }) => {
  useInput((input, key) => {
    if (input === "y" || input === "Y") {
      onSubmit(true);
    } else if (input === "n" || input === "N") {
      onSubmit(false);
    } else if (key.return) {
      onSubmit(initial);
    }
  });

  return <Question label={label} hint={initial ? "(Y/n)" : "(y/N)"} />;
};

/** An answered question, left on screen. */
export const Answered = ({ label, value }: { readonly label: string; readonly value: string }) => (
  <Text>
    <Text color="green">✔ </Text>
    {label} <Text color="cyan">{value}</Text>
  </Text>
);
