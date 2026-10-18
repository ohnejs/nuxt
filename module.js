import { existsSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import {
  addComponent,
  addImports,
  addPlugin,
  addRouteMiddleware,
  addServerHandler,
  addTemplate,
  addTypeTemplate,
  createResolver,
  defineNuxtModule,
} from 'nuxt/kit';

const BLOCK = /^Blocks(?=[A-Z])/;

export default defineNuxtModule({
  meta: { name: '@ohnejs/nuxt', configKey: 'ohne', compatibility: { nuxt: '>=4.5.0' } },
  defaults: { api: '', types: 'ohne.ts' },
  setup(options, nuxt) {
    const { resolve } = createResolver(import.meta.url);
    nuxt.options.runtimeConfig.ohne = {
      api: options.api,
      .../** @type {object} */ (nuxt.options.runtimeConfig.ohne),
    };
    // Vite would discover the client on the first page in dev, then reload the page.
    ((nuxt.options.vite.optimizeDeps ??= {}).include ??= []).push('@ohnejs/client');

    const composables = resolve('runtime/composables.js');
    addImports(
      ['useOhne', 'useOhnePage', 'useOhneToken'].map((name) => ({ name, from: composables })),
    );
    addRouteMiddleware({ name: 'ohne', path: resolve('runtime/middleware.js') });
    addPlugin(resolve('runtime/plugin.js'));
    const components = resolve('runtime/components.js');
    for (const name of ['OhneBlocks', 'OhneLink', 'OhneRichText']) {
      addComponent({ name, export: name, filePath: components });
    }
    const handler = resolve('runtime/server.js');
    for (const route of ['/_ohne/**', '/sitemap.xml', '/robots.txt']) {
      addServerHandler({ route, handler });
    }

    const blocks = new Set();
    nuxt.hook('components:extend', (list) => {
      blocks.clear();
      for (const component of list) {
        if (!BLOCK.test(component.pascalName)) continue;
        component.global = true;
        blocks.add(component.pascalName.replace(BLOCK, ''));
      }
    });

    const types = resolvePath(nuxt.options.rootDir, options.types);
    if (!existsSync(types)) {
      // The cms may write the file after `nuxt dev` starts; a restart then types every page.
      nuxt.options.watch.push(types);
      return;
    }
    const from = JSON.stringify(types.replace(/\.ts$/, ''));
    addTypeTemplate({
      filename: 'types/ohne.d.ts',
      getContents: () =>
        `declare module '@ohnejs/nuxt' {\n  interface Register {\n    cms: import(${from}).CMS;\n  }\n}\n\nexport {};\n`,
    });
    const stale = JSON.stringify(
      `\`${options.types}\` was written for another version of \`@ohnejs/client\``,
    );
    // A `.ts`, since `skipLibCheck` would hide the error in a `.d.ts`.
    const check = addTemplate({
      filename: 'ohne/checks.ts',
      write: true,
      getContents: () => {
        const covered = [...blocks].map((name) => JSON.stringify(name)).join(' | ') || 'never';
        return [
          "import type { Schema } from '@ohnejs/client';",
          `import type { Blocks, CMS } from ${from};`,
          '',
          `type Missing = Exclude<keyof Blocks, ${covered}>;`,
          '',
          `export const schema: CMS extends Schema ? true : ${stale} = true;`,
          'export const blocks: [Missing] extends [never] ? true : `Block \\`${Missing}\\` has no component` = true;',
          '',
        ].join('\n');
      },
    });
    nuxt.hook('prepare:types', ({ tsConfig }) => {
      (tsConfig.include ??= []).push(check.dst);
    });
  },
});
