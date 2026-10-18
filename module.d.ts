import type { Schema, UntypedSchema } from '@ohnejs/client';
import type { NuxtModule } from 'nuxt/schema';

/**
 * The `ohne` key of `nuxt.config.ts`.
 */
export interface ModuleOptions {
  /**
   * The origin of your ohne API, like `'https://api.example.com'`.
   * Only the server reads it, so it may be an address on a private network.
   * The browser reads through the site's own `/_ohne` routes instead.
   * `NUXT_OHNE_API` replaces it when the server starts.
   */
  api: string;

  /**
   * The types file the cms writes, relative to the Nuxt root.
   * Its `CMS` types every page; while the file is missing, pages read untyped.
   *
   * @default
   * 'ohne.ts'
   */
  types?: string;
}

/**
 * Holds your `CMS` under `cms`.
 * The module fills it from your types file, so you never write it.
 */
export interface Register {}

/**
 * Your `CMS`, or `UntypedSchema` while there is no types file.
 * A types file from another version of `@ohnejs/client` reads untyped too, and `nuxt typecheck` names it.
 */
export type RegisteredCMS = Register extends { cms: infer S extends Schema } ? S : UntypedSchema;

/**
 * Renders the pages of an ohne CMS: it resolves each path, fills the `<head>`, and joins the live preview.
 * List it in `modules` and name your API under `ohne`.
 *
 * @example
 * ```ts
 * export default defineNuxtConfig({
 *   modules: ['@ohnejs/nuxt'],
 *   ohne: { api: 'http://localhost:9001' },
 * })
 * ```
 */
declare const module: NuxtModule<ModuleOptions>;

export default module;
