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

/**
 * The output of a `nuxt prepare` that must fail, for an app extending `layer` with `ohne` as its options.
 */
async function refusal(layer: string, ohne: object) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir);
  symlinkSync(`${fixture}node_modules`, `${dir}node_modules`);
  cpSync(`${fixture}tsconfig.json`, `${dir}tsconfig.json`);
  writeFileSync(
    `${dir}nuxt.config.ts`,
    `export default defineNuxtConfig({ extends: ['../${layer}'], ohne: ${JSON.stringify(ohne)} });\n`,
  );
  return run(nuxt, ['prepare'], { cwd: dir, env }).then(
    () => assert.fail(`\`nuxt prepare\` passed with ${JSON.stringify(ohne)}`),
    (error: { stdout: string; stderr: string }) => error.stdout + error.stderr,
  );
}

test('the module refuses to pass a credential or a malformed name in `ohne.headers`', async () => {
  for (const name of ['Cookie', 'authorization', 'x-forwarded-host', 'origin', 'bad header']) {
    const failure = await refusal('fixture', { headers: [name] });
    const refused = `ohne.headers cannot pass ${name.toLowerCase()} to the API`;
    assert.ok(failure.replaceAll('`', '').includes(refused), failure);
  }
});

test('with `cms: false`, the module refuses an `ohne.api` without a path', async () => {
  for (const api of ['http://127.0.0.1:9001', 'http://127.0.0.1:9001/', '/api', '']) {
    const failure = await refusal('routes', { api });
    const refused = 'ohne.api has no path, which the browser calls your API at with cms: false';
    assert.ok(failure.replaceAll('`', '').includes(refused), failure);
    assert.ok(failure.replaceAll('`', '').includes('Set api.basePath in your API'), failure);
  }
});
