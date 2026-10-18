/** RF-806. The server stores the fence. The PWA supplies the position. */

export interface GeoPoint {
  readonly lat: number;
  readonly lon: number;
}

export interface Geofence {
  readonly lat: number;
  readonly lon: number;
  readonly radiusM: number;
}

const EARTH_M = 6_371_000;

export function distanceMeters(from: GeoPoint, to: GeoPoint): number {
  const phi1 = toRadians(from.lat);
  const phi2 = toRadians(to.lat);
  const dPhi = toRadians(to.lat - from.lat);
  const dLon = toRadians(to.lon - from.lon);
  const a = Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_M * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function insideGeofence(point: GeoPoint, fence: Geofence): boolean {
  if (!Number.isFinite(fence.radiusM) || fence.radiusM <= 0) {
    return false;
  }
  return distanceMeters(point, fence) <= fence.radiusM;
}

export function readGeofence(value: unknown): Geofence | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const lat = record.lat;
  const lon = record.lon;
  const radius = record.radius_m;
  if (typeof lat !== 'number' || typeof lon !== 'number' || typeof radius !== 'number') {
    return null;
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return null;
  }
  return { lat, lon, radiusM: radius };
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
