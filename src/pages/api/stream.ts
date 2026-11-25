import type { APIRoute } from 'astro';
import { getJob, subscribe } from '../../lib/jobs';
import type { JobEvent } from '../../lib/types';

export const GET: APIRoute = ({ url, request }) => {
  const jobId = url.searchParams.get('jobId') ?? '';
  const job = getJob(jobId);
  if (!job) {
    return new Response('Job no encontrado o expirado.', { status: 404 });
  }

  const encoder = new TextEncoder();
  let unsubscribe: () => void = () => undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      const close = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Ya cerrado por el cliente.
        }
      };

      const send = (event: JobEvent) => {
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

      unsubscribe = subscribe(job, send);
      heartbeat = setInterval(() => send({ type: 'ping', data: {} }), 15000);

      // Si el job terminó antes de conectar, el evento `done` ya se emitió.
      if (job.status !== 'running') send({ type: 'done', data: {} });

      request.signal.addEventListener('abort', close, { once: true });
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      unsubscribe();
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
