// Camera assistant: Find my bus (live scan), Check crossing light, Read text, Describe surroundings.
// Rules live in /lib: lib/scan.js (pacing, 2-frame agreement, still looking, timeout) and
// lib/look.js (validation + safe wording). This file does camera, fetch, sound and DOM only.

import { getJSON } from './api.js';
import { startCamera, stopCamera, captureFrame, CameraCancelled } from './camera.js';
import { tick, chime } from './sound.js';
import { normalizeResult, spokenResult, normalizeLine } from '../lib/look.js';
import { createScan, shouldSend, markSent, onResult, onError, onTick } from '../lib/scan.js';

const $ = (id) => document.getElementById(id);
const LOOP_MS = 200;      // how often we check "time to send a frame?"
const MAX_ERRORS = 5;     // give up the scan after this many failed requests in a row
const SETTLE_MS = 700;    // single photo: let exposure and focus settle first
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TITLES = { bus: 'Find my bus', light: 'Check the light', read: 'Read text', describe: 'Describe surroundings' };
const TILES = { bus: 'look-bus', light: 'look-light', read: 'look-read', describe: 'look-describe' };

const START_TEXT = {
  light: 'Checking the light. Point the phone at the light across the road and hold it steady.',
  read: 'Reading. Hold the phone steady, about 30 centimetres from the text.',
  describe: 'Looking around. Hold the phone upright, pointing ahead.',
};

/**
 * @param {{ speak: Function, testVideoUrl?: string|null }} opts
 */
export function initLook({ speak, testVideoUrl = null }) {
  let scan = null;        // bus scan state from lib/scan.js, null when not scanning
  let loop = null;        // setInterval id of the scan loop
  let generation = 0;     // bumps on every start/stop, so late answers of an old scan are ignored
  let errors = 0;
  let busy = false;       // a single-photo check is running
  let starts = 0;         // counts bus-scan starts: only the newest one may run

  const setLive = (text) => { $('look-live').textContent = text; };
  // The camera view covers the search and the sheet: take them out of reach (screen readers too) meanwhile.
  const covered = (on) => { for (const el of document.querySelectorAll('.top, #sheet')) el.inert = on; };

  // The camera panel opens at the top of the sheet; the tile of the running feature is highlighted.
  async function openCamera(mode) {
    $('camera-title').textContent = TITLES[mode];
    $('bus-line-row').hidden = mode !== 'bus';
    for (const [m, id] of Object.entries(TILES)) $(id).classList.toggle('active', m === mode);
    $('camera-box').hidden = false;
    covered(true);
    await startCamera($('camera'), { testVideoUrl });
  }

  function closeCamera() {
    stopCamera();
    $('camera-box').hidden = true;
    covered(false);
    for (const id of Object.values(TILES)) $(id).classList.remove('active');
    setLive('');
  }

  async function lookOnce(mode, image, context = {}) {
    const data = await getJSON('/api/look', { method: 'POST', body: { mode, image, context }, timeoutMs: 15000 });
    return normalizeResult(mode, data.result); // validate again: never trust the network blindly
  }

  // ---------- Find my bus (live scan) ----------

  function handleScanEvents(events) {
    for (const e of events) {
      if (!scan) return;
      const target = scan.targetLine;
      if (e.type === 'found') {
        chime();
        navigator.vibrate?.([200, 100, 200]);
        speak(spokenResult('bus', e.result, { targetLine: target }), 'navigation');
        stopScan(false);
      } else if (e.type === 'wrong') {
        speak(spokenResult('bus', e.result, { targetLine: target }), 'navigation');
      } else if (e.type === 'still_looking') {
        speak('Still looking.', 'info');
      } else if (e.type === 'timeout') {
        speak("I couldn't find it. You may want to ask someone nearby.", 'navigation');
        stopScan(false);
      }
    }
  }

  async function sendFrame(now) {
    let image;
    try { image = captureFrame(); } catch { return; } // camera not ready yet: try on the next loop
    const gen = generation;
    scan = markSent(scan, now);
    tick(); // soft tick per scanned frame
    setLive(`Scanning${scan.targetLine ? ` for ${scan.targetLine}` : ''}… frame ${scan.frames}`);
    try {
      const result = await lookOnce('bus', image, { targetLine: scan.targetLine });
      if (!scan || gen !== generation) return; // stopped or restarted meanwhile
      errors = 0;
      let events;
      [scan, events] = onResult(scan, result, performance.now());
      setLive(result.status === 'found' ? `Seen: ${result.line}` : `Frame ${scan.frames}: ${result.status.replace('_', ' ')}`);
      handleScanEvents(events);
    } catch (e) {
      if (!scan || gen !== generation) return;
      scan = onError(scan);
      errors++;
      if (errors === 1) speak(e.message, 'info');
      if (errors >= MAX_ERRORS) {
        speak(`${e.message} Stopping the scan.`, 'navigation');
        stopScan(false);
      }
    }
  }

  /** line: from a voice command ("find my bus 13A"); the button uses whatever is in the "Your line" field. */
  async function startBusScan(line) {
    stopAll();
    if (typeof line === 'string') $('bus-line').value = normalizeLine(line);
    const my = ++starts; // a newer start (double tap, voice, Enter in the line field) replaces this one
    try {
      await openCamera('bus');
    } catch (e) {
      if (my === starts && !(e instanceof CameraCancelled)) { closeCamera(); speak(e.message, 'navigation'); }
      return;
    }
    if (my !== starts) return;
    // read the line now: the user may have typed it while the camera was starting
    const target = normalizeLine($('bus-line').value);
    $('bus-line').value = target;
    generation++;
    errors = 0;
    scan = createScan({ targetLine: target, now: performance.now() });
    speak(`${target ? `Looking for ${target}.` : 'Looking for a bus or tram.'} Point the camera at the front of arriving buses.`, 'info');
    if (document.activeElement !== $('bus-line')) $('look-stop').focus(); // don't interrupt someone typing the line
    loop = setInterval(() => {
      if (!scan) return;
      const now = performance.now();
      let events;
      [scan, events] = onTick(scan, now);
      handleScanEvents(events);
      if (scan && shouldSend(scan, now)) sendFrame(now);
    }, LOOP_MS);
  }

  /** The user typed a line while scanning: keep the camera running, look for the new line from now on. */
  function retarget(line) {
    const target = normalizeLine(line);
    $('bus-line').value = target;
    // fresh agreement + 60 s timeout for the new line; a frame already on its way still counts (one request at a time)
    scan = { ...createScan({ targetLine: target, now: performance.now() }), inFlight: scan.inFlight, lastSentAt: scan.lastSentAt, frames: scan.frames };
    speak(target ? `Looking for ${target}.` : 'Looking for any bus or tram.', 'info');
  }

  function stopScan(announce = true) {
    if (loop) clearInterval(loop);
    loop = null;
    const wasScanning = Boolean(scan);
    scan = null;
    generation++;
    closeCamera();
    if (announce && wasScanning) speak('Scan stopped.');
  }

  // ---------- one photo: light, read, describe ----------

  async function single(mode) {
    if (busy) return;
    stopAll();
    busy = true;
    try {
      await openCamera(mode);
      speak(START_TEXT[mode], 'info');
      await sleep(SETTLE_MS);
      const image = captureFrame();
      closeCamera(); // one photo is all we need: camera off right away (battery + privacy)
      tick();
      const result = await lookOnce(mode, image);
      speak(spokenResult(mode, result), 'navigation');
    } catch (e) {
      closeCamera();
      if (!(e instanceof CameraCancelled)) speak(e.message, 'navigation');
    } finally {
      busy = false;
    }
  }

  function stopAll(announce = false) {
    stopScan(announce);
    closeCamera();
  }

  // ---------- wiring ----------
  $('look-bus').addEventListener('click', () => startBusScan());
  $('look-light').addEventListener('click', () => single('light'));
  $('look-read').addEventListener('click', () => single('read'));
  $('look-describe').addEventListener('click', () => single('describe'));
  $('look-stop').addEventListener('click', () => stopAll(true));
  $('bus-line').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (scan) retarget($('bus-line').value);
    else startBusScan(); // also while the camera is starting: this start replaces that one and reads the field
  });
  // Leaving the app (screen locked, other app): the camera stops anyway, so end cleanly.
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopAll(); });

  return {
    findBus: (line) => startBusScan(line ?? undefined),
    checkLight: () => single('light'),
    read: () => single('read'),
    describe: () => single('describe'),
    stop: () => stopAll(true),
    get scanning() { return Boolean(scan); },
  };
}
