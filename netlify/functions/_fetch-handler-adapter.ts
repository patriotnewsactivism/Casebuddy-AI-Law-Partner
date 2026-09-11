import type { Handler, HandlerEvent } from '@netlify/functions';

type FetchHandler = (request: Request) => Promise<Response>;

/** Adapt the repository's Fetch-style API handlers to Netlify Functions. */
export const adaptFetchHandler = (handler: FetchHandler): Handler => async (event: HandlerEvent) => {
  const headers = new Headers();
  for (const [key, value] of Object.entries(event.headers)) {
    if (value != null) headers.set(key, value);
  }

  const hasBody = event.httpMethod !== 'GET' && event.httpMethod !== 'HEAD' && event.body != null;
  const request = new Request(event.rawUrl, {
    method: event.httpMethod,
    headers,
    body: hasBody
      ? (event.isBase64Encoded ? Buffer.from(event.body || '', 'base64') : event.body)
      : undefined,
  });
  const response = await handler(request);
  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => { responseHeaders[key] = value; });

  return {
    statusCode: response.status,
    headers: responseHeaders,
    body: await response.text(),
  };
};
