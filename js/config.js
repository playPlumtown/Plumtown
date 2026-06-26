/* ============================================================
   LifeSim — front-end config
   Leave cloudApi EMPTY for offline single-player + a simulated
   community. After you deploy the backend (see server/README.md),
   paste its public URL here to switch on REAL shared multiplayer:

     window.LIFESIM_CONFIG = { cloudApi: 'https://your-app.up.railway.app' };

   (No trailing slash.)

   Real P2E payouts (SOL/USDC) need this same backend. ALL economy
   rules — reward amounts, caps, network (devnet/mainnet), the
   treasury — live SERVER-SIDE (see server/.env.example). The client
   fetches them from /api/p2e/config, so there is nothing secret here.
   ============================================================ */
window.LIFESIM_CONFIG = { cloudApi: '' };
