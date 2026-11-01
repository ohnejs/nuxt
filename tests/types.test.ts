import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { after, test } from 'node:test';
import { promisify } from 'node:util';

const run = promisify(execFile);
const env = { ...process.env, NO_COLOR: '1' };
const fixture = new URL('fixture/', import.meta.url).pathname;
const dir = new URL('.stale/', import.meta.url).pathname;
const nuxt = `${fixture}node_modules/.bin/nuxt`;

after(() => rmSync(dir, { recursive: true, force: true }));

/**
 * What a `nuxt typecheck` that must fail prints, for an app extending `layer` with `types` as its types file.
 */
async function failedTypecheck(layer: string, types: string) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir);
  symlinkSync(`${fixture}node_modules`, `${dir}node_modules`);
  cpSync(`${fixture}tsconfig.json`, `${dir}tsconfig.json`);
  writeFileSync(
    `${dir}nuxt.config.ts`,
    `export default defineNuxtConfig({ extends: ['../${layer}'] });\n`,
  );
  writeFileSync(`${dir}ohne.ts`, types);
  await run(nuxt, ['prepare'], { cwd: dir });
  return run(nuxt, ['typecheck'], { cwd: dir, env }).then(
    () => assert.fail('`nuxt typecheck` passed'),
    (error: { stdout: string; stderr: string }) => error.stdout + error.stderr,
  );
}

test('`nuxt typecheck` names a types file from another client and a block without a component', async () => {
  const failure = await failedTypecheck(
    'fixture',
    readFileSync(`${fixture}ohne.ts`, 'utf8')
      .replace('protocol: 1;', 'protocol: 2;')
      .replace('export interface Blocks {', 'export interface Blocks {\n  Gallery: {};'),
  );
  assert.match(
    failure,
    /ohne\/checks\.ts.*"`ohne\.ts` was written for another version of `@ohnejs\/client`"/,
  );
  assert.match(failure, /ohne\/checks\.ts.*"Block `Gallery` has no component"/);
});

test('with `cms: false`, `nuxt typecheck` names a types file from another client', async () => {
  const failure = await failedTypecheck('routes', "export type Routes = { 'GET /sites': true };\n");
  assert.match(
    failure,
    /ohne\/checks\.ts.*"`ohne\.ts` was written for another version of `@ohnejs\/client`"/,
  );
});
