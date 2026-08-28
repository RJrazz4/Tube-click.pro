#!/bin/bash

# TubeClick Pro Diagnostic Script
# Run this to check all common issues with your deployment

echo "=========================================="
echo "TubeClick Pro Deployment Diagnostic"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Count tests
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

run_test() {
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    local test_name="$1"
    local command="$2"
    
    echo -n "Testing: $test_name... "
    
    if eval "$command" > /dev/null 2>&1; then
        echo -e "${GREEN}PASS${NC}"
        PASSED_TESTS=$((PASSED_TESTS + 1))
        return 0
    else
        echo -e "${RED}FAIL${NC}"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        return 1
    fi
}

echo "🔍 Backend Connectivity Tests"
echo "------------------------------------------"

# Test 1: Backend health check
run_test "Backend health endpoint" "curl -s -o /dev/null -w '%{http_code}' https://tubeclickpro-backend-engine.onrender.com/healthz | grep -q '200'"

# Test 2: Backend ready check
run_test "Backend ready endpoint" "curl -s -o /dev/null -w '%{http_code}' https://tubeclickpro-backend-engine.onrender.com/readyz | grep -q '200'"

# Test 3: Backend root endpoint
run_test "Backend root endpoint" "curl -s -o /dev/null -w '%{http_code}' https://tubeclickpro-backend-engine.onrender.com/ | grep -q '200'"

echo ""
echo "📡 Frontend Configuration Tests"
echo "------------------------------------------"

# These would need to be run from the frontend, but we can check if the env vars are set
# by examining the built files or checking the Vercel dashboard

echo "⚠️  Frontend environment variables must be checked in Vercel Dashboard"
echo "   Required variables:"
echo "   - VITE_SUPABASE_URL"
echo "   - VITE_SUPABASE_PUBLISHABLE_KEY"
echo "   - VITE_ENGINE_URL = https://tubeclickpro-backend-engine.onrender.com"
echo "   - VITE_BACKEND_ENGINE_URL = https://tubeclickpro-backend-engine.onrender.com"
echo ""

echo "🔧 Backend Environment Variable Tests"
echo "------------------------------------------"
echo "⚠️  These must be checked in Render Dashboard for tubeclickpro-backend-engine"
echo ""
echo "   CRITICAL (Backend will fail without these):"
echo "   ✓ NODE_ENV = production"
echo "   ✓ SUPABASE_URL = https://your-project-ref.supabase.co"
echo "   ✓ SUPABASE_ANON_KEY = your_anon_key"
echo "   ✓ SUPABASE_SERVICE_ROLE_KEY = your_service_role_key"
echo "   ✓ CORS_ORIGINS = https://tubeclickpro.in,https://www.tubeclickpro.in,http://localhost:5173"
echo "   ✓ REDIS_URL = redis://:password@host:port"
echo ""
echo "   YouTube Module (Required for YouTube Connect):"
echo "   ✓ GOOGLE_OAUTH_CLIENT_ID = your_client_id"
echo "   ✓ GOOGLE_OAUTH_CLIENT_SECRET = your_client_secret"
echo "   ✓ GOOGLE_OAUTH_REDIRECT_URL = https://tubeclickpro-backend-engine.onrender.com/api/youtube/callback"
echo "   ✓ YOUTUBE_TOKEN_MASTER_KEY = your_32_char_key"
echo "   ✓ YOUTUBE_API_KEY = your_youtube_api_key"
echo ""
echo "   AI Providers (Required for Voice/Content Generation):"
echo "   ✓ ELEVENLABS_API_KEY = your_elevenlabs_key"
echo "   ✓ OPENROUTER_API_KEYS = your_openrouter_keys"
echo ""

echo "🌐 Network Connectivity Tests"
echo "------------------------------------------"

# Test if we can reach Supabase (if URL is provided)
if [ -n "$SUPABASE_URL" ]; then
    run_test "Supabase connectivity" "curl -s -o /dev/null -w '%{http_code}' \"$SUPABASE_URL/rest/v1/\" | grep -q '200'"
else
    echo "   ⚠️  SUPABASE_URL not set, skipping Supabase connectivity test"
fi

# Test DNS resolution for backend
run_test "Backend DNS resolution" "dig +short tubeclickpro-backend-engine.onrender.com | grep -q '.'"

# Test if backend is reachable
run_test "Backend reachability" "ping -c 1 tubeclickpro-backend-engine.onrender.com > /dev/null 2>&1 || curl -s -o /dev/null -w '%{http_code}' https://tubeclickpro-backend-engine.onrender.com/ > /dev/null 2>&1"

echo ""
echo "📊 Test Summary"
echo "------------------------------------------"
echo "Total tests: $TOTAL_TESTS"
echo -e "${GREEN}Passed: $PASSED_TESTS${NC}"
echo -e "${RED}Failed: $FAILED_TESTS${NC}"
echo ""

if [ $FAILED_TESTS -gt 0 ]; then
    echo -e "${RED}❌ Some tests failed. Please review the failures above.${NC}"
    exit 1
else
    echo -e "${GREEN}✅ All tests passed!${NC}"
    exit 0
fi
