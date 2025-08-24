import { createClient } from 'jsr:@supabase/supabase-js@2';

// Strava webhook verification and processing
// Use service role to bypass RLS from server-side webhook processing
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

Deno.serve(async (req) => {
  // Handle webhook verification (Strava sends GET request first)
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    
    // Verify the webhook subscription
    if (mode === 'subscribe' && token === Deno.env.get('STRAVA_WEBHOOK_VERIFY_TOKEN')) {
      console.log('✅ Strava webhook verified successfully');
      return new Response(JSON.stringify({ 'hub.challenge': challenge }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      console.log('❌ Strava webhook verification failed');
      return new Response('Verification failed', { status: 403 });
    }
  }

  // Handle webhook events (POST requests)
  if (req.method === 'POST') {
    try {
      const payload = await req.json();
      console.log('📥 Received Strava webhook:', JSON.stringify(payload, null, 2));
      
      // Respond immediately with 200 OK (as required by Strava)
      const response = new Response('OK', { status: 200 });
      
      // Process the webhook asynchronously
      processStravaWebhook(payload).catch(console.error);
      
      return response;
    } catch (error) {
      console.error('❌ Error processing Strava webhook:', error);
      return new Response('Internal server error', { status: 500 });
    }
  }

  return new Response('Method not allowed', { status: 405 });
});

async function processStravaWebhook(payload: any) {
  try {
    const { object_type, object_id, aspect_type, updates, owner_id } = payload;
    
    // Only process activity-related events
    if (object_type !== 'activity') {
      console.log('⏭️ Skipping non-activity webhook:', object_type);
      return;
    }

    console.log(`🔄 Processing ${aspect_type} for activity ${object_id} (owner: ${owner_id})`);

    switch (aspect_type) {
      case 'create':
        await handleActivityCreated(object_id, owner_id);
        break;
      case 'update':
        await handleActivityUpdated(object_id, owner_id, updates);
        break;
      case 'delete':
        await handleActivityDeleted(object_id, owner_id);
        break;
      default:
        console.log(`⚠️ Unknown aspect type: ${aspect_type}`);
    }
  } catch (error) {
    console.error('❌ Error in processStravaWebhook:', error);
  }
}

async function handleActivityCreated(activityId: number, ownerId: number) {
  try {
    console.log(`🆕 New activity created: ${activityId} by user ${ownerId}`);
    
    // Find the user in our system by Strava ID
    const { data: userConnection, error: connectionError } = await supabase
      .from('device_connections')
      .select('user_id, connection_data')
      .eq('provider', 'strava')
      .eq('provider_user_id', ownerId.toString())
      .single();

    if (connectionError || !userConnection) {
      console.log(`⚠️ No user connection found for Strava user ${ownerId}`);
      return;
    }

    const userId = userConnection.user_id;
    const connectionData = userConnection.connection_data || {};
    const accessToken = connectionData.access_token;

    if (!accessToken) {
      console.log(`⚠️ No access token for user ${userId}`);
      return;
    }

    // Fetch detailed activity data from Strava
    const activityData = await fetchStravaActivity(activityId, accessToken);
    if (!activityData) {
      console.log(`⚠️ Could not fetch activity ${activityId} from Strava`);
      return;
    }

    // Store the activity in our system
    await storeStravaActivity(activityId, userId, activityData);
    
    // Create workout entry if it's a supported sport
    await createWorkoutFromStravaActivity(userId, activityData);
    
    console.log(`✅ Activity ${activityId} processed successfully for user ${userId}`);
  } catch (error) {
    console.error(`❌ Error handling activity creation for ${activityId}:`, error);
  }
}

async function handleActivityUpdated(activityId: number, ownerId: number, updates: any) {
  try {
    console.log(`🔄 Activity updated: ${activityId} by user ${ownerId}`, updates);
    
    // Find the user connection
    const { data: userConnection, error: connectionError } = await supabase
      .from('device_connections')
      .select('user_id, connection_data')
      .eq('provider', 'strava')
      .eq('provider_user_id', ownerId.toString())
      .single();

    if (connectionError || !userConnection) {
      console.log(`⚠️ No user connection found for Strava user ${ownerId}`);
      return;
    }

    const userId = userConnection.user_id;
    const connectionData = userConnection.connection_data || {};
    const accessToken = connectionData.access_token;

    if (!accessToken) {
      console.log(`⚠️ No access token for user ${userId}`);
      return;
    }

    // Fetch updated activity data
    const activityData = await fetchStravaActivity(activityId, accessToken);
    if (!activityData) {
      console.log(`⚠️ Could not fetch updated activity ${activityId} from Strava`);
      return;
    }

    // Update the stored activity
    await updateStravaActivity(activityId, userId, activityData);
    
    // Update workout entry if it exists
    await updateWorkoutFromStravaActivity(userId, activityData);
    
    console.log(`✅ Activity ${activityId} updated successfully for user ${userId}`);
  } catch (error) {
    console.error(`❌ Error handling activity update for ${activityId}:`, error);
  }
}

async function handleActivityDeleted(activityId: number, ownerId: number) {
  try {
    console.log(`🗑️ Activity deleted: ${activityId} by user ${ownerId}`);
    
    // Find the user connection
    const { data: userConnection, error: connectionError } = await supabase
      .from('device_connections')
      .select('user_id')
      .eq('provider', 'strava')
      .eq('provider_user_id', ownerId.toString())
      .single();

    if (connectionError || !userConnection) {
      console.log(`⚠️ No user connection found for Strava user ${ownerId}`);
      return;
    }

    const userId = userConnection.user_id;

    // Mark activity as deleted in our system
    await markStravaActivityDeleted(activityId, userId);
    
    // Remove associated workout if it exists
    await removeWorkoutFromStravaActivity(userId, activityId);
    
    console.log(`✅ Activity ${activityId} marked as deleted for user ${userId}`);
  } catch (error) {
    console.error(`❌ Error handling activity deletion for ${activityId}:`, error);
  }
}

async function fetchStravaActivity(activityId: number, accessToken: string) {
  try {
    const response = await fetch(`https://www.strava.com/api/v3/activities/${activityId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      console.warn(`⚠️ Strava API error for activity ${activityId}: ${response.status}`);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error(`❌ Error fetching Strava activity ${activityId}:`, error);
    return null;
  }
}

async function storeStravaActivity(activityId: number, userId: string, activityData: any) {
  try {
    const { error } = await supabase
      .from('strava_activities')
      .upsert({
        strava_id: activityId,
        user_id: userId,
        activity_data: activityData,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null
      });

    if (error) {
      console.error(`❌ Error storing Strava activity ${activityId}:`, error);
    }
  } catch (error) {
    console.error(`❌ Error in storeStravaActivity for ${activityId}:`, error);
  }
}

async function updateStravaActivity(activityId: number, userId: string, activityData: any) {
  try {
    const { error } = await supabase
      .from('strava_activities')
      .update({
        activity_data: activityData,
        updated_at: new Date().toISOString()
      })
      .eq('strava_id', activityId)
      .eq('user_id', userId);

    if (error) {
      console.error(`❌ Error updating Strava activity ${activityId}:`, error);
    }
  } catch (error) {
    console.error(`❌ Error in updateStravaActivity for ${activityId}:`, error);
  }
}

async function markStravaActivityDeleted(activityId: number, userId: string) {
  try {
    const { error } = await supabase
      .from('strava_activities')
      .update({
        deleted_at: new Date().toISOString()
      })
      .eq('strava_id', activityId)
      .eq('user_id', userId);

    if (error) {
      console.error(`❌ Error marking Strava activity ${activityId} as deleted:`, error);
    }
  } catch (error) {
    console.error(`❌ Error in markStravaActivityDeleted for ${activityId}:`, error);
  }
}

async function createWorkoutFromStravaActivity(userId: string, activityData: any) {
  try {
    // Map Strava sport to our type values used in UI
    const s = (activityData.sport_type?.toLowerCase() || activityData.type?.toLowerCase() || '');
    const type = s.includes('run') ? 'run'
      : (s.includes('ride') || s.includes('bike')) ? 'ride'
      : s.includes('swim') ? 'swim'
      : (s.includes('walk') || s.includes('hike')) ? 'walk'
      : (s.includes('weight') || s.includes('strength')) ? 'strength'
      : 'run';

    // Only persist supported types
    if (!['run','ride','swim','strength','walk'].includes(type)) return;

    // Dedupe by strava_activity_id
    const { data: existingWorkout } = await supabase
      .from('workouts')
      .select('id')
      .eq('user_id', userId)
      .eq('strava_activity_id', activityData.id)
      .single();
    if (existingWorkout) return;

    const date = new Date(activityData.start_date_local || activityData.start_date).toISOString().split('T')[0];
    const duration = Math.max(0, Math.round((activityData.moving_time || 0) / 60));
    const distance = Number.isFinite(activityData.distance) ? Math.round(activityData.distance) : null; // meters or leave as provided

    const row: any = {
      user_id: userId,
      name: activityData.name || 'Strava Activity',
      type,
      date,
      duration,
      distance,
      description: `Imported from Strava: ${activityData.name || ''}`.trim(),
      workout_status: 'completed',
      completedmanually: false,
      strava_activity_id: activityData.id,
      source: 'strava',
      start_position_lat: activityData.start_latlng?.[0] ?? null,
      start_position_long: activityData.start_latlng?.[1] ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('workouts').insert(row);
    if (error) console.error(`❌ Error creating workout for Strava activity ${activityData.id}:`, error);
    else console.log(`✅ Created workout for Strava activity ${activityData.id}`);
  } catch (error) {
    console.error(`❌ Error in createWorkoutFromStravaActivity:`, error);
  }
}

async function updateWorkoutFromStravaActivity(userId: string, activityData: any) {
  try {
    // Find existing workout
    const { data: existingWorkout } = await supabase
      .from('workouts')
      .select('id')
      .eq('user_id', userId)
      .eq('strava_activity_id', activityData.id)
      .single();

    if (!existingWorkout) {
      console.log(`⏭️ No workout found for Strava activity ${activityData.id}, creating new one`);
      await createWorkoutFromStravaActivity(userId, activityData);
      return;
    }

    // Update with our schema fields
    const workoutData = {
      name: activityData.name || 'Strava Activity',
      duration: Math.max(0, Math.round((activityData.moving_time || 0) / 60)),
      distance: Number.isFinite(activityData.distance) ? Math.round(activityData.distance) : null,
      description: `Updated from Strava: ${activityData.name || ''}`.trim(),
      workout_status: 'completed',
      updated_at: new Date().toISOString(),
    } as any;

    const { error } = await supabase
      .from('workouts')
      .update(workoutData)
      .eq('id', existingWorkout.id);

    if (error) {
      console.error(`❌ Error updating workout for Strava activity ${activityData.id}:`, error);
    } else {
      console.log(`✅ Updated workout for Strava activity ${activityData.id}`);
    }
  } catch (error) {
    console.error(`❌ Error in updateWorkoutFromStravaActivity:`, error);
  }
}

async function removeWorkoutFromStravaActivity(userId: string, activityId: number) {
  try {
    const { error } = await supabase
      .from('workouts')
      .delete()
      .eq('user_id', userId)
      .eq('strava_activity_id', activityId);

    if (error) {
      console.error(`❌ Error removing workout for Strava activity ${activityId}:`, error);
    } else {
      console.log(`✅ Removed workout for Strava activity ${activityId}`);
    }
  } catch (error) {
    console.error(`❌ Error in removeWorkoutFromStravaActivity:`, error);
  }
}
