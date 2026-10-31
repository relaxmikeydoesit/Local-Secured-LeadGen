# secure-starter

A hardened starter for small local-business sites (dog trainers, mobile detailers, tax and insurance offices).
Static Astro output, strict CSP, a spam-protected contact form, hosted booking, and CI that fails the build when
a security control regresses.

## Why it is shaped this way

| Decision | Reason |
|---|---|
| Static output only | No server runtime, database or admin login to patch or attack |
| CSP with no `unsafe-inline` | Injected script or style simply will not run. `inlineStylesheets: 'never'` keeps Astro compatible |
| `scripts/check-output.mjs` | Fails the build if the output contains inline scripts, styles, handlers, `javascript:` URLs or unapproved external origins, so nobody "fixes" a problem by weakening the CSP |
| `scripts/sanitize-images.mjs` | Strips EXIF/GPS/XMP/IPTC. Photos from customers' homes otherwise publish their location. `npm run build` fails if any image still has metadata |
| Contact form on a Pages Function | Origin check, size limits, honeypot, strict validation, server-side Turnstile, header-injection-safe email. Nothing is stored, message text is never logged |
| Payments and bookings on the provider | Card data never touches this site, which keeps it out of PCI scope |

## Quick start

```bash
npm install            # also creates package-lock.json: commit it (CI uses `npm ci`)
cp .env.example .env
npm run dev
```

Per client, edit `src/site.config.ts` (name, services, area, booking URL), then:

1. `public/robots.txt` and `public/.well-known/security.txt`: set the real domain, contact and expiry date.
2. `src/pages/privacy.astro`: make it match what the site really does, and have it reviewed.
3. Put photos in `src/assets/`, run `npm run images:sanitize`.
4. If the booking provider is not Cal.com, change `frame-src` in `public/_headers`.

## Deploy (Cloudflare Pages)

- Build command `npm run build`, output directory `dist`.
- Variables: `PUBLIC_TURNSTILE_SITEKEY`, `SITE_URL`.
- Encrypted secrets: `TURNSTILE_SECRET_KEY`, `RESEND_API_KEY`, `CONTACT_TO`, `CONTACT_FROM` (see `.dev.vars.example`).
- The defaults in the example files are Cloudflare's always-pass **test** keys. Replace them before going live.
- Domain: enable DNSSEC, add CAA records, and for regulated clients set up SPF, DKIM, DMARC and MTA-STS.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Image check, build, then the inline-code/origin guard |
| `npm run preview` | Serves `dist/` with the real `_headers`, so you see production headers locally |
| `npm test` | Unit tests for the contact function, CSP guard and image sanitizer (no extra dependencies) |
| `npm run images:sanitize` / `images:check` | Strip or verify image metadata |

## CI (`.github/workflows/security.yml`)

Runs on every PR, push to `main` and weekly: gitleaks (history), Semgrep, `npm audit` and OSV-Scanner, tests + build
guards, and a ZAP baseline scan against a local preview of **this** repo's build. Dependabot groups Astro updates.

Only ever point ZAP at sites you own or have written permission to test.

## Known limits

- The CSP allows only Turnstile and Cal.com origins. Adding analytics, fonts or a chat widget means a deliberate edit to `_headers` and `check-output.mjs`.
- The form emails through Resend. Swap the `fetch` in `functions/api/contact.js` for another provider if you prefer.
- There is no rate limiting beyond Turnstile. For busy sites add a Cloudflare WAF rate-limiting rule on `/api/contact`.
- This is a baseline, not a guarantee. Sell it as defined controls plus ongoing maintenance, and have client contracts reviewed by a lawyer.
