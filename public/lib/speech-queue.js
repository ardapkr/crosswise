// Decides what the app says and when. Pure logic; the browser wrapper is public/js/speech.js.
// Rule: never talk over a more important message.

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
  return 'queue';
}

/** Adds a message, keeps highest priority first (stable), trims the least important. */
export function enqueue(queue, message) {
  const q = [...queue, message];
  // stable sort: higher priority first, arrival order kept inside the same priority
  q.sort((a, b) => b.priority - a.priority);
  return q.slice(0, MAX_QUEUE);
}

/** Returns [head, rest]. */
export function nextMessage(queue) {
  if (queue.length === 0) return [null, []];
  return [queue[0], queue.slice(1)];
}
