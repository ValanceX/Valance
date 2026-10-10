// A minimal LSP client over stdio: just enough to ask the real server what an editor would.
import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

export interface Client {
  readonly diagnostics: Map<string, Array<{ range: { start: { line: number; character: number } }; code: string; message: string }>>;
  readonly capabilities: () => Record<string, unknown>;
  readonly request: (method: string, params: unknown) => Promise<{ result?: any }>;
  readonly open: (file: string, languageId: string, text: string) => void;
  readonly change: (file: string, version: number, text: string) => void;
  readonly configure: (settings: unknown) => void;
  readonly uri: (file: string) => string;
  readonly until: (condition: () => boolean, ms?: number) => Promise<void>;
  readonly stop: () => Promise<void>;
}

export const connect = async (bin: string, root: string, settings: unknown, args: ReadonlyArray<string> = []): Promise<Client> => {
  const child: ChildProcess = spawn(bin, [...args], { stdio: ["pipe", "pipe", "inherit"] });
  let buffer = Buffer.alloc(0);
  let id = 0;
  let capabilities: Record<string, unknown> = {};
  const pending = new Map<number, (message: { result?: any }) => void>();
  const diagnostics: Client["diagnostics"] = new Map();
  const send = (message: unknown): void => { const body = JSON.stringify(message); child.stdin!.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`); };

  child.stdout!.on("data", (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);

    for (;;) {
      const split = buffer.indexOf("\r\n\r\n");

      if (split < 0) { return; }

      const length = Number(/Content-Length: (\d+)/i.exec(buffer.subarray(0, split).toString())![1]);

      if (buffer.length < split + 4 + length) { return; }

      const message = JSON.parse(buffer.subarray(split + 4, split + 4 + length).toString()) as { id?: number; method?: string; params?: any; result?: any };

      buffer = buffer.subarray(split + 4 + length);

      if (message.id !== undefined && message.method === undefined) { pending.get(message.id)?.(message); pending.delete(message.id); }
      else if (message.method === "textDocument/publishDiagnostics") { diagnostics.set(message.params.uri, message.params.diagnostics); }
      else if (message.id !== undefined) { send({ jsonrpc: "2.0", id: message.id, result: null }); }
    }
  });

  const request: Client["request"] = (method, params) => new Promise((resolve) => { id += 1; pending.set(id, resolve); send({ jsonrpc: "2.0", id, method, params }); });
  const notify = (method: string, params: unknown): void => { send({ jsonrpc: "2.0", method, params }); };
  const uri = (file: string): string => pathToFileURL(join(root, file)).href;
  const init = await request("initialize", {
    processId: process.pid,
    rootUri: pathToFileURL(root).href,
    capabilities: { textDocument: { publishDiagnostics: {}, hover: { contentFormat: ["markdown", "plaintext"] }, completion: {}, definition: {}, codeAction: {} } },
    initializationOptions: settings,
  });

  capabilities = init.result.capabilities;
  notify("initialized", {});

  return {
    diagnostics,
    capabilities: () => capabilities,
    request,
    open: (file, languageId, text) => { notify("textDocument/didOpen", { textDocument: { uri: uri(file), languageId, version: 1, text } }); },
    change: (file, version, text) => { notify("textDocument/didChange", { textDocument: { uri: uri(file), version }, contentChanges: [{ text }] }); },
    configure: (settings) => { notify("workspace/didChangeConfiguration", { settings: { mesh: settings } }); },
    uri,
    until: async (condition, ms = 5000) => { const end = Date.now() + ms; while (!condition()) { if (Date.now() > end) { throw new Error("timed out waiting for the server"); } await new Promise((resolve) => setTimeout(resolve, 25)); } },
    stop: async () => { await request("shutdown", null); notify("exit", null); },
  };
};
