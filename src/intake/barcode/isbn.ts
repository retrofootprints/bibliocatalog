// ISBN validation & normalization helpers, per SPEC §4.1 and §5.2.

/** Strip hyphens/spaces. */
export function cleanIsbn(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase();
}

/** Validate an EAN-13 barcode as a book ISBN-13: correct checksum and 978/979 prefix. */
export function isValidBookEan13(code: string): boolean {
  const digits = cleanIsbn(code);
  if (!/^\d{13}$/.test(digits)) return false;
  if (!(digits.startsWith('978') || digits.startsWith('979'))) return false;
  return isbn13Checksum(digits);
}

export function isbn13Checksum(digits13: string): boolean {
  if (!/^\d{13}$/.test(digits13)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = Number(digits13[i]);
    sum += i % 2 === 0 ? d : d * 3;
  }
  const check = (10 - (sum % 10)) % 10;
  return check === Number(digits13[12]);
}

export function isbn10Checksum(digits10: string): boolean {
  if (!/^\d{9}[\dX]$/.test(digits10)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += (10 - i) * Number(digits10[i]);
  }
  const last = digits10[9] === 'X' ? 10 : Number(digits10[9]);
  sum += last;
  return sum % 11 === 0;
}

/** Convert ISBN-10 to ISBN-13. Assumes valid ISBN-10 input. */
export function isbn10To13(isbn10: string): string {
  const core = '978' + cleanIsbn(isbn10).slice(0, 9);
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = Number(core[i]);
    sum += i % 2 === 0 ? d : d * 3;
  }
  const check = (10 - (sum % 10)) % 10;
  return core + check;
}

/** Convert ISBN-13 (978 prefix only) to ISBN-10. Returns undefined for 979 prefix (no ISBN-10 exists). */
export function isbn13To10(isbn13: string): string | undefined {
  const digits = cleanIsbn(isbn13);
  if (!digits.startsWith('978')) return undefined;
  const core = digits.slice(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += (10 - i) * Number(core[i]);
  }
  const remainder = sum % 11;
  const checkValue = (11 - remainder) % 11;
  const check = checkValue === 10 ? 'X' : String(checkValue);
  return core + check;
}

/** Normalize any ISBN-10 or ISBN-13 string to a clean ISBN-13, if valid. */
export function normalizeToIsbn13(raw: string): string | undefined {
  const digits = cleanIsbn(raw);
  if (/^\d{13}$/.test(digits) && isbn13Checksum(digits)) return digits;
  if (/^\d{9}[\dX]$/.test(digits) && isbn10Checksum(digits)) return isbn10To13(digits);
  return undefined;
}
