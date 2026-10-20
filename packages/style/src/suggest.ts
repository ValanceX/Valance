// "Did you mean": the nearest of some names to a word, when one is near enough to be a slip of the keyboard.
const distance = (a: string, b: string): number => {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = row[0]!;

    row[0] = i;

    for (let j = 1; j <= b.length; j += 1) {
      const above = row[j]!;

      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }

  return row[b.length]!;
};

export const nearest = (word: string, names: ReadonlyArray<string>): string | undefined => {
  const ranked = names.map((name) => ({ name, d: distance(word, name) })).sort((x, y) => x.d - y.d)[0];

  return ranked !== undefined && ranked.d <= Math.max(2, Math.floor(word.length / 3)) ? ranked.name : undefined;
};

export const didYouMean = (word: string, names: ReadonlyArray<string>): string => {
  const found = nearest(word, names);

  return found === undefined ? "" : ` (did you mean "${found}"?)`;
};
