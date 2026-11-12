/**
 * RTF escape/unescape utilities.
 *
 * RTF (Rich Text Format) uses backslash escapes for special characters. The
 * tricky part is that RTF is byte-oriented and uses a 7-bit ASCII character
 * set; any character outside that set must be encoded as a Unicode escape
 * (\uN) followed by a fallback character (usually '?') for readers that do
 * not understand the Unicode escape. This module handles both directions.
 *
 * Design decision: we treat the input as a JavaScript string (UTF-16 code
 * units). When escaping, any code unit >= 0x80 is emitted as \uN where N is
 * the signed decimal value of the code unit. RTF's \uN uses signed 16-bit
 * values, so values above 32767 are represented as negative numbers. We
 * follow that convention exactly, because RTF readers expect it.
 *
 * When unescaping, we parse \uN and skip the fallback character that follows.
 * If the fallback is missing we still decode the Unicode escape, because some
 * producers omit it. This is a deliberate leniency: real-world RTF is messy,
 * and refusing to decode a missing fallback would make the library useless
 * for files that are otherwise valid.
 */

/**
 * Characters that have special meaning in RTF and their escape sequences.
 * Backslash and braces are the structural characters; the others are
 * control words that must not appear literally in text.
 */
export const SPECIAL_CHARS = ['\\', '{', '}'];

/**
 * Map of literal characters to their RTF escape sequences.
 * Backslash must be escaped first to avoid double-escaping.
 */
export const RTF_ESCAPE_MAP = new Map([
  ['\\', '\\\\'],
  ['{', '\\{'],
  ['}', '\\}'],
]);

/**
 * Reverse map for unescaping. Built from RTF_ESCAPE_MAP.
 */
export const RTF_UNESCAPE_MAP = new Map(
  [...RTF_ESCAPE_MAP].map(([char, seq]) => [seq, char])
);

/**
 * Encode a code unit as an RTF Unicode escape with a fallback character.
 *
 * @param {number} codeUnit - A UTF-16 code unit (0..65535).
 * @param {string} [fallback='?'] - The fallback character for readers that
 *   do not understand \uN. Must be a single ASCII character.
 * @returns {string} The escape sequence, e.g. '\\u8364?' for the euro sign.
 */
export function escapeUnicodeFallback(codeUnit, fallback = '?') {
  if (typeof codeUnit !== 'number' || !Number.isInteger(codeUnit)) {
    throw new TypeError('codeUnit must be an integer');
  }
  if (codeUnit < 0 || codeUnit > 0xffff) {
    throw new RangeError('codeUnit must be in range 0..65535');
  }
  if (typeof fallback !== 'string' || fallback.length !== 1) {
    throw new TypeError('fallback must be a single character');
  }
  if (fallback.charCodeAt(0) > 0x7f) {
    throw new RangeError('fallback must be an ASCII character');
  }
  // RTF uses signed 16-bit values for \uN.
  const signed = codeUnit > 0x7fff ? codeUnit - 0x10000 : codeUnit;
  return `\\u${signed}${fallback}`;
}

/**
 * Decode the first RTF Unicode escape in a string, if present.
 *
 * @param {string} text - Text that may start with \uN followed by a fallback.
 * @returns {{codeUnit: number, fallback: string, length: number} | null}
 *   The decoded code unit, the fallback character (or '' if absent), and the
 *   number of characters consumed. Returns null if no escape is found.
 */
export function unescapeUnicodeFallback(text) {
  if (typeof text !== 'string') {
    throw new TypeError('text must be a string');
  }
  const match = /^\\u(-?\d+)(.)?/.exec(text);
  if (!match) {
    return null;
  }
  const value = Number(match[1]);
  if (!Number.isInteger(value) || value < -32768 || value > 32767) {
    return null;
  }
  // Convert signed back to unsigned code unit.
  const codeUnit = value < 0 ? value + 0x10000 : value;
  const fallback = match[2] || '';
  return { codeUnit, fallback, length: match[0].length };
}

/**
 * Escape a string for use as RTF text.
 *
 * Escapes backslash, braces, and any character outside the printable ASCII
 * range (0x20..0x7e) as \uN with a fallback. Newlines are converted to
 * \par because RTF ignores literal newlines in text.
 *
 * @param {string} text - The plain text to escape.
 * @param {string} [fallback='?'] - Fallback character for Unicode escapes.
 * @returns {string} The escaped RTF text.
 */
export function escapeRtf(text, fallback = '?') {
  if (typeof text !== 'string') {
    throw new TypeError('text must be a string');
  }
  let result = '';
  for (const char of text) {
    const code = char.codePointAt(0);
    if (char === '\n') {
      result += '\\par ';
    } else if (char === '\r') {
      // Ignore carriage returns; \par handles the line break.
      continue;
    } else if (char === '\t') {
      result += '\\tab ';
    } else if (RTF_ESCAPE_MAP.has(char)) {
      result += RTF_ESCAPE_MAP.get(char);
    } else if (code < 0x20 || code > 0x7e) {
      // Encode as UTF-16 code units. For characters outside the BMP we
      // emit two escapes (surrogate pair), which is what RTF expects.
      for (let i = 0; i < char.length; i++) {
        result += escapeUnicodeFallback(char.charCodeAt(i), fallback);
      }
    } else {
      result += char;
    }
  }
  return result;
}

/**
 * Unescape RTF text back to a plain string.
 *
 * Handles \\, \{, \}, \uN (with optional fallback), \par, and \tab.
 * Unknown control words are skipped along with their trailing space.
 *
 * @param {string} rtf - The RTF text to unescape.
 * @returns {string} The decoded plain text.
 */
export function unescapeRtf(rtf) {
  if (typeof rtf !== 'string') {
    throw new TypeError('rtf must be a string');
  }
  let result = '';
  let i = 0;
  while (i < rtf.length) {
    const char = rtf[i];
    if (char === '\\') {
      // Check for Unicode escape first.
      const unicode = unescapeUnicodeFallback(rtf.slice(i));
      if (unicode) {
        result += String.fromCharCode(unicode.codeUnit);
        i += unicode.length;
        continue;
      }
      // Check for escaped special characters.
      const next = rtf[i + 1];
      if (next === '\\' || next === '{' || next === '}') {
        result += next;
        i += 2;
        continue;
      }
      // Control word: \letters followed by optional space.
      const controlMatch = /^\\([a-z]+)(-?\d+)? ?/i.exec(rtf.slice(i));
      if (controlMatch) {
        const word = controlMatch[1].toLowerCase();
        if (word === 'par') {
          result += '\n';
        } else if (word === 'tab') {
          result += '\t';
        }
        // Other control words are ignored.
        i += controlMatch[0].length;
        continue;
      }
      // Lone backslash at end of string or before unknown char: skip it.
      i += 1;
    } else if (char === '{' || char === '}') {
      // Braces are structural; skip them in plain text extraction.
      i += 1;
    } else {
      result += char;
      i += 1;
    }
  }
  return result;
}
