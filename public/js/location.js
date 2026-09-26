// GPS helpers. Positions are [lon, lat] like everywhere else in the app.

export const HOIV = { lon: 16.3954, lat: 48.1761, label: 'HOIV, Arsenalstraße 11' };

// Last position we got (GPS fix or walking), e.g. to bias search suggestions. [lon, lat] or null.
let lastKnown = null;
export const lastPosition = () => lastKnown;
export function rememberPosition(pos) { lastKnown = pos; }

/** One position fix. Rejects with a spoken-friendly Error. */
export function getPosition({ timeoutMs = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('This phone does not share its location with the browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        lastKnown = [p.coords.longitude, p.coords.latitude];
        resolve({ lon: p.coords.longitude, lat: p.coords.latitude, accuracy: p.coords.accuracy });
      },
      (err) => reject(new Error(
        err.code === 1 ? 'Location permission is off. Allow location for this site in your browser settings.'
          : err.code === 3 ? 'Getting your location took too long.'
            : 'Your location is not available right now.',
      )),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 15000 },
    );
  });
}
