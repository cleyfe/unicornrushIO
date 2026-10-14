import type { GameEvent } from '@unicornrush/engine-api/net/Protocol';

/** Sends an anonymous event for the stats. Fire and forget: never blocks or breaks the game. */
function send(event: Omit<GameEvent, 'mode'>): void {
  try {
    void fetch('api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // No network API (tests, very old browsers): nothing to do.
  }
}

/** A single-player match started or finished. */
export const trackSolo = (event: Omit<GameEvent, 'mode'>): void => send(event);

/** One page load of the game, from the home page or a room invite link. */
export const trackVisit = (entry: 'home' | 'invite'): void => send({ type: 'visit', reason: entry });
