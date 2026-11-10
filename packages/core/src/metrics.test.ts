import { describe, it, expect } from 'vitest';
import { calculateMetrics, routeSegments, visibleTo, formatPace, type TrackPoint } from './index';
const start = 1700000000000;
const p = (seq: number, longitude = seq * 0.0001, extra: Partial<TrackPoint> = {}): TrackPoint => ({
  seq,
  segment: 0,
  latitude: 0,
  longitude,
  timestamp: start + seq * 10000,
  accuracy: 5,
  ...extra,
});
describe('measured movement', () => {
  it('calculates distance, active time, pace and speed', () => {
    const result = calculateMetrics([p(0), p(1), p(2)], [{ start, end: start + 20000 }]);
    expect(result.distanceMeters).toBe(22);
    expect(result.durationSeconds).toBe(20);
    expect(result.paceSecondsPerKm).toBeGreaterThan(890);
    expect(result.speedKmh).toBe(4);
  });
  it('does not bridge a pause', () => {
    expect(
      calculateMetrics(
        [p(0), p(1, 0.0001), p(2, 0.01, { segment: 1 }), p(3, 0.0101, { segment: 1 })],
        [
          { start, end: start + 10000 },
          { start: start + 20000, end: start + 30000 },
        ],
      ).distanceMeters,
    ).toBe(22);
  });
  it('excludes poor GPS and splits the visible path', () => {
    const points = [p(0), p(1, 0.0001, { accuracy: 100 }), p(2, 0.0002), p(3, 0.0003)];
    expect(calculateMetrics(points, [{ start, end: start + 30000 }]).distanceMeters).toBe(11);
    expect(routeSegments(points)).toHaveLength(2);
  });
  it('does not invent distance over a time gap', () => {
    const points = [p(0), p(1, 0.005, { timestamp: start + 60000 })];
    expect(calculateMetrics(points, [{ start, end: start + 60000 }])).toMatchObject({
      distanceMeters: 0,
      hasGaps: true,
    });
    expect(routeSegments(points)).toHaveLength(2);
  });
  it('rejects impossible jumps and duplicate timestamps', () => {
    expect(calculateMetrics([p(0), p(1, 1)], [{ start, end: start + 10000 }]).distanceMeters).toBe(
      0,
    );
    expect(
      calculateMetrics([p(0), p(1, 0.0001, { timestamp: start })], [{ start, end: start + 10000 }])
        .distanceMeters,
    ).toBe(0);
  });
  it('breaks on missing sequences and excludes points outside active intervals', () => {
    expect(calculateMetrics([p(0), p(2)], [{ start, end: start + 20000 }]).distanceMeters).toBe(0);
    expect(
      calculateMetrics([p(0), p(1), p(2)], [{ start, end: start + 10000 }]).distanceMeters,
    ).toBe(11);
  });
  it('shows no pace for no measured distance', () => {
    expect(calculateMetrics([], [{ start, end: start }]).paceSecondsPerKm).toBeNull();
    expect(formatPace(null)).toBe('—');
  });
});
describe('visibility policy', () => {
  it('keeps default-private activities owner-only', () => {
    expect(visibleTo('alice', { ownerId: 'alice', visibility: 'private' }, false, false)).toBe(
      true,
    );
    expect(visibleTo('bob', { ownerId: 'alice', visibility: 'private' }, true, false)).toBe(false);
  });
  it('requires approval for follower visibility', () => {
    expect(visibleTo('bob', { ownerId: 'alice', visibility: 'followers' }, false, false)).toBe(
      false,
    );
    expect(visibleTo('bob', { ownerId: 'alice', visibility: 'followers' }, true, false)).toBe(true);
  });
  it('denies a blocked viewer even for community activities', () => {
    expect(visibleTo('bob', { ownerId: 'alice', visibility: 'community' }, true, true)).toBe(false);
  });
});
