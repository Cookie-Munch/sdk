/** What the Node framework adapters share: which paths the handlers own, and Node headers as fetch Headers. */

// The same tail createRightsHandlers routes on; anything else is not ours and is never read.
export const OWNED = /\/(lookup|requests)(?:\/[^/]+(?:\/(cancel|run))?)?\/*$/;

export function headersOf(raw: Record<string, string | string[] | undefined>): Headers {
  const headers = new Headers();
  for (const [k, v] of Object.entries(raw)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      if (k.toLowerCase() === 'set-cookie') for (const one of v) headers.append(k, one);
      else headers.set(k, v.join(', '));
    } else headers.set(k, v);
  }
  return headers;
}
