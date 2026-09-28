/**
 * Puppeteer configuration.
 *
 * `puppeteer` is a declared dependency but is not imported anywhere in the
 * codebase yet — it is kept for future direct-scraping work (the Places
 * feature uses the separate Dockerised google-maps-scraper instead).
 *
 * Its postinstall otherwise downloads a ~200MB Chrome build on every
 * `npm install`, which is slow and a frequent failure point behind proxies,
 * corporate networks and CI. Skipping it keeps installs fast and reliable.
 *
 * When you actually start using Puppeteer, install a browser explicitly:
 *
 *   npx puppeteer browsers install chrome
 *
 * ...or delete this file to restore the automatic download.
 */
module.exports = {
  skipDownload: true,
};
