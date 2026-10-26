import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { after, test } from 'node:test';
import { promisify } from 'node:util';

const run = promisify(execFile);
const env = { ...process.env, NO_COLOR: '1' };
const fixture = new URL('fixture/', import.meta.url).pathname;
const dir = new URL('.headers/', import.meta.url).pathname;
const nuxt = `${fixture}node_modules/.bin/nuxt`;

after(() => rmSync(dir, { recursive: true, force: true }));

test('the module refuses to pass a credential or a malformed name in `ohne.headers`', async () => {
  for (const name of ['Cookie', 'authorization', 'x-forwarded-host', 'origin', 'bad header']) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir);
    symlinkSync(`${fixture}node_modules`, `${dir}node_modules`);
    cpSync(`${fixture}tsconfig.json`, `${dir}tsconfig.json`);
    writeFileSync(
      `${dir}nuxt.config.ts`,
      `export default defineNuxtConfig({ extends: ['../fixture'], ohne: { headers: [${JSON.stringify(name)}] } });\n`,
    );
    const failure = await run(nuxt, ['prepare'], { cwd: dir, env }).then(
      () => assert.fail(`\`nuxt prepare\` passed with ${name}`),
      (error: { stdout: string; stderr: string }) => error.stdout + error.stderr,
    );
    const refused = `ohne.headers cannot pass ${name.toLowerCase()} to the API`;
    assert.ok(failure.replaceAll('`', '').includes(refused), failure);
  }
});
