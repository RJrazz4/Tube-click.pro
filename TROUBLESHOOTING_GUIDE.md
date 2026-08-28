# TubeClick Pro Troubleshooting Guide

## 🚨 Critical Errors & Solutions

### Error 1: "Sign in to complete your Free Chain-Loop" (even when logged in)

**Root Cause:** The backend is rejecting the Supabase JWT token, likely because:
1. The session token expired and wasn't refreshed
2. The backend's Supabase client is configured with different credentials than the frontend
3. CORS is blocking the request
4. The token is not being passed correctly in the Authorization header

**Diagnostic Steps:**

#### Step 1: Verify Frontend Session
```javascript
// In browser console, check if you have a valid session:
const { data } = await supabase.auth.getSession();
console.log('Session:', data.session);
console.log('Access Token:', data.session?.access_token);
console.log('Expires:', data.session?.expires_at);
```

If `data.session` is null, the user is not actually signed in.

#### Step 2: Check Backend Token Validation
The backend validates tokens using:
```typescript
// In auth-service.ts
const { data, error } = await this.authClient.auth.getUser(token);
```

This requires:
- `SUPABASE_URL` in backend = `SUPABASE_URL` in frontend
- `SUPABASE_ANON_KEY` in backend = `VITE_SUPABASE_PUBLISHABLE_KEY` in frontend

**Solution:**
1. **Verify Supabase URLs match** between frontend and backend
2. **Check CORS** - Ensure `https://tubeclickpro.in` is in `CORS_ORIGINS`
3. **Test token manually:**
   ```bash
   # Get a token from frontend (browser console)
   const { data } = await supabase.auth.getSession();
   const token = data.session.access_token;
   
   # Test it against backend
   curl -X GET https://tubeclickpro-backend-engine.onrender.com/healthz \
     -H "Authorization: Bearer $token"
   ```

#### Step 3: Enable Debug Logging
In your backend, set `LOG_LEVEL=debug` to see authentication details.

---

### Error 2: "Could not start YouTube connect. Is the engine configured?"

**Root Cause:** The YouTube OAuth module is disabled because required environment variables are missing.

**Check:** In `src/youtube/sync-queue.ts`:
```typescript
export function youtubeSyncModuleEnabled(): boolean {
  const config = getConfig();
  return Boolean(
    config.GOOGLE_OAUTH_CLIENT_ID &&
      config.GOOGLE_OAUTH_CLIENT_SECRET &&
      config.GOOGLE_OAUTH_REDIRECT_URL &&
      config.YOUTUBE_TOKEN_MASTER_KEY,
  );
}
```

**Required Variables:**
```bash
GOOGLE_OAUTH_CLIENT_ID=your_client_id
GOOGLE_OAUTH_CLIENT_SECRET=your_client_secret
GOOGLE_OAUTH_REDIRECT_URL=https://tubeclickpro-backend-engine.onrender.com/api/youtube/callback
YOUTUBE_TOKEN_MASTER_KEY=your_min_16_char_key
```

**Google OAuth Setup:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create OAuth 2.0 credentials (Web application type)
3. Add authorized redirect URI: `https://tubeclickpro-backend-engine.onrender.com/api/youtube/callback`
4. Enable YouTube Data API v3
5. Copy credentials to Render

**Test YouTube Module:**
```bash
# Should return 401 if not authenticated, not 503
curl -X GET https://tubeclickpro-backend-engine.onrender.com/api/youtube/auth-url \
  -H "Authorization: Bearer YOUR_SUPABASE_TOKEN"
```

If you get `{"error":{"code":"YOUTUBE_MODULE_DISABLED","message":"YouTube module is not configured"}}`, the env vars are missing.

---

### Error 3: Channel URL Input Freezes/Hangs

**Root Cause:** 
1. No loading state shown during backend cold start (30-60 seconds)
2. Missing timeout on API calls
3. No error handling for failed requests

**Frontend Fixes Applied:**
- Added `channelInputLoading` state
- Added `channelInputError` state
- Added loading spinner and error messages
- Added timeout handling (15 seconds)

**Backend Fixes Applied:**
- Enhanced CORS configuration
- Better error messages
- Config validation on startup

**Additional Checks:**

#### Check 1: Backend Cold Start
```bash
# Test if backend is awake
curl -s https://tubeclickpro-backend-engine.onrender.com/healthz

# If it takes >5 seconds, it's a cold start
# Free tier Render services sleep after inactivity
```

**Solution:** 
- Wait 30-60 seconds after deployment
- Use Render's "Always On" feature (paid)
- Show loading message to users: "Backend is waking up. Please wait..."

#### Check 2: YouTube API Quota
```bash
# Check if YouTube API key has quota
curl -X POST https://tubeclickpro-backend-engine.onrender.com/api/clone-crush \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"profile","channelUrl":"@MrBeast"}'
```

If you get quota errors, check your Google Cloud Console for YouTube Data API v3 usage.

#### Check 3: Network Connectivity
```bash
# Test from frontend to backend
fetch('https://tubeclickpro-backend-engine.onrender.com/healthz', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN'
  }
}).then(r => r.json()).then(console.log).catch(console.error);
```

---

## 🔍 Complete Diagnostic Checklist

### Frontend (Vercel)

- [ ] `VITE_SUPABASE_URL` = `https://your-project-ref.supabase.co`
- [ ] `VITE_SUPABASE_PUBLISHABLE_KEY` = Supabase anon key
- [ ] `VITE_ENGINE_URL` = `https://tubeclickpro-backend-engine.onrender.com`
- [ ] `VITE_BACKEND_ENGINE_URL` = `https://tubeclickpro-backend-engine.onrender.com`
- [ ] `VITE_APP_URL` = `https://tubeclickpro.in`
- [ ] `VITE_USE_VERCEL_EDGE` = `true`
- [ ] `VITE_API_MODE` = `vercel`

### Backend (Render)

#### Critical
- [ ] `NODE_ENV` = `production`
- [ ] `SUPABASE_URL` = `https://your-project-ref.supabase.co` (MUST match frontend)
- [ ] `SUPABASE_ANON_KEY` = Supabase anon key (MUST match frontend)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` = Supabase service role key
- [ ] `CORS_ORIGINS` = `https://tubeclickpro.in,https://www.tubeclickpro.in,http://localhost:5173`
- [ ] `REDIS_URL` = `redis://:password@host:port`

#### YouTube Module
- [ ] `GOOGLE_OAUTH_CLIENT_ID` = Google OAuth client ID
- [ ] `GOOGLE_OAUTH_CLIENT_SECRET` = Google OAuth client secret
- [ ] `GOOGLE_OAUTH_REDIRECT_URL` = `https://tubeclickpro-backend-engine.onrender.com/api/youtube/callback`
- [ ] `YOUTUBE_TOKEN_MASTER_KEY` = 16+ character encryption key
- [ ] `YOUTUBE_API_KEY` = YouTube Data API v3 key

#### AI Providers
- [ ] `ELEVENLABS_API_KEY` = ElevenLabs API key
- [ ] `OPENROUTER_API_KEYS` = Comma-separated OpenRouter keys

### Supabase

- [ ] Project URL matches `VITE_SUPABASE_URL` and backend `SUPABASE_URL`
- [ ] Anon key matches `VITE_SUPABASE_PUBLISHABLE_KEY` and backend `SUPABASE_ANON_KEY`
- [ ] Service role key is set in backend `SUPABASE_SERVICE_ROLE_KEY`
- [ ] JWT settings are configured (optional, but recommended)
- [ ] RLS policies allow access for authenticated users
- [ ] `get_ghost_tier_for` RPC function exists (if using `SUPABASE_TIER_SOURCE=rpc`)

---

## 🛠️ Common Fixes

### Fix 1: Session Not Persisting

**Symptom:** User signs in, but on page refresh they're signed out.

**Solution:**
1. Check Supabase client configuration in `src/integrations/supabase/client.ts`
2. Ensure `persistSession: true` is set
3. Verify storage keys are not being cleared
4. Check for errors in browser console during sign-in

### Fix 2: CORS Errors

**Symptom:** `Access to fetch at '...' from origin '...' has been blocked by CORS policy`

**Solution:**
1. Add all frontend domains to `CORS_ORIGINS` in Render
2. Ensure `credentials: true` is set in CORS config
3. Verify `trustProxy: true` is set in Fastify config
4. Check that `Access-Control-Allow-Headers` includes `Authorization`

### Fix 3: 401 Unauthorized on API Calls

**Symptom:** API calls return 401 even with valid session.

**Solution:**
1. Verify Supabase URLs match between frontend and backend
2. Check that the token is being passed in the `Authorization: Bearer <token>` header
3. Test token validation manually (see Error 1 diagnostic)
4. Enable debug logging in backend to see auth errors

### Fix 4: 503 Service Unavailable

**Symptom:** Backend returns 503 or times out.

**Solution:**
1. Check Render service logs for errors
2. Verify all required environment variables are set
3. Check if service is awake (cold start delay)
4. Verify Redis connection is working
5. Check database connection (Supabase)

### Fix 5: YouTube Connect Not Working

**Symptom:** "Could not start YouTube connect" or redirect fails.

**Solution:**
1. Verify all YouTube module env vars are set (see Error 2)
2. Check Google OAuth consent screen is configured
3. Verify redirect URI matches exactly
4. Test with `curl` (see Error 2 diagnostic)
5. Check browser console for errors during OAuth flow

---

## 📊 Monitoring & Logging

### Backend Logs (Render)
```bash
# View logs
render logs tubeclickpro-backend-engine

# Look for:
# - Authentication errors
# - Missing environment variables
# - Database connection errors
# - YouTube API errors
```

### Frontend Logs (Browser Console)
```javascript
// Check for errors during:
// 1. Sign in
// 2. API calls
// 3. YouTube connect
// 4. Channel profiling

// Enable verbose logging
localStorage.debug = 'supabase*'
```

### Key Log Messages

| Message | Meaning | Action |
|---------|---------|--------|
| `Invalid or expired Supabase session` | Token validation failed | Check token, check Supabase URLs |
| `YouTube module is not configured` | Missing YouTube env vars | Add GOOGLE_OAUTH_* vars |
| `Engine request failed` | Backend connection issue | Check CORS, check backend health |
| `Request timed out` | Backend cold start or network issue | Wait, check connectivity |
| `NOT_AUTHENTICATED` | No session token | Check if user is signed in |

---

## 🎯 Quick Verification Commands

### Test Backend Health
```bash
curl https://tubeclickpro-backend-engine.onrender.com/healthz
# Expected: {"status":"ok","service":"tubeclickpro-backend-engine"}
```

### Test Backend Readiness
```bash
curl https://tubeclickpro-backend-engine.onrender.com/readyz
# Expected: {"status":"ready","redis":"ok"}
```

### Test Auth with Token
```bash
# Get token from browser console first
TOKEN="your_supabase_access_token"
curl -H "Authorization: Bearer $TOKEN" \
  https://tubeclickpro-backend-engine.onrender.com/healthz
# Expected: 200 OK
```

### Test YouTube Module
```bash
TOKEN="your_supabase_access_token"
curl -H "Authorization: Bearer $TOKEN" \
  https://tubeclickpro-backend-engine.onrender.com/api/youtube/auth-url
# Expected: {"authUrl":"https://accounts.google.com/...","buttonText":"Connect YouTube"}
# If disabled: {"error":{"code":"YOUTUBE_MODULE_DISABLED",...}}
```

### Test Clone & Crush
```bash
TOKEN="your_supabase_access_token"
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"profile","channelUrl":"@MrBeast","language":"English"}' \
  https://tubeclickpro-backend-engine.onrender.com/api/clone-crush
# Expected: Profile data or error
```

---

## 📞 Support Information

When reporting issues, please include:

1. **Error message** (exact text)
2. **Browser console logs** (screenshot or text)
3. **Backend logs** (from Render dashboard)
4. **Environment** (production/staging, browser, OS)
5. **Steps to reproduce**
6. **Screenshots** (if UI issue)
7. **Network tab** (for API call failures)

---

## 🔗 Useful Links

- [Render Dashboard](https://dashboard.render.com/)
- [Supabase Dashboard](https://app.supabase.com/)
- [Google Cloud Console](https://console.cloud.google.com/)
- [YouTube Data API](https://developers.google.com/youtube/v3)
- [ElevenLabs](https://elevenlabs.io/)
- [OpenRouter](https://openrouter.ai/)

---

**Last Updated:** 2026-08-29
**Version:** 1.0.0
