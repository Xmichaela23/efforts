# Copy for approval — 2026-09-12

One truth for drift, the plan line, and the indoor name.
Every before/after line below is the exact string on the screen.

---

## P3 — Performance, swim card, the line at the top of the card

The card renders this uppercase in CSS. Shown as it appears.

before:
```
STANDARD FOCUS · WEEK 2 · BUILD
```

after:
```
STANDARD FOCUS · WEEK 2 OF 12
```

Why: "Build" is the fact packet's default intent word, not a phase the plan
stated — the same false word you caught on a Standard Focus run. The after
line is the wording the run and ride tiles already print.

Status: **approved**

---

## P4 — State, strength row, the line above the numbers

before:
```
week 2 of 12
```

after:
```
Standard Focus · week 2 of 12
```

Why: adds the plan's name, so the row matches every other screen. No phase
word, so nothing from the archived programme can reach it.

Status: **approved**

---

## P5 — Today, the two-line date header

### Ordinary week

before, line 1:
```
Fri, Sep 12 · Week 3
```
before, line 2:
```
Standard Focus
```

after, line 1:
```
Fri, Sep 12 · week 3 of 12
```
after, line 2:
```
Standard Focus
```

### Test week

before, line 1:
```
Fri, Sep 12 · Week 1
```
before, line 2:
```
Test
```

after, line 1:
```
Fri, Sep 12 · week 1 of 12
```
after, line 2:
```
Test
```

### Light week

before, line 1:
```
Fri, Oct 24 · Week 11
```
before, line 2:
```
Light week
```

after, line 1:
```
Fri, Oct 24 · week 11 of 12
```
after, line 2:
```
Light week
```

Why: lowercase "week" and the plan's length, so the top line matches every
other screen. Only line 1 changes. The word beneath is untouched in all
three cases.

Status: **held — awaiting Michael on the test-week and light-week variants**

---

## D3 — State, drift chart label and key

before, label:
```
Drift · 10% line for multisport
```
before, key:
```
dots: one steady run, first half vs second · dashed: the trend ·
10% is the multisport limit
```

after: **unchanged, both lines.**

Why: no words change. Once State asks the same steadiness question as
Performance, "one steady run" becomes true. Today the chart plots sessions
Performance calls intervals, so the caption is what is wrong, not the words.

Status: **approved, unchanged**

---

## D5 — the checkpoint sheet's evidence sentence

before:
```
Hard runs: heart rate 162 → 158, pace 7:42 → 7:31, effort 7 → 7,
decoupling 4.1% → 5.6% over 6 sessions, first half to second half.
```

after:
```
Hard runs: heart rate 162 → 158, pace 7:42 → 7:31, effort 7 → 7
over 6 sessions, first half to second half.
```

The ride wording changes the same way:

before:
```
Hard rides: heart rate 151 → 147, power 214 → 221 W, effort 7 → 8,
decoupling 3.2% → 4.4% over 5 sessions, first half to second half.
```

after:
```
Hard rides: heart rate 151 → 147, power 214 → 221 W, effort 7 → 8
over 5 sessions, first half to second half.
```

Why: the sheet reads hard sessions only, and p107's drift rule is written
for steady work. Wiring it to the shared steadiness test would blank the
clause on nearly every session, leaving a sentence that loses a number some
weeks and not others. Dropping it says the same thing honestly.

Status: **approved — drop the decoupling clause**
