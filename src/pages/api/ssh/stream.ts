import type { APIRoute } from 'astro';
import { json } from '../../../lib/http';
import { getSshSession, subscribeSsh } from '../../../lib/ssh-sessions';
import type { SshEvent } from '../../../lib/ssh-shared';

export const GET: APIRoute = ({ url, request }) => {
  const sessionId = url.searchParams.get('sessionId') ?? '';
  const session = getSshSession(sessionId);
  if (!session) {
    return json({ error: 'Sesión SSH no encontrada o expirada.' }, 404);
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      const close = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        unsubscribe?.();
        try {
          controller.close();
        } catch {
          // Ya cerrado por el cliente.
        }
      };

      const send = (event: SshEvent) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event.data ?? {})}\n\n`),
          );
        } catch {
          close();
          return;
        }
        if (event.type === 'done') close();
      };

      unsubscribe = subscribeSsh(sessionId, send);
      heartbeat = setInterval(() => send({ type: 'ping', data: {} }), 15000);

      if (session.status === 'closed' || session.status === 'error') {
        send({ type: 'done', data: {} });
      }

      request.signal.addEventListener('abort', close, { once: true });
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  });
};
