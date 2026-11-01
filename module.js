import { existsSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import {
  addComponent,
  addImports,
  addPlugin,
  addRouteMiddleware,
  addServerHandler,
  addServerPlugin,
  addTemplate,
  addTypeTemplate,
  createResolver,
  defineNuxtModule,
} from 'nuxt/kit';

import { apiPath } from './runtime/api.js';

const BLOCK = /^Blocks(?=[A-Z])/;
const TOKEN = /^[!#$%&'*+.^_`|~0-9a-z-]+$/;
const UNRELAYED =
  /^(?:authorization|cookie|host|ohne-preview|origin|proxy-authorization|x-forwarded-.*)$/;

export default defineNuxtModule({
  meta: { name: '@ohnejs/nuxt', configKey: 'ohne', compatibility: { nuxt: '>=4.5.0' } },
  defaults: {
    api: '',
    types: 'ohne.ts',
    sandbox: '',
    headers: /** @type {string[]} */ ([]),
    cms: true,
  },
  setup(options, nuxt) {
    const { resolve } = createResolver(import.meta.url);
    const headers = options.headers.map((name) => name.toLowerCase());
    const refused = headers.find((name) => !TOKEN.test(name) || UNRELAYED.test(name));
    if (refused !== undefined) {
      throw new Error(
        `\`ohne.headers\` cannot pass \`${refused}\` to the API. Name the headers your API's middleware reads, like \`'recaptcha-token'\`.`,
      );
    }
    nuxt.options.runtimeConfig.ohne = {
      api: options.api,
      sandbox: options.sandbox,
      headers,
      .../** @type {object} */ (nuxt.options.runtimeConfig.ohne),
    };
    // Vite would discover the client on the first page in dev, then reload the page.
    ((nuxt.options.vite.optimizeDeps ??= {}).include ??= []).push('@ohnejs/client');

    const composables = resolve('runtime/composables.js');
    addServerPlugin(resolve('runtime/nitro.js'));
    const blocks = new Set();
    if (options.cms) {
      addImports(
        ['useOhne', 'useOhnePage', 'useOhneToken', 'useOhneRead', 'useOhneList'].map((name) => ({
          name,
          from: composables,
        })),
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
      nuxt.hook('nitro:config', (config) => {
        const nitro = /** @type {{ errorHandler?: string | string[] }} */ (config);
        nitro.errorHandler = [resolve('runtime/error.js'), ...[nitro.errorHandler ?? []].flat()];
      });
      nuxt.hook('components:extend', (list) => {
        blocks.clear();
        for (const component of list) {
          if (!BLOCK.test(component.pascalName)) continue;
          component.global = true;
          blocks.add(component.pascalName.replace(BLOCK, ''));
        }
      });
    } else {
      const path = apiPath(options.api);
      if (!path) {
        throw new Error(
          `\`ohne.api\` has no path, which the browser calls your API at with \`cms: false\`. Set \`api.basePath\` in your API's \`ohne.config.ts\`, like \`'/api'\`, and name it here, like \`'http://127.0.0.1:9001/api'\`.`,
        );
      }
      nuxt.options.runtimeConfig.public.ohne = { path };
      // In production the edge serves the API's path on the site.
      nuxt.hook('nitro:config', (config) => {
        const nitro = /** @type {{ devProxy?: Record<string, { target: string }> }} */ (config);
        (nitro.devProxy ??= {})[path] = { target: process.env.NUXT_OHNE_API || options.api };
      });
      addImports({ name: 'useOhneAPI', from: composables });
    }

    const types = resolvePath(nuxt.options.rootDir, options.types);
    if (!existsSync(types)) {
      // The backend may write the file after `nuxt dev` starts; a restart then types it.
      nuxt.options.watch.push(types);
      return;
    }
    const from = JSON.stringify(types.replace(/\.ts$/, ''));
    const [slot, type] = options.cms ? ['cms', 'CMS'] : ['routes', 'Routes'];
    addTypeTemplate({
      filename: 'types/ohne.d.ts',
      getContents: () =>
        `declare module '@ohnejs/nuxt' {\n  interface Register {\n    ${slot}: import(${from}).${type};\n  }\n}\n\nexport {};\n`,
    });
    const stale = JSON.stringify(
      `\`${options.types}\` was written for another version of \`@ohnejs/client\``,
    );
    // A `.ts`, since `skipLibCheck` would hide the error in a `.d.ts`.
    const check = addTemplate({
      filename: 'ohne/checks.ts',
      write: true,
      getContents: () => {
        if (!options.cms) {
          return [
            "import type { RouteMap } from '@ohnejs/client';",
            `import type { Routes } from ${from};`,
            '',
            `export const routes: Routes extends RouteMap ? true : ${stale} = true;`,
            '',
          ].join('\n');
        }
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
