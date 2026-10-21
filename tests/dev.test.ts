import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { after, test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';

import { startAPI } from './api.ts';
import { freePort } from './site.ts';

const dir = new URL('dev/', import.meta.url).pathname;
const nuxt = new URL('fixture/node_modules/.bin/nuxt', import.meta.url).pathname;
let api: Awaited<ReturnType<typeof startAPI>>;
let dev: ChildProcess;

after(() => {
  dev?.kill();
  api?.close();
});

test(
  '`nuxt dev` renders a scoped wrapper of `OhneBlocks` without a warning',
  { timeout: 120_000 },
  async () => {
    api = await startAPI('');
    const port = await freePort();
    dev = spawn(nuxt, ['dev', '--port', String(port), '--host', '127.0.0.1'], {
      cwd: dir,
      env: { ...process.env, NUXT_OHNE_API: api.origin },
      stdio: 'ignore',
    });
    let html = '';
    while (!html.includes('data-ohne-block')) {
      await sleep(500);
      html = await fetch(`http://127.0.0.1:${port}/about`).then(
        (response) => response.text(),
        () => '',
      );
    }
    assert.match(html, /Failed to resolve component: BlocksUnknown/);
    assert.equal(html.match(/Extraneous non-props attributes[^"]*/)?.[0], undefined);
  },
);
