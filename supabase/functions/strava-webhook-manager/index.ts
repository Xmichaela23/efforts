import { createClient } from 'jsr:@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

Deno.serve(async (req) => {
  // Only handle POST requests
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const { action, userId, accessToken, athleteId } = await req.json();
    
    switch (action) {
      case 'subscribe':
        return await handleWebhookSubscription(userId, accessToken, athleteId);
      case 'unsubscribe':
        return await handleWebhookUnsubscription(userId, accessToken);
      case 'status':
        return await getWebhookStatus(userId);
      default:
        return new Response('Invalid action', { status: 400 });
    }
  } catch (error) {
    console.error('❌ Error in webhook manager:', error);
    return new Response('Internal server error', { status: 500 });
  }
});

async function handleWebhookSubscription(userId: string, accessToken: string, athleteId?: string) {
  try {
    console.log(`🔄 Setting up Strava webhook for user ${userId}`);
    
    // Use provided athleteId or fetch from Strava API
    let stravaUserId: string;
    
    if (athleteId) {
      stravaUserId = athleteId;
      console.log(`📱 Using provided Strava user ID: ${stravaUserId}`);
    } else {
      // Fallback: get the user's Strava profile to get their Strava ID
      const athleteResponse = await fetch('https://www.strava.com/api/v3/athlete', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (!athleteResponse.ok) {
        console.error(`❌ Failed to get Strava athlete profile: ${athleteResponse.status}`);
        return new Response('Failed to get Strava profile', { status: 400 });
      }

      const athleteData = await athleteResponse.json();
      stravaUserId = athleteData.id;
      console.log(`📱 Fetched Strava user ID: ${stravaUserId}`);
    }
    
    console.log(`📱 Strava user ID: ${stravaUserId}`);

    // Check if webhook already exists for this user
    const existingWebhook = await checkExistingWebhook(stravaUserId);
    
    if (existingWebhook) {
      console.log(`✅ Webhook already exists for Strava user ${stravaUserId}`);
      
      // Update the user connection with webhook info
      await updateUserConnection(userId, stravaUserId, accessToken, existingWebhook.id);
      
      return new Response(JSON.stringify({
        success: true,
        message: 'Webhook already active',
        webhookId: existingWebhook.id
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Create new webhook subscription
    const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/strava-webhook`;
    const verifyToken = Deno.env.get('STRAVA_WEBHOOK_VERIFY_TOKEN');
    
    const webhookResponse = await fetch('https://www.strava.com/api/v3/push_subscriptions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: Deno.env.get('STRAVA_CLIENT_ID'),
        client_secret: Deno.env.get('STRAVA_CLIENT_SECRET'),
        callback_url: webhookUrl,
        verify_token: verifyToken,
      }),
    });

    if (!webhookResponse.ok) {
      const errorText = await webhookResponse.text();
      console.error(`❌ Failed to create Strava webhook: ${webhookResponse.status} - ${errorText}`);
      return new Response('Failed to create Strava webhook', { status: 400 });
    }

    const webhookData = await webhookResponse.json();
    console.log(`✅ Created Strava webhook: ${webhookData.id}`);

    // Update the user connection with webhook info
    await updateUserConnection(userId, stravaUserId, accessToken, webhookData.id);

    return new Response(JSON.stringify({
      success: true,
      message: 'Webhook subscription created successfully',
      webhookId: webhookData.id
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error(`❌ Error setting up webhook for user ${userId}:`, error);
    return new Response('Internal server error', { status: 500 });
  }
}

async function handleWebhookUnsubscription(userId: string, _accessToken: string) {
  try {
    console.log(`🔄 Disabling Strava real-time sync preference for user ${userId}`);

    // IMPORTANT: Strava `push_subscriptions` are **one per OAuth application** (callback URL),
    // shared by every athlete. Calling DELETE here would unregister the app webhook for
    // **all** Efforts users — not just this account. Per-user "off" is represented by
    // `device_connections.webhook_active` + early return in `strava-webhook` only.

    const { data: userConnection, error: connectionError } = await supabase
      .from('device_connections')
      .select('connection_data, provider_user_id')
      .eq('user_id', userId)
      .eq('provider', 'strava')
      .single();

    if (connectionError || !userConnection) {
      console.log(`⚠️ No Strava connection found for user ${userId}`);
      return new Response('No Strava connection found', { status: 404 });
    }

    await removeWebhookFromConnection(userId);

    return new Response(JSON.stringify({
      success: true,
      message: 'Real-time sync disabled for this account. (App-wide Strava subscription unchanged.)',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error(`❌ Error unsubscribing webhook for user ${userId}:`, error);
    return new Response('Internal server error', { status: 500 });
  }
}

async function getWebhookStatus(userId: string) {
  try {
    const { data: userConnection, error: connectionError } = await supabase
      .from('device_connections')
      .select('connection_data, provider_user_id')
      .eq('user_id', userId)
      .eq('provider', 'strava')
      .single();

    if (connectionError || !userConnection) {
      return new Response(JSON.stringify({
        success: false,
        message: 'No Strava connection found',
        hasWebhook: false
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const connectionData = userConnection.connection_data || {};
    const hasWebhook = !!connectionData.webhook_id;

    return new Response(JSON.stringify({
      success: true,
      hasWebhook,
      webhookId: connectionData.webhook_id || null,
      stravaUserId: userConnection.provider_user_id
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error(`❌ Error getting webhook status for user ${userId}:`, error);
    return new Response('Internal server error', { status: 500 });
  }
}

async function checkExistingWebhook(stravaUserId: number) {
  try {
    // Get all webhooks for our app
    const clientId = Deno.env.get('STRAVA_CLIENT_ID');
    const clientSecret = Deno.env.get('STRAVA_CLIENT_SECRET');
    const url = `https://www.strava.com/api/v3/push_subscriptions?client_id=${clientId}&client_secret=${clientSecret}`;
    const webhooksResponse = await fetch(url);

    if (!webhooksResponse.ok) {
      console.warn(`⚠️ Could not check existing webhooks: ${webhooksResponse.status}`);
      return null;
    }

    const webhooks = await webhooksResponse.json();
    
    // Look for a webhook that matches our callback URL
    const ourWebhook = webhooks.find((webhook: any) => 
      webhook.callback_url === `${Deno.env.get('SUPABASE_URL')}/functions/v1/strava-webhook`
    );

    return ourWebhook || null;
  } catch (error) {
    console.warn('⚠️ Error checking existing webhooks:', error);
    return null;
  }
}

async function updateUserConnection(userId: string, stravaUserId: number | string, accessToken: string, webhookId: number) {
  try {
    const { data: existing } = await supabase
      .from('device_connections')
      .select('connection_data')
      .eq('user_id', userId)
      .eq('provider', 'strava')
      .maybeSingle();

    const prev = (existing?.connection_data || {}) as Record<string, unknown>;
    const mergedConnection = {
      ...prev,
      access_token: accessToken,
      webhook_id: webhookId,
      subscribed_at: new Date().toISOString(),
      last_sync: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('device_connections')
      .update({
        provider_user_id: String(stravaUserId),
        connection_data: mergedConnection,
        webhook_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('provider', 'strava');

    if (error) {
      console.error(`❌ Error updating user connection for ${userId}:`, error);
      throw error;
    }

    console.log(`✅ Updated user connection for ${userId}`);
  } catch (error) {
    console.error(`❌ Error in updateUserConnection for ${userId}:`, error);
      throw error;
  }
}

async function removeWebhookFromConnection(userId: string) {
  try {
    const { data: existing } = await supabase
      .from('device_connections')
      .select('connection_data')
      .eq('user_id', userId)
      .eq('provider', 'strava')
      .maybeSingle();

    const prev = (existing?.connection_data || {}) as Record<string, unknown>;
    const mergedConnection = {
      ...prev,
      webhook_id: null,
      unsubscribed_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('device_connections')
      .update({
        connection_data: mergedConnection,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('provider', 'strava');

    if (error) {
      console.error(`❌ Error removing webhook from connection for ${userId}:`, error);
      throw error;
    }

    console.log(`✅ Removed webhook metadata from connection for ${userId}`);
  } catch (error) {
    console.error(`❌ Error in removeWebhookFromConnection for ${userId}:`, error);
    throw error;
  }
}
