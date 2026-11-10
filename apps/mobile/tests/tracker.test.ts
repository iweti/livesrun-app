import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { LocalRun } from '../src/storage';
import type { TrackPoint } from '@livesrun/core';

const location = vi.hoisted(() => ({
  requestForegroundPermissionsAsync: vi.fn(),
  requestBackgroundPermissionsAsync: vi.fn(),
  hasServicesEnabledAsync: vi.fn(),
  hasStartedLocationUpdatesAsync: vi.fn(),
  startLocationUpdatesAsync: vi.fn(),
  Accuracy: { BestForNavigation: 1 },
  ActivityType: { Fitness: 1 },
}));
const { activeRun, listRuns, getRun, saveRun, pointsFor } = vi.hoisted(() => ({
  activeRun: vi.fn(),
  listRuns: vi.fn(),
  getRun: vi.fn(),
  saveRun: vi.fn(),
  pointsFor: vi.fn(),
}));
vi.mock('expo-location', () => location);
vi.mock('expo-task-manager', () => ({ defineTask: vi.fn() }));
vi.mock('expo-crypto', () => ({ randomUUID: () => 'new-workout' }));
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
vi.mock('../src/storage', () => ({
  activeRun,
  listRuns,
  getRun,
  saveRun,
  pointsFor,
  appendLocations: vi.fn(),
}));
import { finishRun, recoverLocalWorkout, resumeRun, startRun } from '../src/tracker';

const start = 100000;
const paused: LocalRun = {
  id: 'workout',
  ownerId: 'alice',
  sport: 'run',
  startedAt: start,
  endedAt: null,
  status: 'paused',
  segment: 0,
  intervals: [{ start, end: start + 10000 }],
  openInterval: null,
  hasGaps: false,
  synced: false,
};
let saved: LocalRun | null;

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(start);
  saved = null;
  activeRun.mockImplementation(async () => saved);
  getRun.mockImplementation(async () => saved);
  saveRun.mockImplementation(async (run) => {
    saved = run;
  });
  location.requestForegroundPermissionsAsync.mockResolvedValue({ granted: true });
  location.requestBackgroundPermissionsAsync.mockImplementation(async () => {
    vi.advanceTimersByTime(60000);
    return { granted: true };
  });
  location.hasServicesEnabledAsync.mockResolvedValue(true);
  location.hasStartedLocationUpdatesAsync.mockResolvedValue(false);
});
afterEach(() => vi.useRealTimers());

it('excludes time in permission dialogs when starting and resuming', async () => {
  expect(await startRun('alice', 'run')).toMatchObject({
    startedAt: start + 60000,
    openInterval: start + 60000,
  });
  vi.advanceTimersByTime(30000);
  expect((await finishRun('new-workout'))?.intervals).toEqual([
    { start: start + 60000, end: start + 90000 },
  ]);
  saved = paused;
  expect(await resumeRun(paused.id)).toMatchObject({
    openInterval: start + 150000,
    segment: 1,
    intervals: paused.intervals,
  });
});

it('does not open an interval after permission denial or a failed capture start', async () => {
  location.requestForegroundPermissionsAsync.mockResolvedValueOnce({ granted: false });
  await expect(startRun('alice', 'run')).rejects.toThrow('Permita localização');
  expect(saveRun).not.toHaveBeenCalled();
  location.startLocationUpdatesAsync.mockRejectedValue(new Error('GPS indisponível'));
  await expect(startRun('alice', 'run')).rejects.toThrow('GPS indisponível');
  expect(saved).toMatchObject({ status: 'paused', openInterval: null });
  saved = paused;
  await expect(resumeRun(paused.id)).rejects.toThrow('GPS indisponível');
  expect(saved).toEqual(paused);
});

it('recovers the verified owner’s saved recording and points locally', async () => {
  saved = { ...paused, status: 'recording', openInterval: start + 15000, segment: 1 };
  const points: TrackPoint[] = [
    { seq: 0, segment: 1, timestamp: start + 20000, latitude: 0, longitude: 0, accuracy: 5 },
  ];
  listRuns.mockImplementation(async (owner) => (owner === 'alice' ? [saved] : []));
  pointsFor.mockResolvedValue(points);
  expect(await recoverLocalWorkout('bob')).toBeNull();
  expect(await recoverLocalWorkout('alice')).toEqual({
    run: {
      ...paused,
      segment: 1,
      hasGaps: true,
      intervals: [...paused.intervals, { start: start + 15000, end: start + 20000 }],
    },
    points,
  });
});
