// The slug of a piece of text: lower case, letters and digits, joined by single hyphens. A heading's anchor and a tag's address are made the same way, on the build and in the browser.
export const slug = (text: string): string => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
