# Plan Author Guide (Universal)

This guide applies to **all training plans** (marathon, 70.3, full triathlon, off‑season, etc.).  
It explains how to author sessions in JSON so they validate and expand correctly.

---

## General Rules

- **Run / Bike / Strength** → keep using full `steps_preset` tokens (e.g. `"interval_6x400m_5kpace_R2min"`).  
- **Swim** → use the mini‑DSL with defaults (WU/CD auto‑added).  
- **Macros** → allowed for the most common sets (see below).  
- **Optional sessions** → mark with `"tags": ["optional"]`.  
- **If `steps_preset` exists, it always wins**. DSL/Macros are only used if `steps_preset` is missing.

---

## Swim DSL (only for swims)

Swims are authored with a compact DSL. Warm‑up and cool‑down are auto‑added from plan defaults.

Examples:

```json
{ "discipline": "swim", "main": "drills(catchup,singlearm); pull2x100; kick2x100" }
```

Expands to:

```
swim_warmup_200yd_easy
swim_drills_4x50yd_catchup
swim_drills_4x50yd_singlearm
swim_pull_2x100yd
swim_kick_2x100yd
swim_cooldown_200yd_easy
```

### DSL Blocks
- `drills(a,b,...)` → expands to standard drill tokens.  
- `pull2x100` → `swim_pull_2x100yd`  
- `kick2x100` → `swim_kick_2x100yd`  
- `aerobic(6x100)` → `swim_aerobic_6x100yd_easysteady`  
- `aerobic(4x500)` → `swim_aerobic_4x500yd_easy`  

### Available Drill Names
```
catchup, singlearm, fist, scull, scullfront, fingertipdrag, 616, zipper, doggypaddle
```

---

## Macros (aliases)

Authors may use macros for common workouts. These expand to full token lists.

- `@RUN_INT_6x400_5k_R2` → warmup • 6×400m @5k pace R2 • cooldown  
- `@BK_VO2_6x3_R3` → warmup • 6×3min VO₂ • cooldown  
- `@BK_THR_4x8_R5` → warmup • 4×8min threshold • cooldown  
- `@SWIM_TECH_1200_DEFAULT` → warmup • drills(catchup,singlearm) • pull2x100 • kick2x100 • cooldown  

---

## Preflight Checks

- Schema validation: each session must have `discipline`, `description`, and either `steps_preset` or `main`.  
- Fail fast on:
  - Unknown token
  - Unknown macro/alias
  - Unknown swim drill name  
- Swim volume checks:
  - Peak swim should not exceed ~2400yd
  - Taper weeks should be <= 1200yd  
- Long ride descriptions: include note that *climbs/surges are ok*.

---

## Best Practices

- Be consistent: **use tokens for run/bike/strength, DSL for swims**.  
- Keep optional sessions clearly tagged.  
- Use macros for readability in long plans.  
- Check PR preflight output — errors will list the exact offender (unknown drill, alias, etc.).  

---

This guide is **universal**. All authors should follow it when contributing new training plans.
