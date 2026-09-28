import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);

// Web only: mobile browsers report a viewport taller than the visible area
// until the URL bar collapses, which leaves the bottom tab bar overlapping or
// clipped. Track the dynamic viewport height instead of the static one.
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    html, body, #root { height: 100%; margin: 0; }
    @supports (height: 100dvh) {
      html, body, #root { height: 100dvh; }
    }
    body { overscroll-behavior: none; }
    /* Suppress the browser's blue focus ring / tap flash on inputs. */
    * { -webkit-tap-highlight-color: transparent; }
    input, textarea, [contenteditable="true"], select {
      outline: none !important;
      caret-color: auto;
    }
    *:focus { outline: none; }
    input:focus-visible, textarea:focus-visible { outline: none; }
  `;
  document.head.appendChild(style);
}
