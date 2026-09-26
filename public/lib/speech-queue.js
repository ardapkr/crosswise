// Decides what the app says and when. Pure logic; the browser wrapper is public/js/speech.js.
// Rule: never talk over a more important message.
//
// A message = { text, priority, keep?, expiresAt? }
//   keep      = must be said even when a lot is going on (trip steps: "Get off now", the departure time…);
//               never trimmed from a full queue.
//   expiresAt = ms timestamp; a message still waiting after that is skipped ("In 40 metres…" is useless
//               once the user has walked past).

export const PRIORITY = { info: 0, navigation: 1, crossing: 2, danger: 3 };

const MAX_QUEUE = 4;

/**
 * What to do with an incoming message while `current` may be playing.
 * @returns 'speak' | 'interrupt' | 'queue' | 'drop'
 */
export function decide(current, incoming) {
  if (!current) return 'speak';
  if (current.text === incoming.text) return 'drop';
  if (incoming.priority > current.priority) return 'interrupt';
  // Info is chatter the user just asked for: the newest wins. Safety messages always finish.
  if (incoming.priority === PRIORITY.info && current.priority === PRIORITY.info) return 'interrupt';
  return 'queue';
}

/**
 * Adds a message, keeps highest priority first (stable), and trims the least important messages
 * when the queue is too long — but never a `keep` message.
 */
export function enqueue(queue, message) {
  if (queue.some((m) => m.text === message.text)) return queue; // already waiting
  const q = [...queue, message];
  // stable sort: higher priority first, arrival order kept inside the same priority
  q.sort((a, b) => b.priority - a.priority);
  while (q.length > MAX_QUEUE) {
    let i = q.length - 1;
    while (i >= 0 && q[i].keep) i--; // the least important message that may be dropped
    if (i < 0) break;
    q.splice(i, 1);
  }
  return q;
}

/** Returns [head, rest], skipping messages that expired while waiting. */
export function nextMessage(queue, now = 0) {
  const live = queue.filter((m) => !(m.expiresAt && m.expiresAt < now));
  if (live.length === 0) return [null, []];
  return [live[0], live.slice(1)];
}
