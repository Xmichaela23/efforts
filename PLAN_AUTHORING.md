# Plan Authoring (Plug‑and‑Play JSON)

## Purpose
Author training plans as deterministic JSON files that the app renders into friendly text with exact targets and durations using user baselines. No UI builders required.

## File Format
- Schema: `src/services/plans/contracts/universal_plan.schema.json`
- Required: `name`, `duration_weeks`, `sessions_by_week`
- Optional: `notes_by_week`, `swim_unit` ("yd"|"m"), `export_hints`

### sessions_by_week
```
"sessions_by_week": {
  "1": [
    {
      "day": "Tuesday",
      "discipline": "run",
      "description": "VO2 intervals [800m_x6_R2min]",
      "tags": ["run_quality"],
      "steps_preset": [
        "warmup_easy_10min",
        "interval_6x800m_5kpace_R2min",
        "cooldown_easy_10min"
      ]
    }
  ]
}
```

### export_hints (ranges/tolerances)
```
"export_hints": {
  "pace_tolerance_quality": 0.04,
  "pace_tolerance_easy": 0.06,
  "power_tolerance_SS_thr": 0.05,
  "power_tolerance_VO2": 0.10
}
```
- Run easy/long and warmup/cooldown use `pace_tolerance_easy`.
- Run quality (tempo/threshold/VO2/rep) uses `pace_tolerance_quality`.
- Bike SS/Threshold uses `power_tolerance_SS_thr`; VO2 uses `power_tolerance_VO2`.
- Endurance rides can be treated as “easy” tolerances if using pace; for power, use narrow Z2 or your default.

## Token Grammar (steps_preset)
- Warm‑up: `warmup_easy_<minutes>min`
- Cool‑down: `cooldown_easy_<minutes>min`
- Intervals (run): `interval_<reps>x<distance><m|km|mi>_<alias|pace>_R<rest>`
  - Examples: `interval_6x800m_5kpace_R2min`, `interval_5x1km_at_Tempo_R90s`
- Tempo/Steady blocks: `tempo_<minutes>min_at_<alias>` or `steady_<minutes>min`
- Bike blocks: `bike_ss_<minutes>min`, `bike_thr_<minutes>min`, `bike_vo2_<pattern>`
- You can add `+/-` offsets in descriptions, e.g., `{5k_pace}+0:45/mi` — the normalizer resolves them to concrete paces.

## Deterministic Normalizer
- Resolves aliases using user baselines: `{easy_pace}`, `{5k_pace}`, `FTP`, `swimPace100`.
- Applies `export_hints` tolerances to produce ranges.
- Computes total duration (work + rest + warm‑up + cool‑down).
- Outputs `friendlySummary` (e.g., `6 × 800 m @ 7:30–8:10 w/ 2:00 rest`) and `durationMinutes`.

## Assumptions: Required Baselines
- Run: `easyPace` and/or `fiveK_pace`
- Bike: `ftp`
- Swim: `swimPace100`
- Strength: per‑lift `1RM` if strength sessions present

## Authoring Tips
- Keep `description` readable; bracketed tokens like `[800m_x6_R2min]` are optional and stripped in UI.
- Tag sessions for scheduler/notes clarity: `run_long`, `run_quality`, `bike_intensity`, `strength_lower`.
- Prefer distance‑based swim steps; the exporter converts units correctly using `swim_unit`.
- Strength steps can be authored as `%1RM`; the exporter calculates absolute weights.

## Validation
- Validate against `universal_plan.schema.json` (Ajv in the app). Any extra fields are rejected by default.

## Example
```
{
  "name": "8‑Week Get Stronger Faster",
  "duration_weeks": 8,
  "export_hints": { "pace_tolerance_quality": 0.04, "pace_tolerance_easy": 0.06, "power_tolerance_SS_thr": 0.05, "power_tolerance_VO2": 0.10 },
  "sessions_by_week": {
    "1": [
      { "day": "Tuesday", "discipline": "run", "description": "VO2: 6×800m", "tags": ["run_quality"], "steps_preset": ["warmup_easy_10min","interval_6x800m_5kpace_R2min","cooldown_easy_10min"] },
      { "day": "Sunday", "discipline": "run", "description": "Long run @ easy", "tags": ["run_long"], "steps_preset": ["warmup_easy_10min","steady_70min","cooldown_easy_10min"] }
    ]
  }
}
```
