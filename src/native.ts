import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

// Android app only: distance from the status bar / navigation bar and status bar icon colour.
interface Insets { top: number; bottom: number }
interface PlanBars {
  getInsets(): Promise<Insets>;
  setStyle(o: { dark: boolean }): Promise<void>;
  addListener(event: 'insets', cb: (i: Insets) => void): Promise<PluginListenerHandle>;
}

const Bars = registerPlugin<PlanBars>('PlanBars');

export function initNative() {
  if (!Capacitor.isNativePlatform()) return;
  const root = document.documentElement;
  root.classList.add('native');
  const apply = (i: Insets) => {
    if (!i) return;
    root.style.setProperty('--native-top', `${Math.round(i.top)}px`);
    root.style.setProperty('--native-bottom', `${Math.round(i.bottom)}px`);
  };
  Bars.getInsets().then(apply).catch(() => {});
  Bars.addListener('insets', apply).catch(() => {});
  const sync = () => Bars.setStyle({ dark: root.dataset.theme === 'dark' }).catch(() => {});
  sync();
  new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
}
