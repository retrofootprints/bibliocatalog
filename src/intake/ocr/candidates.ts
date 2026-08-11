// Turn raw OCR output into something worth sending to a metadata provider.
//
// Spine OCR produces short, noisy strings: stray punctuation from decoration,
// publisher logos read as letters, single characters from the shelf edge. The
// goal here is a query string, not a faithful transcript.

/** Below this many letters there is nothing a title search could match on. */
const MIN_USABLE_LETTERS = 4;

export function cleanSpineText(raw: string): string {
  return raw
    .split(/\r?\n/)
    .map((line) =>
      line
        // Keep letters, digits, spaces and the punctuation that shows up inside
        // real titles; drop OCR debris like |, ~, ¥, box-drawing characters.
        .replace(/[^\p{L}\p{N}\s'’\-.,:&]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((line) => line.replace(/[^\p{L}\p{N}]/gu, '').length >= 2)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isUsable(cleaned: string): boolean {
  return cleaned.replace(/[^\p{L}]/gu, '').length >= MIN_USABLE_LETTERS;
}
