# Garmin OAuth2.0 PKCE Documentation

## Overview
Garmin Connect Developer Program uses OAuth2.0 PKCE (Proof of Key Code Exchange) for secure authentication and authorization. This allows users to share their data securely between different applications.

## Key Points
- **Purpose**: Authentication and authorization for Garmin Connect accounts
- **Security**: PKCE provides additional security layer to prevent code interception attacks
- **User Control**: Users control what permissions are granted
- **Token Management**: Access tokens expire and must be refreshed

## OAuth Flow

### Step 1: Authorization Request
The client generates a code verifier and challenge before redirecting the user.

**URL**: `GET https://connect.garmin.com/oauth2Confirm`

**Required Parameters**:
- `response_type=code`
- `client_id=<consumer key>`
- `code_challenge=<SHA-256 hashed version of code_verifier>`
- `code_challenge_method=S256`

**Optional Parameters**:
- `redirect_uri=<uri to redirect user to>`
- `state=<unique string to tie to authorization code>`

**Code Verifier Requirements**:
- Cryptographically random string
- Characters: A-Z, a-z, 0-9, hyphen, period, underscore, tilde
- Length: 43-128 characters

**Code Challenge**:
- SHA-256 hashed version of code_verifier
- Base64url encoded: `base64url(sha256(code_verifier))`

### Step 2: Access Token Request
Exchange authorization code for access token.

**URL**: `POST https://diauth.garmin.com/di-oauth2-service/oauth/token`

**Required Parameters**:
- `grant_type=authorization_code`
- `client_id=<consumer key>`
- `client_secret=<consumer secret>`
- `code=<authorization code from Step 1>`
- `code_verifier=<original code verifier>`

**Optional Parameters**:
- `redirect_uri=<must match Step 1 if used>`

**Response**:
```json
{
  "access_token": "VTkc5JilK0dd8w_s0FJGabMqSFyjSXyNHIb0lUgFJyIr2YZxhey-KMzDzBCI2LJc6yC5NGbC",
  "expires_in": 86400,
  "token_type": "bearer",
  "refresh_token": "xUEA805jTCcGd4b7rs-SkOJP==",
  "scope": "PARTNER_WRITE PARTNER_READ CONNECT_READ CONNECT_WRITE",
  "jti": "f9eb2316-9b9d-495a-8732-e16c4b5bcafd",
  "refresh_token_expires_in": 7775998
}
```

## Token Management

### Access Token Expiration
- Access tokens expire after 3 months
- Must be refreshed to maintain access
- New refresh token provided with each refresh

### Refresh Token Request
**URL**: `POST https://diauth.garmin.com/di-oauth2-service/oauth/token`

**Parameters**:
- `grant_type=refresh_token`
- `client_id=<consumer key>`
- `client_secret=<consumer secret>`
- `refresh_token=<current refresh token>`

### Token Usage
Include access token in API requests:
```
Authorization: Bearer {access_token}
```

## User Management

### Get User ID
**URL**: `GET https://apis.garmin.com/wellness-api/rest/user/id`

**Response**: `{"userId": "d3315b1072421d0dd7c8f6b8e1de4df8"}`

### Delete User Registration
**URL**: `DELETE https://apis.garmin.com/wellness-api/rest/user/registration`

**Use Case**: When user requests account deletion or disconnection

### Get User Permissions
**URL**: `GET https://apis.garmin.com/wellness-api/rest/user/permissions`

**Response**: `["ACTIVITY_EXPORT", "WORKOUT_IMPORT", "HEALTH_EXPORT", "COURSE_IMPORT", "MCT_EXPORT"]`

## Available Permissions

### Core Permissions
- **ACTIVITY_EXPORT**: Pull activities FROM Garmin
- **WORKOUT_IMPORT**: Import workouts TO Garmin (if supported)
- **HEALTH_EXPORT**: Pull health data FROM Garmin
- **COURSE_IMPORT**: Import courses TO Garmin
- **MCT_EXPORT**: Pull MCT data FROM Garmin

### Permission Management
- Users can change permissions in Garmin Connect account settings
- Partners notified via User Permission webhook
- Default scope includes all permissions but users can opt out

## Security Considerations

### Consumer Key and Secret
- **Consumer Key**: Public information, used to identify partner app
- **Consumer Secret**: Private, must be secured and never sent in plain text
- Created via Developer Portal

### Token Security
- Store tokens securely
- Implement proper token refresh logic
- Handle token expiration gracefully
- Use HTTPS for all communications

### Rate Limiting
- Tokens subject to API rate limits
- Implement exponential backoff for failed requests
- Monitor token usage and refresh patterns

## Implementation Notes

### CORS
- CORS pre-flight requests (OPTIONS) are not supported
- Handle cross-origin requests appropriately

### Error Handling
- Handle authorization failures
- Implement proper redirect URI validation
- Validate state parameter to prevent CSRF attacks

### Production Requirements
- First consumer key is evaluation key (rate-limited)
- Production access requires app review and approval
- Must demonstrate proper security practices
- Compliance with Garmin brand guidelines required

## Use Cases
- Fitness app integration
- Training platform connectivity
- Health data synchronization
- Device data access
- Third-party service integration 