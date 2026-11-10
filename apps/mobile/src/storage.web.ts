// Browser preview only: the supported GPS recorder lives in the native app.
import type { LocalRun } from './storage';
import type { TrackPoint } from '@livesrun/core';
export type { LocalRun } from './storage';
const key = 'livesrun.preview.runs';
function all(): LocalRun[] {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '[]');
  } catch {
    return [];
  }
}
export async function saveRun(run: LocalRun) {
  localStorage.setItem(key, JSON.stringify([...all().filter((r) => r.id !== run.id), run]));
}
export async function getRun(id: string) {
  return all().find((r) => r.id === id) ?? null;
}
export async function listRuns(owner: string) {
  return all()
    .filter((r) => r.ownerId === owner)
    .sort((a, b) => b.startedAt - a.startedAt);
}
export async function activeRun() {
  return all().find((r) => r.status !== 'finished') ?? null;
}
export async function pointsFor(_id: string): Promise<TrackPoint[]> {
  return [];
}
export async function appendLocations(_locations: unknown[]) {
  throw new Error('GPS disponível no aplicativo móvel.');
}
export async function deleteRun(id: string) {
  localStorage.setItem(key, JSON.stringify(all().filter((r) => r.id !== id)));
}
export async function clearOwner(id: string) {
  localStorage.setItem(key, JSON.stringify(all().filter((r) => r.ownerId !== id)));
}
