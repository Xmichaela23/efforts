# Planned Workouts — Product Expectations (No Mechanics)

This document states what users should experience from the Planned Workouts area of the app. It does not contain implementation details, algorithms, or guidance on how to change behavior.

## What this system provides
- Stores a user’s training plan sessions (all sports) with names, dates, and basic details.
- Shows planned sessions in the UI where appropriate (calendar, daily views).
- Lets users complete workouts and later view a high‑level comparison between the plan and what was done.
- Reflects completion state for planned sessions when a matching workout exists.
- Supports choices within a plan (e.g., optional items that the user can elect to include or not).

## What users can rely on
- Planned sessions appear on the dates they belong to.
- Completed sessions remain visible in history.
- When a planned session is considered done, the plan reflects that status in the places where users check progress.
- Optional items remain out of the way unless the user chooses to include them.

## Not covered here
- No data model diagrams, queries, or code examples.
- No rules about internal linking, caching, or compute.
- No instructions for deployment, debugging, or edits.

(End of product‑level expectations.)
