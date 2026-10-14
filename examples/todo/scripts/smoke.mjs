// Runs a packaged engine the way the renderer does and checks the wire: `node scripts/smoke.mjs path/to/todo-engine[.exe]`.
// It expects `hello` first, then a drawn screen; it creates a list through the protocol, asks to close, and expects `closeAnswer` allowed, `unmount`, and a clean exit. Works on any platform.
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const exe = process.argv[2];

if (exe === undefined) {
  console.error("usage: node scripts/smoke.mjs path/to/todo-engine");
  process.exit(2);
}

const child = spawn(exe, ["/"], { stdio: ["pipe", "pipe", "inherit"], windowsHide: true });
const messages = [];
const waiting = [];
const send = (message) => child.stdin.write(`${JSON.stringify(message)}\n`);
const exited = new Promise((resolve) => child.on("exit", (code) => resolve(code)));

createInterface({ input: child.stdout }).on("line", (line) => {
  const message = JSON.parse(line);

  messages.push(message);
  for (const check of waiting.splice(0)) {
    check();
  }
});

const until = (done, what) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${what}; saw ${messages.map((message) => message.op).join(",")}`)), 20_000);
    const check = () => {
      if (done()) {
        clearTimeout(timer);
        resolve();
      } else {
        waiting.push(check);
      }
    };

    check();
  });

const find = (node, test) => (test(node) ? node : (node.children ?? []).map((child) => find(child, test)).find(Boolean));
const tree = () => messages.findLast((message) => message.tree)?.tree.root;
const handlerOf = (test, event) => find(tree(), test)?.events?.[event];

try {
  await until(() => messages.some((message) => message.op === "draw"), "the first screen");

  if (messages[0].op !== "hello" || messages[0].protocol !== 1) {
    throw new Error(`the first message is not hello: ${JSON.stringify(messages[0])}`);
  }

  const field = handlerOf((node) => node.component === "textfield" && node.props.placeholder === "New list", "change");

  send({ op: "event", handler: field, payload: "Smoke" });
  await until(
    () =>
      handlerOf((node) => node.component === "button" && JSON.stringify(node).includes("Add list"), "press") !== undefined && JSON.stringify(tree()).includes('"value":"Smoke"'),
    "the typed name",
  );
  send({ op: "event", handler: handlerOf((node) => node.component === "button" && JSON.stringify(node).includes("Add list"), "press") });
  await until(() => JSON.stringify(tree()).includes("Smoke (0 of 0 open)"), "the new list");

  send({ op: "closeRequested" });
  await until(() => messages.some((message) => message.op === "closeAnswer" && message.allowed === true), "the close answer");

  const code = await exited;

  if (code !== 0) {
    throw new Error(`the engine exited with ${code}`);
  }

  console.log(`ok: ${exe}`);
} catch (error) {
  child.kill();
  console.error(String(error));
  process.exit(1);
}
