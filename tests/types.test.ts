import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { after, test } from 'node:test';
import { promisify } from 'node:util';

const run = promisify(execFile);
const fixture = new URL('fixture/', import.meta.url).pathname;
const dir = new URL('.stale/', import.meta.url).pathname;
const nuxt = `${fixture}node_modules/.bin/nuxt`;

after(() => rmSync(dir, { recursive: true, force: true }));

test('`nuxt typecheck` names a types file from another client and a block without a component', async () => {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir);
  symlinkSync(`${fixture}node_modules`, `${dir}node_modules`);
  cpSync(`${fixture}tsconfig.json`, `${dir}tsconfig.json`);
  writeFileSync(
    `${dir}nuxt.config.ts`,
    "export default defineNuxtConfig({ extends: ['../fixture'] });\n",
  );
  const types = readFileSync(`${fixture}ohne.ts`, 'utf8')
    .replace('protocol: 1;', 'protocol: 2;')
    .replace('export interface Blocks {', 'export interface Blocks {\n  Gallery: {};');
  writeFileSync(`${dir}ohne.ts`, types);
  await run(nuxt, ['prepare'], { cwd: dir });
  const failure = await run(nuxt, ['typecheck'], { cwd: dir }).then(
    () => assert.fail('`nuxt typecheck` passed'),
    (error: { stdout: string; stderr: string }) => error.stdout + error.stderr,
  );
  assert.match(
    failure,
    /ohne\/checks\.ts.*"`ohne\.ts` was written for another version of `@ohnejs\/client`"/,
  );
  assert.match(failure, /ohne\/checks\.ts.*"Block `Gallery` has no component"/);
});
