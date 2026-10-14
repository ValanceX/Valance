// Sending a person to an address outside the application: a web page in their browser, a mail in their mail program. NEXUS and VALANCE hold no such thing (their rule): it is a capability the
// platform supplies. The web's is a new tab; the desktop's is the system's own opener (`./open-system`). Only the addresses a person expects a link to open are opened: a script, a file or a
// program's own scheme is refused, whatever text asked.
import * as Nexus from "@valancex/nexus";
import { Effect } from "effect";

export class OpenError extends Error {
  readonly _tag = "OpenError";

  constructor(
    readonly kind: "Refused" | "Unavailable",
    message: string,
  ) {
    super(message);
    this.name = "OpenError";
  }
}

export interface OpenClient {
  /** Opens `address` in the program the platform keeps for it. Resolves when it was handed over, not when anything finished. */
  readonly open: (address: string) => Effect.Effect<void, OpenError>;
}

/** The capability: ask for it in a command (`Open.open`), and the platform says whether it has one. */
export const Open = Nexus.Capability.define<OpenClient>("valance/open");

/** The schemes an address may have to be opened. */
export const OPENABLE = ["https:", "http:", "mailto:"] as const;

/** Why `address` may not be opened, or `undefined` when it may: an absolute address of an openable scheme, without a control character, of a sensible length. */
export const refusal = (address: string): string | undefined => {
  // oxlint-disable-next-line no-control-regex -- a control character in an address is how one is smuggled into a command line
  if (address.length === 0 || address.length > 2048 || /[\u0000-\u001f\u007f\s]/.test(address)) {
    return "an address is one line of text, at most 2048 characters";
  }

  try {
    const url = new URL(address);

    return (OPENABLE as ReadonlyArray<string>).includes(url.protocol) ? undefined : `a ${url.protocol} address is not opened (only ${OPENABLE.join(", ")})`;
  } catch {
    return "not an absolute address";
  }
};

/** Opens `address` through the platform's opener. Requires the `Open` capability. */
export const open = (address: string): Effect.Effect<void, OpenError | Nexus.Capability.CapabilityUnavailableError, Nexus.Capability.EnvironmentShape> =>
  Effect.flatMap(Nexus.Capability.require(Open) as Effect.Effect<OpenClient, Nexus.Capability.CapabilityUnavailableError, Nexus.Capability.EnvironmentShape>, (client) =>
    client.open(address),
  );

/** The page's opener: a new tab, with no link back to this page. */
export const webOpen = (win?: { readonly open: (url: string, target: string, features: string) => unknown }): OpenClient => ({
  open: (address) => {
    const reason = refusal(address);

    if (reason !== undefined) {
      return Effect.fail(new OpenError("Refused", reason));
    }

    const target = win ?? (globalThis as { readonly window?: { readonly open: (url: string, target: string, features: string) => unknown } }).window;

    return target === undefined
      ? Effect.fail(new OpenError("Unavailable", "this page cannot open a tab"))
      : Effect.try({ try: () => void target.open(address, "_blank", "noopener,noreferrer"), catch: () => new OpenError("Unavailable", "the page's tab was blocked") });
  },
});
