import { useEffect } from 'react';
import { api } from '../../api';
import { runAction } from '../../components/run-action';

/** Reports a coarse position once per shell mount. Stays out of the settings chunk. */
export function LocationWatch() {
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        runAction(api.reportLocation(position.coords.latitude, position.coords.longitude));
      },
      () => undefined,
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 8_000 },
    );
  }, []);
  return null;
}
