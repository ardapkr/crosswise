// Live bus scan rules (pure, time is passed in so tests don't wait):
//  - at most one request in flight, ~1 frame every 1.2 s
//  - announce a line only when 2 consecutive frames agree on it
//  - with a target line: "not your bus" keeps scanning (no repeat within 15 s), the right bus ends it
//  - "still looking" every ~10 s without an announcement, give up after 60 s
//
// Usage (see public/js/look-ui.js):
//   let s = createScan({ targetLine, now });
//   loop: if (shouldSend(s, now)) { s = markSent(s, now); send frame... }
//         on answer: [s, events] = onResult(s, result, now)   on failure: s = onError(s, now)
//         every tick: [s, events] = onTick(s, now)

import { normalizeLine, directionMatch } from './look.js';

export const SCAN = {
  intervalMs: 1200,
  stillLookingMs: 10000,
  timeoutMs: 60000,
  wrongRepeatMs: 15000,
  unknownDirectionFrames: 2, // our line, direction unreadable: look this many more frames before announcing
};

/**
 * targetDirection = { headsign, origin } (from the trip): the right line is only "your bus" if the
 * destination display fits. The same line stops in both directions.
 */
export function createScan({ targetLine = '', targetDirection = null, now }) {
  return {
    targetLine: normalizeLine(targetLine),
    targetDirection: targetDirection?.headsign ? targetDirection : null,
    previousDestination: '',
    unknownDirection: 0,
    startedAt: now,
    lastSentAt: -Infinity,
    lastSpokenAt: now,
    inFlight: false,
    previousLine: null, // line seen in the previous answered frame (for agreement)
    wrongAt: {},        // line → time we last said "not your bus"
    frames: 0,
    done: false,
  };
}

export function shouldSend(s, now) {
  return !s.done && !s.inFlight && now - s.lastSentAt >= SCAN.intervalMs;
}

export function markSent(s, now) {
  return { ...s, inFlight: true, lastSentAt: now, frames: s.frames + 1 };
}

export function onError(s) {
  return { ...s, inFlight: false };
}

/** A frame's normalized bus result came back. Returns [state, events]. */
export function onResult(s, result, now) {
  if (s.done) return [{ ...s, inFlight: false }, []];
  const next = { ...s, inFlight: false };
  if (result.status !== 'found' || !result.line) {
    next.previousLine = null;
    return [next, []];
  }

  const line = normalizeLine(result.line);
  const agreed = s.previousLine === line;
  // the destination may be readable in one frame and not the other: keep the last one we read
  const destination = result.destination || (agreed ? s.previousDestination : '');
  next.previousLine = line;
  next.previousDestination = destination;
  if (!agreed) return [next, []];

  if (s.targetLine && line === s.targetLine && s.targetDirection) {
    const seen = { ...result, destination };
    const direction = directionMatch(destination, s.targetDirection);
    if (direction === 'wrong') {
      const key = `${line}>wrong`;
      const last = s.wrongAt[key];
      if (last !== undefined && now - last < SCAN.wrongRepeatMs) return [next, []];
      next.wrongAt = { ...s.wrongAt, [key]: now };
      next.lastSpokenAt = now;
      return [next, [{ type: 'wrong', line, result: seen, isTarget: false, direction }]];
    }
    if (direction === 'unknown' && s.unknownDirection < SCAN.unknownDirectionFrames) {
      next.unknownDirection = s.unknownDirection + 1;
      return [next, []];
    }
    next.done = true;
    next.lastSpokenAt = now;
    return [next, [{ type: 'found', line, result: seen, isTarget: true, direction }]];
  }

  if (!s.targetLine || line === s.targetLine) {
    next.done = true;
    next.lastSpokenAt = now;
    return [next, [{ type: 'found', line, result, isTarget: s.targetLine ? true : null }]];
  }

  // Agreed on a line that is not the user's bus
  const last = s.wrongAt[line];
  if (last !== undefined && now - last < SCAN.wrongRepeatMs) return [next, []];
  next.wrongAt = { ...s.wrongAt, [line]: now };
  next.lastSpokenAt = now;
  return [next, [{ type: 'wrong', line, result, isTarget: false }]];
}

/** Time passes. Returns [state, events] with 'still_looking' or 'timeout'. */
export function onTick(s, now) {
  if (s.done) return [s, []];
  if (now - s.startedAt >= SCAN.timeoutMs) return [{ ...s, done: true }, [{ type: 'timeout' }]];
  if (now - s.lastSpokenAt >= SCAN.stillLookingMs) return [{ ...s, lastSpokenAt: now }, [{ type: 'still_looking' }]];
  return [s, []];
}
