// The server reads the views (and the generated site) relative to its compiled files: put them beside dist/server.
import { cpSync } from "node:fs";

cpSync("views", "dist/server/views", { recursive: true });
