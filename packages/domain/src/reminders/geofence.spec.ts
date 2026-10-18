import { describe, expect, it } from 'vitest';
import { distanceMeters, insideGeofence, readGeofence } from './geofence';

describe('geofence', () => {
  it('RF-806: a point inside the radius matches and a far point does not', () => {
    const fence = { lat: 40.4168, lon: -3.7038, radiusM: 200 };
    expect(insideGeofence({ lat: 40.4168, lon: -3.7038 }, fence)).toBe(true);
    expect(insideGeofence({ lat: 41.4, lon: -3.7 }, fence)).toBe(false);
    expect(distanceMeters({ lat: 0, lon: 0 }, { lat: 0, lon: 0 })).toBe(0);
    expect(insideGeofence({ lat: 0, lon: 0 }, { lat: 0, lon: 0, radiusM: 0 })).toBe(false);
  });

  it('RF-806: reads a stored location and rejects a broken one', () => {
    expect(readGeofence({ lat: 1, lon: 2, radius_m: 50, label: 'Casa' })).toEqual({
      lat: 1,
      lon: 2,
      radiusM: 50,
    });
    expect(readGeofence({ lat: 100, lon: 0, radius_m: 10 })).toBeNull();
    expect(readGeofence(null)).toBeNull();
    expect(readGeofence({ lat: '1', lon: 2, radius_m: 10 })).toBeNull();
  });
});
