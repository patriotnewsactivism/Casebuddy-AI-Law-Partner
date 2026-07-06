/**
 * Netlify Function — Stripe Checkout session creator.
 * Ported from api/stripe/checkout.ts (already used Request/Response — minimal changes).
 *
 * POST /api/stripe/checkout
 * Body: { priceId, successUrl, cancelUrl }
 */

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const json = (body: object, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) return json({ error: 'Stripe not configured' }, 503);

  let priceId: string, successUrl: string, cancelUrl: string;
  try {
    const body = await req.json() as any;
    priceId    = body.priceId;
    successUrl = body.successUrl;
    cancelUrl  = body.cancelUrl;
    if (!priceId || !successUrl || !cancelUrl)
      return json({ error: 'Missing required fields: priceId, successUrl, cancelUrl' }, 400);
  } catch { return json({ error: 'Invalid JSON body' }, 400); }

  const params = new URLSearchParams({
    mode: 'payment',
    success_url: successUrl,
    cancel_url: cancelUrl,
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
  });

  try {
    const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const session = await stripeResponse.json() as { url?: string; error?: { message: string } };
    if (!stripeResponse.ok || !session.url)
      return json({ error: session?.error?.message ?? 'Stripe session creation failed' }, stripeResponse.status);

    return json({ url: session.url });
  } catch (err: any) {
    return json({ error: 'Failed to reach Stripe API', detail: err?.message }, 502);
  }
}

export const config = { path: "/api/stripe/checkout" };
