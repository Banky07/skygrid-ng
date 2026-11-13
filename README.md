# SkyGrid NG — Airspace Intelligence · Nigeria FIR

Weather-aware, **shadow-mode** decision support for Nigerian airspace.
AI recommends (flow metering, convective vectors, runway changes, low-visibility
procedures) — **a human supervisor accepts or dismisses every recommendation.**

> ⚠️ Demonstration prototype. All traffic, weather and advisories are **simulated**.
> Not connected to NAMA/NiMet live feeds. Not for operational use.

## Stack
React 18 + TypeScript + Vite. Zero runtime dependencies beyond React.
Deterministic seeded simulation engine (`src/sim.ts`) — swap its adapters for
real ADS-B / NiMet / schedule feeds later without touching the UI.

## Local development
```bash
npm install
npm run dev
## Rules (v0.2.0)
All advisory thresholds live in `src/rules.json` (versioned, every value marked placeholder).
`src/rules.ts` holds pure functions that turn airport inputs into advisories, so the same rules
can later run on live ADS-B / METAR data or recorded replays. Each advisory carries its rule ID,
rule-set version and the exact inputs that triggered it. There is no confidence score.

## Shadow-mode wording
"Concur" records the supervisor's judgement. Any change to the simulated traffic picture is a
what-if effect inside the simulator only. Nothing is sent to aircraft or controllers.

## Scorecard
The Scorecard tab and the JSON export count, per rule, how many advisories were raised, concurred,
dismissed or expired, and how many were still valid after their check window (a persistence check,
not proof the recommendation helped). The decision log keeps up to 500 entries with rule ID,
rule version, inputs and operator.

## v0.4 changes (rules v0.3.0): live weather mode
- New **Weather source** switch in the control deck: Simulated, or Live METAR for LOS (DNMM) and ABV (DNAA).
- Live mode is a **hybrid**: weather at LOS and ABV is real (wind, visibility, thunderstorm / CB reports from the NOAA AviationWeather METAR feed). Traffic and all other weather are simulated, and a header badge and footer say so.
- Live mode runs in **real time** (the simulator's 30x clock is switched off) so advisories line up with real METARs, which update about hourly.
- New rule **TS-REPORTED-01** (thunderstorm or CB reported at the field) and a capacity reduction while one is reported. Per-airport wind drives the runway rule at live fields; variable wind does not trigger a runway advisory.
- Reports older than 90 min show STALE; older than 3 h are not used and the field falls back to simulated weather.
- Advisories raised from live data are verified no sooner than 75 min later, since METARs refresh hourly. Switching source expires pending advisories at LOS and ABV.
- `api/metar.js` is a Vercel serverless function that proxies the METAR feed for DNMM and DNAA only and caches for 5 minutes. For local dev, `vite.config.ts` proxies `/api/metar` to NOAA.
- `vercel.json` no longer rewrites `/api/*` to the app.
- `npm test` runs parser and hybrid-mode checks (tests/live.test.ts) against a real METAR fixture from 13 Nov 2026.
- Finding: OpenSky (open ADS-B) returned no aircraft over Nigeria in testing, so real traffic needs another source (airline data, NAMA, or a local receiver).

## v0.3.1 changes (rules v0.2.1)
- Landed flights show a dash for altitude and ground speed in the board and drawer; the export records 0.
- Demand now tapers through the evening (20:00 to 22:00) and ramps up from 05:00 instead of dropping off a cliff. Placeholder values, as before.

## v0.3 changes
- Dismissing an advisory asks for a reason (not relevant, already handled, threshold looks wrong, other). Reasons appear in the decision log, the Scorecard tab and the JSON export.
- Map labels show only for selected tracks, weather-affected, diverted or held aircraft, and approaches into a field with a pending advisory.
- Ground speed now falls with altitude, and each aircraft type has a ceiling. Performance figures are placeholders pending review by an aviation professional.
