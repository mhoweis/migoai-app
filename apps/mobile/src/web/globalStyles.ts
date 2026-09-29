import { Platform } from 'react-native';

// Web only: mobile browsers report a viewport taller than the visible area
// until the URL bar collapses, which leaves the bottom tab bar overlapping or
// clipped. Track the dynamic viewport height instead of the static one.
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const font = document.createElement('link');
  font.rel = 'stylesheet';
  font.href = 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap';
  document.head.appendChild(font);

  const style = document.createElement('style');
  style.textContent = `
    html, body, #root { height: 100%; margin: 0; }
    @supports (height: 100dvh) {
      html, body, #root { height: 100dvh; }
    }
    body { overscroll-behavior: none; }
    /* Brand typeface for text that doesn't set its own font (icon fonts keep theirs). */
    [class*="css-text"]:not([class*="r-fontFamily"]):not([style*="font-family"]), input, textarea {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
    }
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
