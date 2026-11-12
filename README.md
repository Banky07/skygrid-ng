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