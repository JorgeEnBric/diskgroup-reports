import type { APIRoute } from 'astro';
import { listQueryMeta } from '../../lib/queries';

export const GET: APIRoute = () =>
  new Response(JSON.stringify({ queries: listQueryMeta() }), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
