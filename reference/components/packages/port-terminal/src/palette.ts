/** The colors the terminal draws with, as `#rrggbb`. A terminal has no theme compiler: it reads the colors of a theme's token document (the Design Tokens format, which is data) and nothing else of the theme. */
export interface Palette {
  readonly text: string;
  readonly muted: string;
  readonly accent: string;
  readonly onAccent: string;
  readonly danger: string;
  readonly onDanger: string;
  readonly border: string;
}

export const DEFAULT_PALETTE: Palette = { text: "#1d2330", muted: "#4f5870", accent: "#4a2fc0", onAccent: "#ffffff", danger: "#b3261e", onDanger: "#ffffff", border: "#6b7385" };

type Tokens = { readonly color?: Readonly<Record<string, { readonly $value?: { readonly hex?: string } }>> };

/** The palette a mode's token document (`light.tokens.json`) gives; a role it does not have keeps the default's. */
export const paletteOf = (tokens: unknown): Palette => {
  const colors = (tokens as Tokens).color ?? {};
  const hex = (role: string, fallback: string): string => colors[role]?.$value?.hex ?? fallback;

  return {
    text: hex("text", DEFAULT_PALETTE.text),
    muted: hex("text-muted", DEFAULT_PALETTE.muted),
    accent: hex("accent", DEFAULT_PALETTE.accent),
    onAccent: hex("on-accent", DEFAULT_PALETTE.onAccent),
    danger: hex("danger", DEFAULT_PALETTE.danger),
    onDanger: hex("on-danger", DEFAULT_PALETTE.onDanger),
    border: hex("border", DEFAULT_PALETTE.border),
  };
};

const channel = (hex: string, at: number): number => parseInt(hex.slice(at, at + 2), 16);

/** A 24-bit color escape for `#rrggbb`. */
export const foreground = (hex: string): string => `\u001b[38;2;${channel(hex, 1)};${channel(hex, 3)};${channel(hex, 5)}m`;
export const background = (hex: string): string => `\u001b[48;2;${channel(hex, 1)};${channel(hex, 3)};${channel(hex, 5)}m`;
export const RESET = "\u001b[0m";
export const BOLD = "\u001b[1m";
export const REVERSE = "\u001b[7m";
