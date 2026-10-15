import { inApp } from './net/api';

type Haptic = 'light' | 'medium' | 'warning' | 'success' | 'error';

/** The native plugins, loaded only inside the iOS app (the website never downloads them). */
const plugins = inApp ? Promise.all([import('@capacitor/haptics'), import('@capacitor/status-bar')]) : null;

/** Sets up the app shell: light status-bar text over the dark game. */
export function initNative(): void {
  void plugins?.then(([, { StatusBar, Style }]) => StatusBar.setStyle({ style: Style.Dark })).catch(() => {});
}

/** A short vibration in the app (none on the web). */
export function haptic(kind: Haptic): void {
  void plugins
    ?.then(([{ Haptics, ImpactStyle, NotificationType }]) => {
      if (kind === 'light') return Haptics.impact({ style: ImpactStyle.Light });
      if (kind === 'medium') return Haptics.impact({ style: ImpactStyle.Medium });
      const type = kind === 'warning' ? NotificationType.Warning : kind === 'success' ? NotificationType.Success : NotificationType.Error;
      return Haptics.notification({ type });
    })
    .catch(() => {});
}
