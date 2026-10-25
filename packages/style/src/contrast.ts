// The contrast ratio of two colors, as WCAG 2.2 defines it (Understanding SC 1.4.3, "Contrast (Minimum)"; the definitions of "relative luminance" and "contrast ratio"):
//
//   L = 0.2126 R + 0.7152 G + 0.0722 B, with each of R, G, B = c / 12.92 if c <= 0.04045, else ((c + 0.055) / 1.055) ^ 2.4 (c the 8-bit channel over 255)
//   ratio = (L1 + 0.05) / (L2 + 0.05), L1 the lighter
//
// The thresholds: 4.5 for normal text and 3 for large text and for user-interface components and graphical objects (SC 1.4.11), AA; 7 and 4.5 are AAA. A translucent color is composited over the
// background it is on before the ratio is taken.
import type { Rgb } from "./color.js";

const linear = (channel: number): number => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);

export const luminance = ({ r, g, b }: Rgb): number => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);

/** `over` composited on `under` (alpha compositing in gamma-encoded sRGB, as browsers do). */
export const composite = (over: Rgb, under: Rgb): Rgb => ({
  r: over.r * over.a + under.r * (1 - over.a),
  g: over.g * over.a + under.g * (1 - over.a),
  b: over.b * over.a + under.b * (1 - over.a),
  a: 1,
});

export const ratio = (a: Rgb, b: Rgb): number => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];

  return (light + 0.05) / (dark + 0.05);
};
