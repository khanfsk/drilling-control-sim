# Drilling Control Sim

**Closed-loop auto-driller simulation for torsional stick-slip mitigation.**

Built on real WITSML telemetry from Equinor's Volve open dataset (Well 15/9-F-9 A, 2009). The system detects stick-slip torsional vibration from surface and downhole sensors, then simulates a PI-inspired state machine controller that autonomously adjusts Weight-on-Bit (WOB) and rotary speed (RPM) to suppress it.

**Live demo:** [drillmanage.com](https://drillmanage.com) · [drilling-control-sim.vercel.app](https://drilling-control-sim.vercel.app)

---

## What is stick-slip?

Stick-slip is a torsional vibration mode where the drill bit alternates between momentarily sticking (full stop, torque builds) and suddenly slipping (bit accelerates to 2–3× surface RPM). It is one of the most damaging downhole failure modes — it shreds PDC bit cutters, breaks drill string connections, and kills MWD tools.

The key insight from this dataset: **surface RPM varied by only ±1 rpm during confirmed stick-slip events while the downhole MWD sensor recorded oscillations up to 381 rpm peak-to-peak** — a 380× attenuation by the drill string acting as a torsional spring. This is why surface RPM alone is an unreliable detector; a fused signal is required.

---

## Project structure

```
drilling-control-sim/
│
├── src/                        # Python detection and control pipeline
│   ├── data_loader.py          # CSV ingestion, filtering, cleaning
│   ├── detection.py            # Composite Severity Score (CSS) computation
│   └── controller.py          # State machine controller + physics model
│
├── preprocessing/
│   └── preprocess.py           # Runs the full pipeline, outputs JSON for the web app
│
└── web/                        # Next.js front-end
    ├── public/data/            # Pre-computed JSON (telemetry, events, metadata)
    └── src/
        ├── app/                # Next.js App Router (page.tsx, layout.tsx, globals.css)
        ├── components/         # All UI components
        └── lib/                # Types, utilities, client-side detection + controller
```

---

## Detection: Composite Severity Score (CSS)

The CSS fuses three signals into a single 0–1 severity index:

| Signal | Weight | Source |
|--------|--------|--------|
| MWD downhole PKtoPK RPM | **60%** | BHA sensor, normalized by rolling mean RPM |
| Surface torque deviation | **30%** | Top drive torque vs rolling median baseline |
| Surface RPM oscillation | **10%** | RPM standard deviation over rolling window |

```
CSS = clip(0.6 × MWD_SSI + 0.3 × torque_deviation + 0.1 × RPM_SSI, 0, 1)
```

MWD data is only transmitted at survey intervals (~9.9% coverage). The pipeline forward-fills readings with a limit of 8 samples to bridge short gaps without over-interpolating.

**Validation against MWD ground truth:** Pearson r = 0.758, precision = 1.00 (no false positives).

---

## Controller: state machine

The auto-driller runs a four-state machine:

```
NORMAL ──(CSS ≥ threshold)──► DETECTING ──(sustained)──► MITIGATING ──(CSS cleared)──► RECOVERING ──► NORMAL
```

| State | Action |
|-------|--------|
| **NORMAL** | Hold nominal WOB and RPM |
| **DETECTING** | CSS above threshold — monitoring for sustained elevation (holdoff timer) |
| **MITIGATING** | WOB ↓ proportional to CSS excess; RPM ↑ up to configured maximum |
| **RECOVERING** | CSS cleared — ramp WOB back to nominal over time |

**WOB mitigation:**
```
WOB_set = max(WOB_nominal × floor, WOB_nominal − Kp × (CSS − threshold) × WOB_nominal)
```

**Default parameters:** CSS threshold 0.25 · min duration 5 samples · Kp(WOB) 0.30 · WOB floor 35% · max RPM increase +25 rpm · holdoff 5 samples.

All parameters are tunable in real time via the interactive simulation panel.

---

## Physics model

The torsional response is simulated with a simplified spring-damper ODE (Euler integration):

```
I × dω/dt = T_drive − k × θ_twist − c × ω − τ_bit
```

Where `τ_bit = μ × WOB × r_bit` (Pessier & Fear 1992 bit-rock friction model). The drill string is modelled as a linear torsional spring with stiffness `k` and damping `c`. Angular acceleration is clamped to ±50 rad/s² and twist to ±5 rad to prevent numerical overflow on coarse timesteps.

---

## Dataset

| Property | Value |
|----------|-------|
| Source | Equinor Volve open dataset — NPD open government licence |
| Well | 15/9-F-9 A |
| Section | 12.25-in, North Sea |
| Period | July 2009 |
| Raw rows | ~420,000 at ~4 s intervals |
| On-bottom rows (WOB > 0.5 kkgf, RPM > 15) | 22,181 |
| After 2× downsampling | 11,090 rows |
| Depth range | 1,953 – 2,793 m MD |
| MWD max PKtoPK | 381 rpm |
| Drilling days | 6.68 |

The raw CSV (~427 MB) is excluded from the repo by `.gitignore`. Run the preprocessing pipeline to regenerate the JSON files from your own copy.

---

## Running locally

### Prerequisites

- Python 3.10+
- Node.js 20+

### 1 — Preprocessing (Python pipeline)

Place the Volve time CSV at `archive 2/Norway-NA-15_47_9-F-9 A time.csv`, then:

```bash
pip install pandas numpy scipy
python preprocessing/preprocess.py
```

This writes three files to `web/public/data/`:
- `telemetry.json` — 11k downsampled drilling rows
- `events.json` — detected stick-slip events with severity labels
- `metadata.json` — well info, validation metrics, controller config

### 2 — Web app (Next.js)

```bash
cd web
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 3 — Production build

```bash
cd web
npm run build
```

The output is a fully static site — no server required. Deploy anywhere that serves static files.

---

## Deployment

The app is deployed to Vercel as a static export. Future redeployments:

```bash
cd web
vercel --prod
```

To update the data (re-run preprocessing with new parameters), commit the regenerated JSON files and redeploy.

---

## Architecture decisions

**Why static JSON instead of an API?**
The Volve dataset never changes, and all detection + control logic runs client-side in TypeScript. Pre-computing the data at build time means zero backend, instant page loads, and free global CDN distribution via Vercel.

**Why TypeScript for the controller?**
The client-side controller (`clientController.ts`) mirrors the Python logic exactly. This lets the simulation respond to parameter changes in ~5 ms without a network round-trip — every slider move is instant.

**Why attack-release EMA on the gauge?**
The raw CSS value at a single time point is highly variable (events last 20–200 samples; at 100× playback speed events flash past in milliseconds). An attack-release envelope (α_attack = 0.4, α_release = 0.08) makes the gauge behave like a real analog instrument — fast to react, slow to recover — without obscuring actual severity.

**Why 60fps DOM cursor, 15fps React state?**
The playback cursor (`ReferenceLine` equivalent) updates via direct DOM manipulation on every animation frame. React state is throttled to ~15fps so the chart, gauge, and live readings re-render smoothly without the full 60fps update cost.

---

## References

- Pessier, R.C. & Fear, M.J. (1992). *Quantifying common drilling problems with mechanical specific energy and a bit-specific coefficient of sliding friction.* SPE 24584.
- Equinor Volve Data Village — [equinor.com/energy/volve-data-sharing](https://www.equinor.com/energy/volve-data-sharing)
- WITSML standard — [energistics.org](https://www.energistics.org)

---

## License

Source code: MIT.
Dataset: Equinor Volve open dataset — Norwegian Open Government Data Licence (NLOD).
