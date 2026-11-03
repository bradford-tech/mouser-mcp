import { createMouser } from "@bradford-tech/mouser-sdk";
import type { MouserClient } from "../src/mouser.js";

/**
 * A Mouser SDK client whose `fetch` is served by `handler`, recording every
 * request. A returned `Response` is passed through; anything else is sent as
 * a JSON body with status 200.
 */
export function mouserWithFetch(
  handler: (req: Request) => unknown,
  keys: { search?: string; order?: string } = {},
): { client: MouserClient; requests: Request[] } {
  const requests: Request[] = [];
  const client = createMouser({ search: "S", order: "O", ...keys });
  client.setConfig({
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = new Request(input, init);
      requests.push(req.clone());
      const body = await handler(req);
      if (body instanceof Response) return body;
      return new Response(JSON.stringify(body ?? {}), {
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch,
  });
  return { client, requests };
}
