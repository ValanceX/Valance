// A second small application, deliberately not Tally's shape: TWO views, no path pages. "Which message is open" is a field of the
// state, the message view is a detail over the list (what a modal would be), and the URL carries only that field in a query.
// Written only against the public API (`@valancex/valance`, `@valancex/valance/web`) and NEXUS.
import type { Mesh } from "@valancex/nexus";

import * as Valance from "@valancex/valance";
import * as Nexus from "@valancex/nexus";
import { Effect, Schema } from "effect";

const Message = Schema.Struct({ id: Schema.String, subject: Schema.String, body: Schema.String, read: Schema.Boolean, starred: Schema.Boolean });

export const AppState = Schema.Struct({ open: Schema.String, messages: Schema.Array(Message) });
export type AppState = Schema.Schema.Type<typeof AppState>;

export const initial: AppState = {
  open: "",
  messages: [
    { id: "m1", subject: "Welcome", body: "Hello.", read: false, starred: false },
    { id: "m2", subject: "Invoice", body: "Due Friday.", read: false, starred: false },
  ],
};

/** state → URL, and URL → the part of the state it names (the open message). The application's. */
export const urlOf = ({ open }: AppState): string => open === "" ? "/inbox" : `/inbox?open=${encodeURIComponent(open)}`;
export const stateOf = (url: URL): { readonly open: string } => ({ open: url.searchParams.get("open") ?? "" });
export const stateFor = (url: string): AppState => ({ ...initial, open: stateOf(new URL(url, "http://localhost")).open });

export interface Programs {
  readonly list: Mesh.Program;
  readonly message: Mesh.Program;
}

const firstValue = (args: ReadonlyArray<Mesh.IntentArgument>): unknown => {
  const first = args[0];

  return first !== undefined && "value" in first ? first.value : undefined;
};

const opened = (state: AppState): AppState["messages"][number] | undefined => state.messages.find((message) => message.id === state.open);

export const application = (programs: Programs) => Valance.define({
  name: "inbox",
  state: { schema: AppState, initial },
  views: {
    list: { program: programs.list, scope: ({ messages }) => ({ title: "Inbox", unread: messages.filter((message) => !message.read).length, items: messages.map(({ id, subject, read }) => ({ id, subject, mark: read ? " " : "*" })) }) },
    message: { program: programs.message, scope: (state) => ({ title: "Message", subject: opened(state)?.subject ?? "", body: opened(state)?.body ?? "", starred: opened(state)?.starred === true ? "on" : "off" }) },
  },
  // An open message that does not exist is the list: the application decides.
  view: (state) => opened(state) === undefined ? "list" : "message",
  commands: (state) => {
    // `enter` is the one transition; opening marks read. Whoever asks (a click, or the browser's Back) goes through it.
    const enter = Nexus.Command.define("inbox.enter", Schema.Struct({ open: Schema.String }), ({ open }) =>
      state.update((current) => Effect.succeed({ open, messages: current.messages.map((message) => message.id === open ? { ...message, read: true } : message) })).pipe(Effect.asVoid));
    const star = Nexus.Command.define("inbox.star", Schema.Struct({}), () =>
      state.update((current) => Effect.succeed({ ...current, messages: current.messages.map((message) => message.id === current.open ? { ...message, starred: !message.starred } : message) })).pipe(Effect.asVoid));

    return {
      "list/open": Nexus.Mesh.bind(enter, (args) => ({ open: firstValue(args) })),
      "message/star": Nexus.Mesh.bind(star, () => ({})),
      "message/close": Nexus.Mesh.bind(enter, () => ({ open: "" })),
      "app/navigate": Nexus.Mesh.bind(enter, (args) => firstValue(args)),
    };
  },
});
