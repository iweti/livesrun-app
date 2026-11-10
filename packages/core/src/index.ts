import { z } from 'zod';

export const sportSchema = z.enum(['run', 'walk']);
export const visibilitySchema = z.enum(['private', 'followers', 'community']);
export const pointSchema = z.object({
  seq: z.number().int().min(0).max(99999),
  segment: z.number().int().min(0),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  timestamp: z.number().int().positive(),
  accuracy: z.number().min(0).max(10000),
});
export const intervalSchema = z
  .object({ start: z.number().int().positive(), end: z.number().int().positive() })
  .refine((x) => x.end >= x.start, 'Intervalo inválido');
export const startActivitySchema = z.object({
  id: z.uuid(),
  sport: sportSchema,
  startedAt: z.iso.datetime(),
});
export const uploadSchema = z.object({ points: z.array(pointSchema).min(1).max(500) });
export const finishSchema = z.object({
  endedAt: z.iso.datetime(),
  expectedPointCount: z.number().int().min(0).max(100000),
  intervals: z.array(intervalSchema).min(1).max(1000),
});
export const publishSchema = z.object({
  visibility: visibilitySchema,
  caption: z.string().trim().max(1000).default(''),
});
export const profileSchema = z.object({
  name: z.string().trim().min(2).max(60),
  handle: z
    .string()
    .toLowerCase()
    .regex(/^[a-z0-9_]{3,24}$/),
  bio: z.string().trim().max(240).default(''),
});
export const registrationSchema = z.object({
  email: z.email(),
  password: z.string().min(12).max(128),
  name: z.string().trim().min(2).max(60),
  inviteCode: z.string().min(16).max(128),
  adultAccepted: z.literal(true),
  termsAccepted: z.literal(true),
});
export const commentSchema = z.object({ body: z.string().trim().min(1).max(500) });
export const reportSchema = z.object({
  targetType: z.enum(['activity', 'comment', 'profile']),
  targetId: z.string().min(1).max(100),
  reason: z.string().trim().min(5).max(1000),
});
export type Sport = z.infer<typeof sportSchema>;
export type Visibility = z.infer<typeof visibilitySchema>;
export type TrackPoint = z.infer<typeof pointSchema>;
export type ActiveInterval = z.infer<typeof intervalSchema>;
export type ActivitySummary = {
  id: string;
  ownerId: string;
  sport: Sport;
  startedAt: string;
  endedAt: string | null;
  distanceMeters: number;
  durationSeconds: number;
  paceSecondsPerKm: number | null;
  speedKmh: number | null;
  visibility: Visibility;
  caption: string;
  status: 'recording' | 'finished';
  hasGaps: boolean;
  author: { name: string; handle: string };
  likeCount: number;
  commentCount: number;
  liked: boolean;
};

export function haversine(a: TrackPoint, b: TrackPoint): number {
  const r = Math.PI / 180;
  const dlat = (b.latitude - a.latitude) * r,
    dlon = (b.longitude - a.longitude) * r;
  const h =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(a.latitude * r) * Math.cos(b.latitude * r) * Math.sin(dlon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
// The same deterministic calculation is used on device and server. Poor samples
// and time gaps break the polyline; they never become measured straight lines.
export function calculateMetrics(points: TrackPoint[], intervals: ActiveInterval[]) {
  let distanceMeters = 0,
    hasGaps = false;
  let previous: TrackPoint | undefined;
  const ordered = [...points].sort((a, b) => a.seq - b.seq);
  for (const point of ordered) {
    if (
      point.accuracy > 50 ||
      !intervals.some((i) => point.timestamp >= i.start && point.timestamp <= i.end)
    ) {
      previous = undefined;
      hasGaps = true;
      continue;
    }
    if (previous && previous.segment === point.segment) {
      const dt = (point.timestamp - previous.timestamp) / 1000;
      const d = haversine(previous, point);
      if (dt > 0 && dt <= 30 && point.seq === previous.seq + 1 && d / dt <= 12) distanceMeters += d;
      else hasGaps = true;
    }
    previous = point;
  }
  const durationSeconds = Math.max(
    0,
    Math.floor(intervals.reduce((n, i) => n + i.end - i.start, 0) / 1000),
  );
  return {
    distanceMeters: Math.round(distanceMeters),
    durationSeconds,
    paceSecondsPerKm:
      distanceMeters > 0 && durationSeconds > 0
        ? Math.round(durationSeconds / (distanceMeters / 1000))
        : null,
    speedKmh:
      durationSeconds > 0 && distanceMeters > 0
        ? Math.round((distanceMeters / durationSeconds) * 36) / 10
        : null,
    hasGaps,
  };
}
export function formatDistance(m: number) {
  return (m / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export function formatDuration(s: number) {
  const h = Math.floor(s / 3600);
  return `${h ? `${h}:` : ''}${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(Math.floor(s) % 60).padStart(2, '0')}`;
}
export function formatPace(s: number | null) {
  return s === null ? '—' : `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, '0')}`;
}
export function visibleTo(
  viewer: string,
  activity: { ownerId: string; visibility: Visibility },
  approved: boolean,
  blocked: boolean,
) {
  return (
    !blocked &&
    (viewer === activity.ownerId ||
      activity.visibility === 'community' ||
      (activity.visibility === 'followers' && approved))
  );
}
export function routeSegments(points: TrackPoint[]): TrackPoint[][] {
  const segments: TrackPoint[][] = [];
  let previous: TrackPoint | undefined;
  for (const p of [...points].sort((a, b) => a.seq - b.seq)) {
    if (p.accuracy > 50) {
      previous = undefined;
      continue;
    }
    const dt = previous ? (p.timestamp - previous.timestamp) / 1000 : 0;
    if (
      !previous ||
      previous.segment !== p.segment ||
      dt <= 0 ||
      dt > 30 ||
      p.seq !== previous.seq + 1 ||
      haversine(previous, p) / dt > 12
    )
      segments.push([]);
    segments[segments.length - 1].push(p);
    previous = p;
  }
  return segments;
}
