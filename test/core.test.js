import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeRtf,
  unescapeRtf,
  escapeUnicodeFallback,
  unescapeUnicodeFallback,
  SPECIAL_CHARS,
  RTF_ESCAPE_MAP,
  RTF_UNESCAPE_MAP,
} from '../src/index.js';

test('escapeRtf escapes backslash, braces', () => {
  assert.equal(escapeRtf('a\\b{c}d'), 'a\\\\b\\{c\\}d');
});

test('escapeRtf leaves plain ASCII unchanged', () => {
  assert.equal(escapeRtf('Hello, world!'), 'Hello, world!');
});

test('escapeRtf encodes non-ASCII as unicode fallback', () => {
  assert.equal(escapeRtf('é'), '\\u233?');
});

test('escapeRtf encodes supplementary characters as surrogate pair', () => {
  // U+1F600 -> surrogate pair D83D DE00
  assert.equal(escapeRtf('😀'), '\\u-10179?\\u-8704?');
});

test('escapeRtf converts newline to par and tab to tab', () => {
  assert.equal(escapeRtf('a\nb\tc'), 'a\\par b\\tab c');
});

test('escapeRtf ignores carriage returns', () => {
  assert.equal(escapeRtf('a\r\nb'), 'a\\par b');
});

test('escapeUnicodeFallback handles BMP and signed values', () => {
  assert.equal(escapeUnicodeFallback(0x20ac), '\\u8364?');
  assert.equal(escapeUnicodeFallback(0xffff), '\\u-1?');
});

test('escapeUnicodeFallback rejects invalid input', () => {
  assert.throws(() => escapeUnicodeFallback(0x10000), RangeError);
  assert.throws(() => escapeUnicodeFallback(-1), RangeError);
  assert.throws(() => escapeUnicodeFallback('a'), TypeError);
  assert.throws(() => escapeUnicodeFallback(65, 'é'), RangeError);
});

test('unescapeUnicodeFallback parses signed and unsigned values', () => {
  assert.deepEqual(unescapeUnicodeFallback('\\u8364?'), {
    codeUnit: 0x20ac,
    fallback: '?',
    length: 7,
  });
  assert.deepEqual(unescapeUnicodeFallback('\\u-1?'), {
    codeUnit: 0xffff,
    fallback: '?',
    length: 5,
  });
});

test('unescapeUnicodeFallback handles missing fallback', () => {
  assert.deepEqual(unescapeUnicodeFallback('\\u233'), {
    codeUnit: 0xe9,
    fallback: '',
    length: 5,
  });
});

test('unescapeUnicodeFallback returns null for non-escapes', () => {
  assert.equal(unescapeUnicodeFallback('hello'), null);
  assert.equal(unescapeUnicodeFallback('\\u99999'), null);
});

test('unescapeRtf reverses escapeRtf for BMP text', () => {
  const original = 'a\\b{c}d é 😀';
  const escaped = escapeRtf(original);
  assert.equal(unescapeRtf(escaped), original);
});

test('unescapeRtf decodes par and tab', () => {
  assert.equal(unescapeRtf('a\\par b\\tab c'), 'a\nb\tc');
});

test('unescapeRtf skips unknown control words', () => {
  assert.equal(unescapeRtf('a\\bogus b'), 'ab');
});

test('unescapeRtf handles escaped braces and backslashes', () => {
  assert.equal(unescapeRtf('\\{a\\}\\\\b'), '{a}\\b');
});

test('unescapeRtf ignores structural braces', () => {
  assert.equal(unescapeRtf('{a}b'), 'ab');
});

test('maps are consistent', () => {
  for (const [char, seq] of RTF_ESCAPE_MAP) {
    assert.equal(RTF_UNESCAPE_MAP.get(seq), char);
  }
  assert.deepEqual(SPECIAL_CHARS, ['\\', '{', '}']);
});

test('round-trip with custom fallback', () => {
  const original = 'xé';
  const escaped = escapeRtf(original, '#');
  assert.equal(escaped, 'x\\u233#');
  assert.equal(unescapeRtf(escaped), original);
});

test('unescapeRtf handles lone backslash at end', () => {
  assert.equal(unescapeRtf('abc\\'), 'abc');
});

test('escapeRtf throws on non-string', () => {
  assert.throws(() => escapeRtf(42), TypeError);
  assert.throws(() => unescapeRtf(null), TypeError);
});
