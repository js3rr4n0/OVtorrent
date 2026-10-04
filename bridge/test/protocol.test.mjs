import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  decodeMessage,
  encodeMessage,
  isValidMagnet,
  normalizeCode,
  pairingInfoHash,
  pairingMagnet,
} from '../src/protocol.mjs';

test('pairing hash is deterministic, case-insensitive and 40 hex chars', () => {
  const a = pairingInfoHash('Casa-1234');
  assert.equal(a, pairingInfoHash(' casa-1234 '));
  assert.match(a, /^[0-9a-f]{40}$/);
  assert.notEqual(a, pairingInfoHash('casa-1235'));
  assert.throws(() => pairingInfoHash('abc'));
  assert.equal(normalizeCode('A B!c-1'), 'abc-1');
});

test('pairing magnet carries the hash and the trackers', () => {
  const m = pairingMagnet('casa-1234', ['wss://a.example']);
  assert.ok(m.startsWith(`magnet:?xt=urn:btih:${pairingInfoHash('casa-1234')}`));
  assert.ok(m.includes('tr=wss%3A%2F%2Fa.example'));
});

test('messages round-trip and invalid input is rejected', () => {
  const buf = encodeMessage({ t: 'add', magnet: 'magnet:?xt=urn:btih:' + 'a'.repeat(40) });
  assert.deepEqual(decodeMessage(buf), {
    t: 'add',
    magnet: 'magnet:?xt=urn:btih:' + 'a'.repeat(40),
  });
  assert.equal(decodeMessage(new TextEncoder().encode('nope')), null);
  assert.equal(decodeMessage(new TextEncoder().encode('{"x":1}')), null);
  assert.ok(isValidMagnet('magnet:?xt=urn:btih:' + 'b'.repeat(40)));
  assert.ok(!isValidMagnet('https://example.org'));
});
