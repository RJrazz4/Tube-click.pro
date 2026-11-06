# TubeClick P2P signaling server

The meeting point for the Voiceover page's peer-to-peer voice mesh.
It introduces browsers to each other (WebRTC signaling) and relays
nothing else — script text and audio travel only on the direct,
encrypted peer-to-peer channel.

## Run locally
```
npm install
npm start          # listens on PORT (default 8787)
```

## Deploy (Render, free tier)
1. New Web Service from the Tube-click.pro repo.
2. Root directory: `p2p-signaling` · Build: `npm install` · Start: `node server.js`.
3. After it is live, set on Vercel (frontend project):
   `VITE_P2P_SIGNALING_URL=wss://<your-render-host>`
   and redeploy the frontend. Without this variable the Voice page
   runs in local-only mode (still fully working, just no turbo).

Note: free-tier services sleep when idle — the first visitor's
signaling connection may take ~30s to wake it. A keep-alive ping
(the same pattern as the RazzScale bot) removes the wait.
