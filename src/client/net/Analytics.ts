import type { GameEvent } from '@unicornrush/engine-api/net/Protocol';

/** Sends an anonymous single-player event for the stats. Fire and forget: never blocks or breaks the game. */
export function trackSolo(event: Omit<GameEvent, 'mode'>): void {
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
