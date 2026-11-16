# rtf-escape-tools

Escapes and unescapes special characters in Rich Text Format, including Unicode fallback escapes.

```js
import { escapeRtf, unescapeRtf } from './src/index.js';

const escaped = escapeRtf('Hello, {world}!');
// 'Hello, \\{world\\}!'

const plain = unescapeRtf(escaped);
// 'Hello, {world}!'
```

The library exports `escapeRtf`, `unescapeRtf`, `escapeUnicodeFallback`, `unescapeUnicodeFallback`, `SPECIAL_CHARS`, `RTF_ESCAPE_MAP`, and `RTF_UNESCAPE_MAP`.

## Why this exists

RTF is a 1980s byte-oriented format that predates Unicode. Text outside the printable ASCII range must be written as `\uN` followed by a fallback character for readers that do not understand the escape. Getting this right means handling signed 16-bit values, surrogate pairs, and structural characters that would otherwise break the document. Most quick-and-dirty escapers either miss the fallback or double-escape backslashes. This library does one thing: it converts between plain JavaScript strings and RTF-safe text, with a clear rule for every character.

The trade-off: `unescapeRtf` is lenient. If a `\uN` escape is missing its fallback character, the decoder still produces the Unicode character rather than rejecting the input. Real RTF files are frequently malformed, and a strict parser would be less useful. The cost is that a bare `\uN` sequence that was never meant as a Unicode escape will be decoded anyway.

## The awkward edge

Supplementary characters (those outside the Basic Multilingual Plane, such as emoji) are encoded as two `\uN` escapes representing the UTF-16 surrogate pair. A decoder that treats each escape independently will produce two code units that combine into the correct character, but any code that expects one escape per character will be surprised. The round-trip works, but the intermediate RTF contains two escapes for one visible character.

## Performance

The window keeps a bounded buffer, so `push` is constant time and memory does not
grow with the length of the stream. `peak` and `trough` are linear in the window
size, which is the trade that keeps `push` cheap.

