# Dependency audit: open findings

Triaged 26 November 2026 from `npm audit` on the production lockfile. **Review again by 26 December 2026**, or sooner if any item below starts handling user input.

Render's build log runs `npm audit` over the whole monorepo, so it also counts packages that only the website/app build or developer tools use. Those don't run on the API server.

## Fixed in this change (67 → 48)
| Package | Was | Why it mattered |
| --- | --- | --- |
| sharp 0.34 → 0.35.5 | high | Decodes user uploads; libvips GIF/TIFF/VIPS decoder bugs (GHSA-f88m-g3jw-g9cj) |
| sharp decoders | — | Every decoder except JPEG, PNG, WebP and GIF is now blocked, so crafted TIFF/SVG/PDF/HEIF files are refused before decoding |
| firebase-admin, socket.io, mysql2, mariadb, @prisma/adapter-mariadb | critical (protobufjs) + 8 high | Installed but never imported; removed |

## Open, server (apps/backend)
| Package(s) | Severity | Reachable from user input? | Why deferred | Fix |
| --- | --- | --- | --- | --- |
| prisma, @prisma/config, deepmerge-ts, effect | high | No. Prisma **CLI** (generate/migrate at build time); the runtime client isn't affected | Prisma 6 → 7 is a major upgrade (schema/config changes) | Upgrade to Prisma 7 in its own PR with a full test run |
| puppeteer, puppeteer-core, @puppeteer/browsers, extract-zip, chromium-bidi, zod (nested), ws, ip-address | high | No. Used by one scraper (`my-dubai-communities.provider.ts`) against a fixed site; browser download is skipped in builds | Puppeteer 24 → 25 is major | Upgrade puppeteer, or drop the provider if unused |
| lodash (via bull, cloudinary) | high | No. The `_.template` issue needs attacker-controlled template options; we never call it | Nested copy; overrides disturbed the mobile tree | Clears when bull/cloudinary update |
| defu, picomatch, brace-expansion, minimatch | high | No. Build/config tooling | Same as above | Routine update |

## Open, website/app build and developer tools (apps/mobile, root)
| Package(s) | Severity | Ships to users? | Note |
| --- | --- | --- | --- |
| react-native, react-devtools-core, shell-quote | critical | No. Developer tools (React DevTools) | npm suggests *downgrading* React Native, which is wrong; wait for Expo/RN update |
| @expo/cli, flatted, js-yaml, source-map-js, minimatch | high | No. Build tooling | Routine Expo update |
| passkit-generator, joi | high | Server, Apple Wallet passes built from our own data | npm suggests a downgrade; check for a fixed 3.x |
| query-string, decode-uri-component, @react-navigation/core, nanoid | high | Yes, in the web bundle | Worst case a crafted link slows the visitor's own tab; update with the next Expo upgrade |
