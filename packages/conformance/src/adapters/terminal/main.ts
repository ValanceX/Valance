// The terminal PORT's adapter as a child process: `node dist/adapters/terminal/main.js`, speaking the kit's line-JSON protocol on its standard input and output.
import { serve } from "../../lines.js";
import { terminalAdapter } from "./adapter.js";

serve(terminalAdapter(), process.stdin, process.stdout);
