import { request, json } from './auth';
import { pointsFor, listRuns, saveRun } from './storage';

export function createSyncQueue(ownerId: string, sessionId: string) {
  let current: { controller: AbortController; result: Promise<void> } | undefined;

  async function run(signal: AbortSignal) {
    const boundRequest = async <T>(path: string, options: RequestInit = {}) => {
      if (signal.aborted) throw new Error('Sincronização cancelada.');
      const result = await request<T>(path, {
        ...options,
        signal,
        headers: { 'X-LivesRun-Session': sessionId },
      });
      if (signal.aborted) throw new Error('Sincronização cancelada.');
      return result;
    };
    const verifySession = async () => {
      const check = await boundRequest<{ bound: boolean }>('/v1/sync-session');
      if (check?.bound !== true) throw new Error('A API não confirmou a sessão da sincronização.');
    };
    const pending = (await listRuns(ownerId)).filter(
      (run) => run.ownerId === ownerId && run.status === 'finished' && !run.synced,
    );
    if (!pending.length) return;
    await verifySession();
    for (const run of pending) {
      const points = await pointsFor(run.id);
      await boundRequest('/v1/activities', {
        method: 'POST',
        body: json({
          id: run.id,
          sport: run.sport,
          startedAt: new Date(run.startedAt).toISOString(),
        }),
      });
      for (let i = 0; i < points.length; i += 200)
        await boundRequest(`/v1/activities/${run.id}/points`, {
          method: 'PUT',
          body: json({ points: points.slice(i, i + 200) }),
        });
      await boundRequest(`/v1/activities/${run.id}/finish`, {
        method: 'POST',
        body: json({
          endedAt: new Date(run.endedAt!).toISOString(),
          expectedPointCount: points.length,
          intervals: run.intervals,
        }),
      });
      await verifySession();
      if (signal.aborted) throw new Error('Sincronização cancelada.');
      await saveRun({ ...run, synced: true });
    }
  }

  return {
    sync() {
      if (!current) {
        const controller = new AbortController();
        const result = run(controller.signal).finally(() => {
          current = undefined;
        });
        current = { controller, result };
      }
      return current.result;
    },
    async cancel() {
      current?.controller.abort();
      await current?.result.catch(() => {});
    },
  };
}
