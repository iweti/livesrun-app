import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import {
  activeRun,
  appendLocations,
  getRun,
  listRuns,
  saveRun,
  pointsFor,
  type LocalRun,
} from './storage';
const TASK = 'livesrun.gps';
let captureStarting = false;
if (Platform.OS !== 'web')
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(
    TASK,
    async ({ data, error }) => {
      if (error) {
        const run = await activeRun();
        if (run) await saveRun({ ...run, hasGaps: true });
        return;
      }
      if (data) await appendLocations(data.locations);
    },
  );
export async function stopCapture() {
  if (Platform.OS !== 'web' && (await Location.hasStartedLocationUpdatesAsync(TASK)))
    await Location.stopLocationUpdatesAsync(TASK);
}
async function ensureCapturePermissions() {
  if (Platform.OS === 'web')
    throw new Error(
      'A gravação GPS está disponível no aplicativo Android ou iOS. A versão web permite revisar as telas e gerenciar sua conta.',
    );
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (!foreground.granted)
    throw new Error('Permita localização nas configurações para registrar um treino.');
  if (!(await Location.hasServicesEnabledAsync()))
    throw new Error('Ative o GPS do aparelho antes de iniciar.');
  const background = await Location.requestBackgroundPermissionsAsync();
  if (!background.granted)
    throw new Error(
      'Permita localização em segundo plano para gravar com a tela bloqueada. Você pode ajustar isso nas configurações do aparelho.',
    );
}
async function startCapture() {
  await Location.startLocationUpdatesAsync(TASK, {
    accuracy: Location.Accuracy.BestForNavigation,
    timeInterval: 3000,
    distanceInterval: 5,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    activityType: Location.ActivityType.Fitness,
    foregroundService: {
      notificationTitle: 'LivesRun · treino em andamento',
      notificationBody: 'Seu percurso está sendo salvo de forma privada.',
      notificationColor: '#FF671F',
      killServiceOnDestroy: true,
    },
  });
}
async function withCaptureStart<T>(start: () => Promise<T>) {
  if (captureStarting) throw new Error('A gravação já está sendo iniciada.');
  captureStarting = true;
  try {
    return await start();
  } finally {
    captureStarting = false;
  }
}
export async function startRun(ownerId: string, sport: 'run' | 'walk') {
  return withCaptureStart(async () => {
    if (await activeRun()) throw new Error('Conclua ou descarte o treino em andamento.');
    await ensureCapturePermissions();
    const now = Date.now();
    const run: LocalRun = {
      id: Crypto.randomUUID(),
      ownerId,
      sport,
      startedAt: now,
      endedAt: null,
      status: 'recording',
      segment: 0,
      intervals: [],
      openInterval: now,
      hasGaps: false,
      synced: false,
    };
    await saveRun(run);
    try {
      await startCapture();
    } catch (error) {
      await saveRun({ ...run, status: 'paused', openInterval: null });
      throw error;
    }
    return run;
  });
}
export async function pauseRun(id: string) {
  const run = await getRun(id);
  if (!run || run.status !== 'recording') return run;
  const now = Date.now();
  const paused: LocalRun = {
    ...run,
    status: 'paused',
    intervals: [
      ...run.intervals,
      ...(run.openInterval === null ? [] : [{ start: run.openInterval, end: now }]),
    ],
    openInterval: null,
  };
  await saveRun(paused);
  await stopCapture();
  return paused;
}
export async function resumeRun(id: string) {
  return withCaptureStart(async () => {
    const run = await getRun(id);
    if (!run || run.status !== 'paused') return run;
    await ensureCapturePermissions();
    const paused = await getRun(id);
    if (!paused || paused.status !== 'paused') return paused;
    const resumed: LocalRun = {
      ...paused,
      status: 'recording',
      segment: paused.segment + 1,
      openInterval: Date.now(),
    };
    await saveRun(resumed);
    try {
      await startCapture();
    } catch (error) {
      await saveRun(paused);
      throw error;
    }
    return resumed;
  });
}
export async function recoverRun(id: string) {
  const run = await getRun(id);
  if (!run) return null;
  const running = Platform.OS !== 'web' && (await Location.hasStartedLocationUpdatesAsync(TASK));
  if (run.status === 'recording' && !running) {
    const points = await pointsFor(id);
    const last = points.at(-1)?.timestamp ?? run.openInterval ?? run.startedAt;
    const recovered: LocalRun = {
      ...run,
      status: 'paused',
      openInterval: null,
      hasGaps: true,
      intervals: [
        ...run.intervals,
        ...(run.openInterval !== null
          ? [{ start: run.openInterval, end: Math.max(run.openInterval, last) }]
          : []),
      ],
    };
    await saveRun(recovered);
    return recovered;
  }
  return run;
}
export async function recoverLocalWorkout(ownerId: string) {
  const runs = await listRuns(ownerId);
  const active = runs.find((run) => run.status !== 'finished');
  if (!active) return null;
  const run = await recoverRun(active.id);
  if (!run) return null;
  return { run, points: await pointsFor(run.id) };
}
export async function finishRun(id: string) {
  const paused = await pauseRun(id);
  if (!paused) return null;
  const finished: LocalRun = {
    ...paused,
    status: 'finished',
    endedAt: Date.now(),
    intervals: paused.intervals.length
      ? paused.intervals
      : [{ start: paused.startedAt, end: paused.startedAt }],
  };
  await saveRun(finished);
  return finished;
}
