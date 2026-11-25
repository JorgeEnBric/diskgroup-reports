export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/**
 * Protección CSRF mínima sin login: las peticiones de mutación deben traer
 * una cabecera personalizada, que un sitio de otro origen no puede añadir
 * sin una preflight CORS que este servidor no permite.
 */
export function isAllowedMutation(request: Request): boolean {
  return request.headers.get('x-requested-with') === 'XMLHttpRequest';
}

export function forbidden(): Response {
  return json({ error: 'Solicitud no permitida (falta la cabecera X-Requested-With).' }, 403);
}
