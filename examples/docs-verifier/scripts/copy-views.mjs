// The server reads the views relative to its compiled files (web/compile.ts): put them beside dist/server.
import { cpSync } from "node:fs";

cpSync("views", "dist/server/views", { recursive: true });
