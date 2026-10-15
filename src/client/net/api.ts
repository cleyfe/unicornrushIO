/**
 * Where the server is. The web game is served by the server itself, so relative
 * URLs work; the iOS app runs from capacitor://localhost and talks to the site.
 */
export const SITE = 'https://unicornrush.io/';

/** True inside the iOS app. */
export const inApp = location.protocol === 'capacitor:';

/** An /api URL that works on the web and in the app. */
export const apiUrl = (path: string): string => (inApp ? new URL(path, SITE).toString() : path);

/** The game's public address, for invite links (in the app, the website). */
export const gameUrl = (): string => (inApp ? SITE : `${location.origin}${location.pathname}`);
