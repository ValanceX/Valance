// The size an image file says it has, read from its header, so a page can reserve the room before the image arrives (an `<img>` with no width and height makes the page jump when it loads: layout shift).
// PNG, GIF, JPEG, WebP and SVG; anything else (or a file that is not what its name says) has no size, and the page simply does not reserve.

export interface Size {
  readonly width: number;
  readonly height: number;
}

const png = (b: Buffer): Size | undefined => (b.length >= 24 && b.toString("latin1", 1, 4) === "PNG" ? { width: b.readUInt32BE(16), height: b.readUInt32BE(20) } : undefined);
const gif = (b: Buffer): Size | undefined => (b.length >= 10 && b.toString("latin1", 0, 3) === "GIF" ? { width: b.readUInt16LE(6), height: b.readUInt16LE(8) } : undefined);

const jpeg = (b: Buffer): Size | undefined => {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) {
    return undefined;
  }

  let at = 2;

  while (at + 9 < b.length) {
    if (b[at] !== 0xff) {
      at += 1;
      continue;
    }

    const marker = b[at + 1]!;

    // start-of-frame markers (not DHT, JPG, DAC) carry the size
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: b.readUInt16BE(at + 5), width: b.readUInt16BE(at + 7) };
    }

    at += 2 + (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01 ? 0 : b.readUInt16BE(at + 2));
  }

  return undefined;
};

const webp = (b: Buffer): Size | undefined => {
  if (b.length < 30 || b.toString("latin1", 0, 4) !== "RIFF" || b.toString("latin1", 8, 12) !== "WEBP") {
    return undefined;
  }

  const kind = b.toString("latin1", 12, 16);

  if (kind === "VP8X") {
    return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
  }
  if (kind === "VP8L") {
    const bits = b.readUInt32LE(21);

    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
  }
  if (kind === "VP8 ") {
    return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  }

  return undefined;
};

/** An SVG says its size by `width` and `height` in pixels, or failing that by its `viewBox`. A size in other units (`50%`, `10em`) is not a pixel size, so the viewBox's proportions are used when there is one. */
const svg = (b: Buffer): Size | undefined => {
  const head = /<svg\b[^>]*>/i.exec(b.toString("utf8", 0, Math.min(b.length, 4096)))?.[0];

  if (head === undefined) {
    return undefined;
  }

  const attribute = (name: string): string | undefined => new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, "i").exec(head)?.[1];
  const pixels = (value: string | undefined): number | undefined =>
    value !== undefined && /^\s*\d+(\.\d+)?(px)?\s*$/.test(value) ? Math.round(Number.parseFloat(value)) : undefined;
  const box = attribute("viewBox")
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  const view = box !== undefined && box.length === 4 && box.every(Number.isFinite) && box[2]! > 0 && box[3]! > 0 ? { width: box[2]!, height: box[3]! } : undefined;
  const width = pixels(attribute("width"));
  const height = pixels(attribute("height"));

  if (width !== undefined && height !== undefined) {
    return { width, height };
  }

  return view === undefined ? undefined : { width: Math.round(view.width), height: Math.round(view.height) };
};

export const imageSize = (bytes: Buffer): Size | undefined => {
  const found = png(bytes) ?? gif(bytes) ?? jpeg(bytes) ?? webp(bytes) ?? svg(bytes);

  return found !== undefined && found.width > 0 && found.height > 0 && found.width <= 65535 && found.height <= 65535 ? found : undefined;
};
