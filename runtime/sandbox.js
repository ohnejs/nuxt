const ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * The `cookie` header that binds the API to the visitor's sandbox copy, or `undefined` outside a demo.
 * Only the cookie `name` crosses, and only while its value has a sandbox id's shape.
 * Every other cookie of the visitor, a session among them, stays behind.
 *
 * @example
 * ```ts
 * sandboxCookie('ohne_sandbox', 'session=s; ohne_sandbox=a1') // -> 'ohne_sandbox=a1'
 * sandboxCookie('ohne_sandbox', 'ohne_sandbox=a%0D')          // -> undefined
 * sandboxCookie('', 'ohne_sandbox=a1')                        // -> undefined
 * ```
 *
 * @param {string | undefined} name
 * @param {string | null | undefined} header
 */
export function sandboxCookie(name, header) {
  if (!name || !header) return undefined;
  for (const pair of header.split(';')) {
    const at = pair.indexOf('=');
    if (at === -1 || pair.slice(0, at).trim() !== name) continue;
    const id = pair.slice(at + 1).trim();
    return ID.test(id) ? `${name}=${id}` : undefined;
  }
  return undefined;
}
