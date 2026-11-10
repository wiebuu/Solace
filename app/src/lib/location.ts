import { useEffect } from 'react';
import * as Location from 'expo-location';
import { useAuth } from './auth';

let asked = false;

/** "Pune, Maharashtra, India": city level only, never the exact spot. */
async function currentPlace(): Promise<string> {
  const pos = (await Location.getLastKnownPositionAsync()) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }));
  const [a] = await Location.reverseGeocodeAsync({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
  if (!a) return '';
  return [a.city ?? a.subregion, a.region, a.country].filter((x, i, all) => x && all.indexOf(x) === i).join(', ');
}

/**
 * Once signed in, ask (one time) to know where they are, so Sol knows their city: local places,
 * weather, culture and the right helplines. Kept up to date when they move.
 */
export function useLocationSync() {
  const { user, update } = useAuth();
  const signedIn = Boolean(user?.onboarded);
  const known = user?.location ?? '';
  useEffect(() => {
    if (!signedIn || asked) return;
    asked = true;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const place = await currentPlace();
      if (place && place !== known) await update({ location: place });
    })().catch((e) => console.warn('[location]', (e as Error).message));
  }, [signedIn, known, update]);
}
