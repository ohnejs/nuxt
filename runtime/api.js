/**
 * The path of an API address without its trailing slash, or `''` when it has none.
 *
 * @example
 * ```ts
 * apiPath('http://127.0.0.1:7401/api/') // -> '/api'
 * apiPath('http://127.0.0.1:7401')      // -> ''
 * apiPath('/api')                       // -> ''
 * ```
 *
 * @param {string} api
 */
export function apiPath(api) {
  return (URL.parse(api)?.pathname ?? '').replace(/\/+$/, '');
}
