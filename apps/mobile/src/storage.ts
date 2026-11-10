import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import type { Sport, TrackPoint, ActiveInterval } from '@livesrun/core';
export type LocalRun = {
  id: string;
  ownerId: string;
  sport: Sport;
  startedAt: number;
  endedAt: number | null;
  status: 'recording' | 'paused' | 'finished';
  segment: number;
  intervals: ActiveInterval[];
  openInterval: number | null;
  hasGaps: boolean;
  synced: boolean;
};
let promise: Promise<SQLite.SQLiteDatabase> | null = null;
async function database() {
  if (!promise)
    promise = (async () => {
      const db = await SQLite.openDatabaseAsync('livesrun.db');
      if (Platform.OS !== 'web') {
        let key = await SecureStore.getItemAsync('livesrun.db.key');
        if (!key) {
          key = Array.from(await Crypto.getRandomBytesAsync(32), (b) =>
            b.toString(16).padStart(2, '0'),
          ).join('');
          await SecureStore.setItemAsync('livesrun.db.key', key);
        }
        await db.execAsync(`PRAGMA key = '${key}';`);
      }
      await db.execAsync(
        'PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS points (run_id TEXT NOT NULL, seq INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(run_id,seq));',
      );
      return db;
    })();
  return promise;
}
export async function saveRun(run: LocalRun) {
  const db = await database();
  await db.runAsync(
    'INSERT INTO runs(id,owner_id,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
    run.id,
    run.ownerId,
    JSON.stringify(run),
  );
}
export async function getRun(id: string) {
  const db = await database();
  const row = await db.getFirstAsync<{ data: string }>('SELECT data FROM runs WHERE id=?', id);
  return row ? (JSON.parse(row.data) as LocalRun) : null;
}
export async function listRuns(ownerId: string) {
  const db = await database();
  const rows = await db.getAllAsync<{ data: string }>(
    'SELECT data FROM runs WHERE owner_id=?',
    ownerId,
  );
  return rows.map((r) => JSON.parse(r.data) as LocalRun).sort((a, b) => b.startedAt - a.startedAt);
}
export async function activeRun() {
  const db = await database();
  const rows = await db.getAllAsync<{ data: string }>('SELECT data FROM runs');
  return (
    rows.map((r) => JSON.parse(r.data) as LocalRun).find((r) => r.status !== 'finished') ?? null
  );
}
export async function pointsFor(id: string) {
  const db = await database();
  return (
    await db.getAllAsync<{ data: string }>(
      'SELECT data FROM points WHERE run_id=? ORDER BY seq',
      id,
    )
  ).map((r) => JSON.parse(r.data) as TrackPoint);
}
export async function appendLocations(
  locations: {
    coords: { latitude: number; longitude: number; accuracy: number | null };
    timestamp: number;
  }[],
) {
  const db = await database();
  await db.withExclusiveTransactionAsync(async (tx) => {
    const rows = await tx.getAllAsync<{ data: string }>('SELECT data FROM runs');
    const run = rows
      .map((r) => JSON.parse(r.data) as LocalRun)
      .find((r) => r.status === 'recording');
    if (!run || run.openInterval === null) return;
    const last = await tx.getFirstAsync<{ seq: number }>(
      'SELECT seq FROM points WHERE run_id=? ORDER BY seq DESC LIMIT 1',
      run.id,
    );
    let seq = (last?.seq ?? -1) + 1;
    for (const location of locations.sort((a, b) => a.timestamp - b.timestamp)) {
      if (location.timestamp < run.openInterval) continue;
      const point: TrackPoint = {
        seq,
        segment: run.segment,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy ?? 10000,
        timestamp: Math.floor(location.timestamp),
      };
      await tx.runAsync(
        'INSERT INTO points(run_id,seq,data) VALUES(?,?,?)',
        run.id,
        seq,
        JSON.stringify(point),
      );
      seq++;
    }
  });
}
export async function deleteRun(id: string) {
  const db = await database();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM points WHERE run_id=?', id);
    await db.runAsync('DELETE FROM runs WHERE id=?', id);
  });
}
export async function clearOwner(ownerId: string) {
  for (const run of await listRuns(ownerId)) await deleteRun(run.id);
}
