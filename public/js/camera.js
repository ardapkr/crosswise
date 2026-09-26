// Rear camera (or a test video with ?video=<url>) → small JPEG frames for /api/look.

const MAX_WIDTH = 768;
const QUALITY = 0.7;

let stream = null;
let video = null;
let starts = 0; // a stop or a newer start cancels a start that is still waiting for the camera

/** Thrown when a start was cancelled meanwhile (nothing to tell the user). */
export class CameraCancelled extends Error {}

// play() can be refused (power saving, autoplay rules): try once more, then fail with words we can speak.
async function play(el, what) {
  try {
    await el.play();
  } catch {
    await new Promise((r) => setTimeout(r, 300));
    try { await el.play(); } catch { throw new Error(`The ${what} could not start. Tap the button again.`); }
  }
}

/** Starts the camera into the given <video>. Rejects with a spoken-friendly Error. */
export async function startCamera(videoEl, { testVideoUrl = null } = {}) {
  const my = ++starts;
  video = videoEl;
  if (testVideoUrl) {
    video.src = testVideoUrl;
    video.loop = true;
    video.muted = true;
    await play(video, 'demo video');
    if (my !== starts) throw new CameraCancelled('cancelled');
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('This browser cannot use the camera. Try Safari on iPhone or Chrome on Android.');
  }
  let s;
  try {
    s = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 960 } },
      audio: false,
    });
  } catch (e) {
    if (e.name === 'NotAllowedError' || e.name === 'SecurityError') {
      throw new Error('Camera permission is off. Allow the camera for this site in your browser settings.');
    }
    throw new Error('The camera is not available right now.');
  }
  // stopped or restarted while we waited: turn this stream off again (never leave the camera on)
  if (my !== starts) { s.getTracks().forEach((t) => t.stop()); throw new CameraCancelled('cancelled'); }
  stream?.getTracks().forEach((t) => t.stop());
  stream = s;
  video.srcObject = stream;
  video.muted = true;
  video.setAttribute('playsinline', '');
  await play(video, 'camera picture');
  // wait until the first frame has a size
  if (!video.videoWidth) await new Promise((r) => video.addEventListener('loadedmetadata', r, { once: true }));
}

export function stopCamera() {
  starts++;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  if (video) {
    video.pause();
    video.srcObject = null;
    video.removeAttribute('src');
  }
}

export function cameraRunning() {
  return Boolean(video && (stream || video.src) && video.videoWidth);
}

/** Current frame as base64 JPEG (no data: prefix), max 768 px wide. */
export function captureFrame() {
  if (!video?.videoWidth) throw new Error('The camera is not ready yet.');
  const scale = Math.min(1, MAX_WIDTH / video.videoWidth);
  const w = Math.round(video.videoWidth * scale);
  const h = Math.round(video.videoHeight * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(video, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', QUALITY).split(',')[1];
}
