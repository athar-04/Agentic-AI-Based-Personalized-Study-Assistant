import type { Server } from 'http';

/**
 * On SIGTERM (sent by every container redeploy) or SIGINT: stop accepting connections, let the
 * requests in flight finish, then run `cleanup` (close the database and Redis) and exit. Gives up
 * after `graceMs` so one hung keep-alive connection can't hold the stop.
 */
export function handleShutdown(
  server: Server,
  cleanup: () => Promise<unknown> = () => Promise.resolve(),
  log: (message: string) => void = console.log,
  graceMs = 10_000,
): void {
  let stopping = false;
  const stop = (signal: string) => {
    if (stopping) return;
    stopping = true;
    log(`${signal} received; finishing requests in flight...`);
    setTimeout(() => {
      log('Grace period over; exiting.');
      process.exit(0);
    }, graceMs).unref();
    server.close(() => {
      void cleanup()
        .catch(() => undefined)
        .finally(() => process.exit(0));
    });
    // Idle keep-alive sockets would otherwise hold close() open until they time out.
    server.closeIdleConnections?.();
  };
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));
}

/**
 * Timeouts for every service's HTTP server.
 * - A request (headers and body) must arrive within 45 s, not Node's default 5 minutes: a stalled
 *   upload otherwise holds a connection, and the student's spinner, for that long.
 * - Idle keep-alive connections are held 35 s, longer than the reverse proxy keeps them (Caddy is
 *   set to 30 s), so the proxy closes idle connections first. When both sides use the same
 *   timeout, a request can be sent on a connection the server is closing, and get lost.
 */
export function applyServerTimeouts(server: Server): void {
  server.keepAliveTimeout = 35_000;
  server.headersTimeout = 40_000;
  server.requestTimeout = 45_000;
}
