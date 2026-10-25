import assert from 'node:assert/strict';
import { test } from 'node:test';

import { sandboxCookie } from '../runtime/sandbox.js';

test('`sandboxCookie` passes only the named cookie, in the shape of a sandbox id', () => {
  const header = 'session=s1; ohne_sandbox=Ab_9-z; other=1';
  assert.equal(sandboxCookie('ohne_sandbox', header), 'ohne_sandbox=Ab_9-z');
  assert.equal(sandboxCookie('ohne_sandbox', 'ohne_sandbox=a1;session=s1'), 'ohne_sandbox=a1');
  assert.equal(sandboxCookie('ohne_sandbox', `ohne_sandbox=${'a'.repeat(64)}`)?.length, 77);
});

test('`sandboxCookie` binds nothing outside a demo or for a value of another shape', () => {
  for (const [name, header] of [
    ['', 'ohne_sandbox=a1'],
    ['ohne_sandbox', undefined],
    ['ohne_sandbox', 'session=s1'],
    ['ohne_sandbox', 'xohne_sandbox=a1'],
    ['ohne_sandbox', 'ohne_sandbox'],
    ['ohne_sandbox', 'ohne_sandbox='],
    ['ohne_sandbox', 'ohne_sandbox="a1"'],
    ['ohne_sandbox', 'ohne_sandbox=a%0D%0Aauthorization:x'],
    ['ohne_sandbox', `ohne_sandbox=${'a'.repeat(65)}`],
    ['ohne_sandbox', 'ohne_sandbox=a b; ohne_sandbox=a1'],
  ] as const) {
    assert.equal(sandboxCookie(name, header), undefined, String(header));
  }
});
