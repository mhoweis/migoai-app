import { Platform } from 'react-native';

// Web only: mobile browsers report a viewport taller than the visible area
// until the URL bar collapses, which leaves the bottom tab bar overlapping or
// clipped. Track the dynamic viewport height instead of the static one.
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const preconnect = document.createElement('link');
  preconnect.rel = 'preconnect';
  preconnect.href = 'https://fonts.gstatic.com';
  preconnect.crossOrigin = 'anonymous';
  document.head.appendChild(preconnect);

  const font = document.createElement('link');
  font.rel = 'stylesheet';
  font.href = 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;700;800&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap';
  document.head.appendChild(font);

  const style = document.createElement('style');
  style.textContent = `
    html, body, #root { height: 100%; margin: 0; }
    @supports (height: 100dvh) {
      html, body, #root { height: 100dvh; }
    }
    body { overscroll-behavior: none; touch-action: manipulation; }
    [class*="css-text"]:not([class*="r-fontFamily"]):not([class*="icon"]):not([style*="font-family"]), input, textarea {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
    }
    html[lang="ar"] [class*="css-text"]:not([class*="icon"]):not([style*="font-family: ionicons"]), html[lang="ar"] input, html[lang="ar"] textarea {
      font-family: 'IBM Plex Sans Arabic', sans-serif !important;
    }
    html[dir="rtl"] [class*="css-text"]:not([class*="icon"]):not([style*="font-family: ionicons"]), html[dir="rtl"] input, html[dir="rtl"] textarea {
      font-family: 'IBM Plex Sans Arabic', sans-serif !important;
    }
    html[lang="ar"] h1, html[lang="ar"] h2, html[lang="ar"] h3, html[lang="ar"] [data-display="true"],
    html[dir="rtl"] h1, html[dir="rtl"] h2, html[dir="rtl"] h3, html[dir="rtl"] [data-display="true"] {
      font-family: 'IBM Plex Sans Arabic', sans-serif !important;
    }
    h1, h2, h3, [data-display="true"] {
      font-family: 'Bricolage Grotesque', 'Plus Jakarta Sans', sans-serif;
    }
    * { -webkit-tap-highlight-color: transparent; }
    button, a, [role="button"], [tabindex] { touch-action: manipulation; }
    input, textarea, [contenteditable="true"], select {
      caret-color: auto;
    }
    :focus-visible:not(input):not(textarea):not(select):not([contenteditable="true"]) {
      outline: 2px solid #D61F63;
      outline-offset: 2px;
    }
    input:focus-visible, textarea:focus-visible, select:focus-visible { outline: none; }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        scroll-behavior: auto !important;
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
      }
    }
  `;
  document.head.appendChild(style);

  const viewport = document.querySelector('meta[name="viewport"]');
  if (viewport && !viewport.getAttribute('content')?.includes('viewport-fit')) {
    viewport.setAttribute('content', `${viewport.getAttribute('content')}, viewport-fit=cover`);
  }

  document.title = 'Migo · UAE events in one place';
  let themeColor = document.querySelector('meta[name="theme-color"]');
  if (!themeColor) {
    themeColor = document.createElement('meta');
    themeColor.setAttribute('name', 'theme-color');
    document.head.appendChild(themeColor);
  }
  themeColor.setAttribute('content', '#140F2E');
}
