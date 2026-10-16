import { component, defineApp, field, route } from "@valancex/common";
import { request } from "@valancex/common/http";
import type { HttpError } from "@valancex/common/http";
import { Schema } from "effect";
import layout from "./layout.mprx";
import orderDetail from "./order-detail.js";
import orderEmpty from "./order-empty.js";
import ordersShell from "./orders-shell.js";
import themeToggle from "./theme-toggle.js";
import { ApiRow, Detail, Filter, Phase, Row, Status } from "./orders.js";

const None = { id: "", customer: "", status: "open" as const, total: 0, note: "" };

/** What a failed request means to the person: the kind of failure. (A failure never carries the answer, so the server's own words are out of reach.) */
const describe = (error: unknown): string => {
  const failed = error as HttpError;

  switch (failed._tag) {
    case "Offline":
      return "You are offline. Check the connection and try again.";
    case "Status":
      return failed.status === 422
        ? "The server would not make that change."
        : failed.status >= 500
          ? "The server had a problem. Try again in a moment."
          : "The server did not accept this.";
    default:
      return "Something went wrong. Try again.";
  }
};

export default defineApp({
  layout: component(layout),
  components: [themeToggle, ordersShell, orderEmpty, orderDetail],
  state: {
    theme: field(Schema.Literal("light", "dark"), "light"),
    filter: field(Filter, "all"),
    rows: field(Schema.Array(Row), []),
    listPhase: field(Phase, "idle"),
    detail: field(Detail, None),
    detailPhase: field(Phase, "idle"),
    // The status the person has picked for the order shown, and what saving it did.
    choice: field(Status, "open"),
    saving: field(Schema.Boolean, false),
    saveError: field(Schema.String, ""),
  },
  derived: (derive) => ({
    changed: derive(Schema.Boolean, (s) => s.detail.id !== "" && s.choice !== s.detail.status),
    save: derive(Schema.Struct({ id: Schema.String, status: Status }), (s) => ({ id: s.detail.id, status: s.choice })),
    empty: derive(Schema.Boolean, (s) => s.listPhase === "ready" && s.rows.length === 0),
  }),
  routes: {
    orders: route("/orders", {
      query: Schema.Struct({ status: Schema.optional(Filter) }),
      title: "Orders",
      enter: ({ status }, s) => ({ ...s, filter: status ?? "all" }),
      screen: ordersShell,
      index: orderEmpty,
      load: {
        begin: (_input, s) => ({ ...s, listPhase: "loading" }),
        work: ({ status }) => request({ path: "/orders", query: { status: status === "all" ? undefined : status }, response: Schema.Array(ApiRow) }),
        settle: (outcome, { status }, s) =>
          outcome.ok
            ? {
                ...s,
                rows: outcome.value.map((row) => ({ ...row, href: `/orders/${row.id}${status === undefined || status === "all" ? "" : `?status=${status}`}` })),
                listPhase: "ready",
              }
            : { ...s, rows: [], listPhase: "failed" },
      },
      children: {
        detail: route("/:id", {
          delivery: "client",
          params: Schema.Struct({ id: Schema.String }),
          title: ({ id }) => `Order ${id}`,
          screen: orderDetail,
          canDeactivate: ({ state }) => !(state.choice !== state.detail.status && state.detail.id !== ""),
          load: {
            begin: ({ id }, s) => ({ ...s, detail: { ...None, id }, detailPhase: "loading", saveError: "" }),
            work: ({ id }) => request({ path: `/orders/${id}`, response: Detail }),
            settle: (outcome, _input, s) => (outcome.ok ? { ...s, detail: outcome.value, choice: outcome.value.status, detailPhase: "ready" } : { ...s, detailPhase: "failed" }),
          },
        }),
      },
    }),
  },
  commands: (command) => ({
    toggleTheme: command((state) => ({ ...state, theme: state.theme === "light" ? "dark" : "light" })),
    choose: command(Schema.Struct({ value: Status }), ({ value }, s) => ({ ...s, choice: value })),
    saveStatus: command.waiting(Schema.Struct({ value: Schema.Struct({ id: Schema.String, status: Status }) }), {
      begin: (_input, s) => ({ ...s, saving: true, saveError: "" }),
      work: ({ value }) => request({ method: "PATCH", path: `/orders/${value.id}`, body: { status: value.status }, response: Detail }),
      wanted: ({ value }, s) => s.detail.id === value.id,
      settle: (outcome, _input, s) =>
        outcome.ok
          ? {
              ...s,
              saving: false,
              detail: outcome.value,
              choice: outcome.value.status,
              rows: s.rows.map((row) => (row.id === outcome.value.id ? { ...row, status: outcome.value.status } : row)),
            }
          : { ...s, saving: false, saveError: describe(outcome.error) },
    }),
  }),
});
