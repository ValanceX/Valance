import { describe, expect, it } from "vitest";

import { imageSize } from "../src/image-size.js";
import { readContent } from "../src/content.js";
import { loadConfig } from "../src/config.js";
import { afterEach } from "vitest";
import { cleanup, PAGE, project } from "./fixture.js";

afterEach(cleanup);

const png = (width: number, height: number): Buffer => {
  const b = Buffer.alloc(33);

  b.write("\x89PNG\r\n\x1a\n", 0, "latin1");
  b.writeUInt32BE(13, 8);
  b.write("IHDR", 12, "latin1");
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);

  return b;
};

describe("the size an image file says it has", () => {
  it("reads PNG, GIF, JPEG, WebP and SVG, and nothing it is not sure of", () => {
    const gif = Buffer.from("GIF89a", "latin1");
    const gifBytes = Buffer.concat([gif, Buffer.from([0x40, 0x01, 0xf0, 0x00])]);
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x01, 0xe0, 0x02, 0x80, 0x03]);
    const webp = Buffer.alloc(30);

    webp.write("RIFF", 0, "latin1");
    webp.write("WEBP", 8, "latin1");
    webp.write("VP8X", 12, "latin1");
    webp.writeUIntLE(799, 24, 3);
    webp.writeUIntLE(599, 27, 3);

    expect(imageSize(png(120, 80))).toEqual({ width: 120, height: 80 });
    expect(imageSize(gifBytes)).toEqual({ width: 320, height: 240 });
    expect(imageSize(jpeg)).toEqual({ width: 640, height: 480 });
    expect(imageSize(webp)).toEqual({ width: 800, height: 600 });
    expect(imageSize(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="24px" height="12"></svg>'))).toEqual({ width: 24, height: 12 });
    expect(imageSize(Buffer.from('<svg viewBox="0 0 100 50" width="100%"></svg>'))).toEqual({ width: 100, height: 50 });
    expect(imageSize(Buffer.from("<svg></svg>"))).toBeUndefined();
    expect(imageSize(Buffer.from("not an image"))).toBeUndefined();
    expect(imageSize(png(0, 5))).toBeUndefined();
  });

  it("is put on an image block of a page, so the page keeps the room; an image of unknown size has none", () => {
    const root = project({
      "content/index.md": PAGE("Home", "![Logo](/logo.svg)\n\n![Photo](/photo.png)\n\n![Odd](/odd.bin)"),
      "public/logo.svg": '<svg viewBox="0 0 40 20"></svg>',
      "public/photo.png": png(300, 200),
      "public/odd.bin": "????",
    });
    const images = readContent(root, loadConfig(root)).pages[0]!.blocks.filter((block) => block.kind === "image");

    expect(images.map((image) => [image.src, image.width, image.height])).toEqual([
      ["/logo.svg", 40, 20],
      ["/photo.png", 300, 200],
      ["/odd.bin", 0, 0],
    ]);
  });
});
