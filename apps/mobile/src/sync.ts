import { request, json } from './auth';
import { pointsFor, listRuns, saveRun, type LocalRun } from './storage';
let inFlight: Promise<void> | null = null;
async function syncRun(run: LocalRun) {
  await request('/v1/activities', {
    method: 'POST',
    body: json({ id: run.id, sport: run.sport, startedAt: new Date(run.startedAt).toISOString() }),
  });
  const points = await pointsFor(run.id);
  for (let i = 0; i < points.length; i += 200)
    await request(`/v1/activities/${run.id}/points`, {
      method: 'PUT',
      body: json({ points: points.slice(i, i + 200) }),
    });
  await request(`/v1/activities/${run.id}/finish`, {
    method: 'POST',
    body: json({
      endedAt: new Date(run.endedAt!).toISOString(),
      expectedPointCount: points.length,
      intervals: run.intervals,
    }),
  });
  await saveRun({ ...run, synced: true });
}
export async function syncPending(ownerId: string) {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    for (const run of await listRuns(ownerId))
      if (run.status === 'finished' && !run.synced) await syncRun(run);
  })();
  try {
    await inFlight;
  } finally {
    inFlight = null;
  }
}
