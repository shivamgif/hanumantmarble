import test from 'node:test';
import assert from 'node:assert/strict';
import { phoneKey } from './stock-customer-match.mjs';

test('phoneKey reduces every common format to ten digits', () => {
  for (const p of ['9876543210', '+91 9876543210', '+91-98765 43210', '09876543210', '919876543210']) {
    assert.equal(phoneKey(p), '9876543210', p);
  }
});

test('phoneKey keeps typo numbers whole instead of truncating them into a match', () => {
  assert.equal(phoneKey('94155391086'), '94155391086');
  assert.equal(phoneKey('+91 953910125'), '91953910125');
  assert.equal(phoneKey(''), '');
  assert.equal(phoneKey(null), '');
});
