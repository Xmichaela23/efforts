#!/bin/bash
# Quick script to recalculate the two specific strength workouts from Jan 12-13

USER_ID="45d122e7-a950-4d50-858c-380b492061aa"
WORKOUT_1="27924333-da3f-4c43-885c-bcfc8673fa53"  # Jan 12
WORKOUT_2="0643bc8b-b234-4bbb-8d25-2ebeb9c84bc5"  # Jan 13

deno run --allow-net --allow-env recalculate-strength-workloads.ts "$USER_ID" "$WORKOUT_1" "$WORKOUT_2"
