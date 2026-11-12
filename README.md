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

## v0.3 changes
- Dismissing an advisory asks for a reason (not relevant, already handled, threshold looks wrong, other). Reasons appear in the decision log, the Scorecard tab and the JSON export.
- Map labels show only for selected tracks, weather-affected, diverted or held aircraft, and approaches into a field with a pending advisory.
- Ground speed now falls with altitude, and each aircraft type has a ceiling. Performance figures are placeholders pending review by an aviation professional.
