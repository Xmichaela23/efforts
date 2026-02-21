#!/bin/bash
# Quick test script to invoke calculate-workload for the two workouts
# Set these environment variables first:
# export SUPABASE_URL="your_url"
# export SUPABASE_SERVICE_ROLE_KEY="your_key"

if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  echo "❌ Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables"
  exit 1
fi

echo "🔄 Recalculating workload for Jan 12 workout..."
curl -X POST "${SUPABASE_URL}/functions/v1/calculate-workload" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -d '{"workout_id": "27924333-da3f-4c43-885c-bcfc8673fa53"}' \
  | jq '.'

echo ""
echo "🔄 Recalculating workload for Jan 13 workout..."
curl -X POST "${SUPABASE_URL}/functions/v1/calculate-workload" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -d '{"workout_id": "0643bc8b-b234-4bbb-8d25-2ebeb9c84bc5"}' \
  | jq '.'

echo ""
echo "✅ Done! Check the workload_actual values above."
