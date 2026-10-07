import { extractPage } from '../src/services/tourism/extract';
import { getTourismSite } from '../src/services/tourism/sources';

const site = getTourismSite('visit-al-ain')!;
const firstParagraph = 'Al Ain offers a rich collection of cultural landmarks and visitor experiences. '.repeat(4);
const secondParagraph = 'Visitors can explore heritage sites, public gardens, and other attractions throughout the oasis city. '.repeat(4);

describe('extractPage', () => {
  it('removes boilerplate, strips the site suffix, and keeps headed passages', () => {
    const html = `
      <html>
        <head>
          <title>Fallback title</title>
          <meta property="og:title" content="Arab Tourism Capital 2026 | Visit Al Ain">
          <link rel="canonical" href="https://www.visitalain.ae/en/heritage">
        </head>
        <body>
          <nav>Navigation content must be removed.</nav>
          <div class="cookie-banner">Cookie consent content must be removed.</div>
          <script>script content must be removed</script>
          <main>
            <h1>Arab Tourism Capital</h1>
            <p>${firstParagraph}</p>
            <h2>Heritage places</h2>
            <p>${secondParagraph}</p>
            <p aria-hidden="true">Hidden content must be removed.</p>
          </main>
          <footer>Footer content must be removed.</footer>
        </body>
      </html>`;

    const result = extractPage(html, 'https://visitalain.ae/en/arab-tourism-capital-2026', site);
    const text = result.passages.map(passage => passage.text).join(' ');

    expect(result.title).toBe('Arab Tourism Capital 2026');
    expect(result.canonicalUrl).toBe('https://visitalain.ae/en/heritage');
    expect(result.passages.length).toBeGreaterThan(0);
    expect(result.passages.every(passage => passage.text.length >= 120 && passage.text.length <= 1200)).toBe(true);
    expect(result.passages.some(passage => passage.heading === 'Heritage places')).toBe(true);
    expect(text).toContain('cultural landmarks');
    expect(text).not.toMatch(/Navigation content|Cookie consent|script content|Hidden content|Footer content/);
  });

  it('uses the fetched URL when the canonical URL is off host', () => {
    const html = `
      <link rel="canonical" href="https://other.example/en/guide">
      <main><h1>Visitor guide</h1><p>${firstParagraph}</p></main>`;
    const result = extractPage(html, 'https://visitalain.ae/en/guide', site);
    expect(result.canonicalUrl).toBe('https://visitalain.ae/en/guide');
  });
});
