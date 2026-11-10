import { beforeEach, expect, it, vi } from 'vitest';
import type { LocalRun } from '../src/storage';

const { request, listRuns, pointsFor, saveRun } = vi.hoisted(() => ({
  request: vi.fn(),
  listRuns: vi.fn(),
  pointsFor: vi.fn(),
  saveRun: vi.fn(),
}));
vi.mock('../src/auth', () => ({ request, json: JSON.stringify }));
vi.mock('../src/storage', () => ({ listRuns, pointsFor, saveRun }));

import { createSyncQueue } from '../src/sync';

const workout = (id: string, ownerId = 'alice'): LocalRun => ({
  id,
  ownerId,
  sport: 'run',
  startedAt: 10000,
  endedAt: 20000,
  status: 'finished',
  segment: 0,
  intervals: [{ start: 10000, end: 20000 }],
  openInterval: null,
  hasGaps: false,
  synced: false,
});

beforeEach(() => {
  vi.resetAllMocks();
  listRuns.mockResolvedValue([workout('a1'), workout('a2')]);
  pointsFor.mockResolvedValue([{ seq: 0 }]);
  request.mockResolvedValue({ bound: true });
});

it.each(['/v1/activities', '/v1/activities/a1/points', '/v1/activities/a1/finish'])(
  'cancels an in-flight %s request without marking or advancing the queue',
  async (blockedPath) => {
    const started = Promise.withResolvers<void>();
    const response = Promise.withResolvers<unknown>();
    request.mockImplementation(async (path) => {
      if (path === blockedPath) {
        started.resolve();
        return response.promise;
      }
      return { bound: true };
    });
    const alice = createSyncQueue('alice', 'session-alice');
    const result = alice.sync();
    await started.promise;
    const cancelled = alice.cancel();
    expect(request.mock.lastCall?.[1].signal.aborted).toBe(true);
    response.resolve({});
    await cancelled;
    await expect(result).rejects.toThrow('cancelada');
    expect(saveRun).not.toHaveBeenCalled();
    expect(request.mock.lastCall?.[0]).toBe(blockedPath);
  },
);

it('isolates another session and retries using the original activity IDs', async () => {
  listRuns.mockImplementation(async (owner) =>
    owner === 'alice' ? [workout('a1'), workout('a2')] : [workout('b1', 'bob')],
  );
  const started = Promise.withResolvers<void>();
  const response = Promise.withResolvers<unknown>();
  request.mockImplementation(async (path) => {
    if (path === '/v1/activities/a1/finish') {
      started.resolve();
      return response.promise;
    }
    return { bound: true };
  });
  const alice = createSyncQueue('alice', 'session-alice');
  const bob = createSyncQueue('bob', 'session-bob');
  const result = alice.sync();
  expect(alice.sync()).toBe(result);
  await started.promise;
  const cancelled = alice.cancel();
  await bob.sync();
  expect(saveRun).toHaveBeenCalledExactlyOnceWith({ ...workout('b1', 'bob'), synced: true });
  response.resolve({});
  await cancelled;
  await expect(result).rejects.toThrow('cancelada');

  request.mockResolvedValue({ bound: true });
  await alice.sync();
  const creates = request.mock.calls
    .filter(([path]) => path === '/v1/activities')
    .map(([, options]) => [JSON.parse(options.body).id, options.headers['X-LivesRun-Session']]);
  expect(creates).toEqual([
    ['a1', 'session-alice'],
    ['b1', 'session-bob'],
    ['a1', 'session-alice'],
    ['a2', 'session-alice'],
  ]);
});

it('keeps the workout pending if the session changes before the local confirmation', async () => {
  request
    .mockResolvedValueOnce({ bound: true })
    .mockResolvedValueOnce({})
    .mockResolvedValueOnce({})
    .mockResolvedValueOnce({})
    .mockRejectedValueOnce(new Error('A sessão mudou durante a sincronização.'));
  await expect(createSyncQueue('alice', 'session-alice').sync()).rejects.toThrow('sessão mudou');
  expect(request).toHaveBeenCalledTimes(5);
  expect(saveRun).not.toHaveBeenCalled();
});

it('never sends workouts to an API that cannot confirm the session', async () => {
  request.mockResolvedValue({});
  await expect(createSyncQueue('alice', 'session-alice').sync()).rejects.toThrow('não confirmou');
  expect(request).toHaveBeenCalledTimes(1);
  expect(saveRun).not.toHaveBeenCalled();
});
