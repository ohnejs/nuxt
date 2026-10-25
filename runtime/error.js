/** @import { NitroErrorHandler } from 'nitropack/types' */

/**
 * Lets an error page frame as any other page does, so a preview or a demo can show a `404` or a `502`.
 * Nitro's default answers each error `x-frame-options: DENY`, which no page of the site sends.
 * It runs before Nuxt's own handler and drops that one header, keeping any the app gives its pages.
 *
 * @type {NitroErrorHandler}
 */
export default function keepFraming(_, event) {
  const { res } = event.node;
  const setHeader = res.setHeader.bind(res);
  // Nuxt writes the default's headers before the error page's own, so the first frame header is Nitro's.
  res.setHeader = (name, value) => {
    if (name.toLowerCase() !== 'x-frame-options') return setHeader(name, value);
    res.setHeader = setHeader;
    return res;
  };
}
