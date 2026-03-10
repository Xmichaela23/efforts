/**
 * Shim that replaces @supabase/node-fetch with the browser's native fetch.
 * The Supabase client imports @supabase/node-fetch and its XHR polyfill runs
 * at module load time, which fails on iOS WKWebView with:
 *   "XMLHttpRequest.onreadystatechange getter can only be called on instances
 *    of XMLHttpRequest"
 * By aliasing the package to this shim, Vite never bundles that XHR code.
 */

export default fetch.bind(globalThis);
export const Headers = globalThis.Headers;
export const Request = globalThis.Request;
export const Response = globalThis.Response;
export const AbortController = globalThis.AbortController;
export const FormData = globalThis.FormData;
export const Blob = globalThis.Blob;
export const File = globalThis.File;
