// Colors of the Design Tokens format (2025.10) as sRGB and as CSS. The contrast of a pair is computed in sRGB (WCAG 2.2 defines relative luminance there), so every color is converted; the spaces this
// package converts are `srgb`, `srgb-linear`, `hsl`, `oklab`, `oklch` and `display-p3`. Another space is refused by name rather than approximated.
export interface Rgb {
  /** 0 to 1, gamma-encoded sRGB. */
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

export interface DtcgColor {
  readonly colorSpace: string;
  readonly components: ReadonlyArray<number | "none">;
  readonly alpha?: number;
  readonly hex?: string;
}

const clamp = (value: number): number => Math.min(1, Math.max(0, value));
const component = (value: number | "none"): number => (value === "none" ? 0 : value);
const encode = (linear: number): number => (Math.abs(linear) <= 0.0031308 ? 12.92 * linear : Math.sign(linear) * (1.055 * Math.abs(linear) ** (1 / 2.4) - 0.055));
const decode = (encoded: number): number => (Math.abs(encoded) <= 0.04045 ? encoded / 12.92 : Math.sign(encoded) * ((Math.abs(encoded) + 0.055) / 1.055) ** 2.4);

const fromOklab = (lightness: number, a: number, b: number): [number, number, number] => {
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
};

const fromHsl = (hue: number, saturation: number, lightness: number): [number, number, number] => {
  const s = saturation / 100;
  const l = lightness / 100;
  const k = (n: number) => (n + hue / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));

  return [f(0), f(8), f(4)];
};

/** Display P3 (gamma-encoded) to linear sRGB, through XYZ (D65). */
const fromDisplayP3 = (r: number, g: number, b: number): [number, number, number] => {
  const [lr, lg, lb] = [decode(r), decode(g), decode(b)];
  const x = 0.4865709486482162 * lr + 0.26566769316909306 * lg + 0.1982172852343625 * lb;
  const y = 0.2289745640697488 * lr + 0.6917385218365064 * lg + 0.079286914093745 * lb;
  const z = 0.04511338185890264 * lg + 1.043944368900976 * lb;

  return [
    3.2409699419045226 * x - 1.537383177570094 * y - 0.4986107602930034 * z,
    -0.9692436362808796 * x + 1.8759675015077202 * y + 0.04155505740717559 * z,
    0.05563007969699366 * x - 0.20397695888897652 * y + 1.0569715142428786 * z,
  ];
};

/** The color as gamma-encoded sRGB, clipped to the gamut. Throws for a color space this package does not convert. */
export const toRgb = (color: DtcgColor): Rgb => {
  const c = color.components.map(component);
  const a = color.alpha ?? 1;
  const [c0 = 0, c1 = 0, c2 = 0] = c;

  switch (color.colorSpace) {
    case "srgb":
      return { r: clamp(c0), g: clamp(c1), b: clamp(c2), a };
    case "srgb-linear":
      return { r: clamp(encode(c0)), g: clamp(encode(c1)), b: clamp(encode(c2)), a };
    case "hsl": {
      const [r, g, b] = fromHsl(c0, c1, c2);

      return { r: clamp(r), g: clamp(g), b: clamp(b), a };
    }
    case "oklab":
    case "oklch": {
      const [lr, lg, lb] = color.colorSpace === "oklab" ? fromOklab(c0, c1, c2) : fromOklab(c0, c1 * Math.cos((c2 * Math.PI) / 180), c1 * Math.sin((c2 * Math.PI) / 180));

      return { r: clamp(encode(lr)), g: clamp(encode(lg)), b: clamp(encode(lb)), a };
    }
    case "display-p3": {
      const [lr, lg, lb] = fromDisplayP3(c0, c1, c2);

      return { r: clamp(encode(lr)), g: clamp(encode(lg)), b: clamp(encode(lb)), a };
    }
    default:
      throw new Error(`the color space "${color.colorSpace}" is not one this package converts (srgb, srgb-linear, hsl, oklab, oklch, display-p3)`);
  }
};

const byte = (value: number): string =>
  Math.round(clamp(value) * 255)
    .toString(16)
    .padStart(2, "0");

const number = (value: number): string => String(Math.round(value * 10000) / 10000);

/** The color as CSS: `#rrggbb` (or `#rrggbbaa`) for sRGB, and the space's own function for the others, so a wide-gamut color is not narrowed on the web. */
export const toCss = (color: DtcgColor): string => {
  const c = color.components.map((each) => (each === "none" ? "none" : number(each)));
  const alpha = color.alpha === undefined || color.alpha === 1 ? "" : ` / ${number(color.alpha)}`;

  switch (color.colorSpace) {
    case "srgb": {
      const rgb = toRgb(color);

      return `#${byte(rgb.r)}${byte(rgb.g)}${byte(rgb.b)}${rgb.a === 1 ? "" : byte(rgb.a)}`;
    }
    case "oklch":
    case "oklab":
      return `${color.colorSpace}(${c.join(" ")}${alpha})`;
    case "hsl":
      return `hsl(${c[0]} ${c[1]}% ${c[2]}%${alpha})`;
    case "display-p3":
    case "srgb-linear":
      return `color(${color.colorSpace} ${c.join(" ")}${alpha})`;
    default:
      throw new Error(`the color space "${color.colorSpace}" is not one this package converts`);
  }
};
