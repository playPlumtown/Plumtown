# LifeSim Community API

The shared-world backend. Players register, **publish** their house, and anyone can
**list/visit** everyone's houses. One shared neighbourhood for all real players.

- No persistence config → **in-memory** (local dev).
- `DATABASE_URL` set → **PostgreSQL** (persistent; use on Railway).

## Endpoints

| Method | Path | Body / Auth | Returns |
|---|---|---|---|
| GET  | `/api/health` | — | `{ ok, store }` |
| POST | `/api/register` | `{ name }` | `{ id, apiKey, name }` |
| POST | `/api/world` | header `x-api-key`, `{ summary, world }` | `{ ok }` |
| GET  | `/api/players` | — | `{ players: [summary…] }` |
| GET  | `/api/world/:id` | — | `{ world }` |
| POST | `/api/heartbeat` | header `x-api-key` | `{ ok }` |
| GET  | `/api/p2e/config` | — | reward rules + network (no secrets) |
| GET  | `/api/rewards` | header `x-api-key` | `{ rewards, config, payouts }` |
| POST | `/api/rewards/claim` | `x-api-key`, `{ kind, key, tag }` | credits a verified achievement |
| POST | `/api/wallet/link` | `x-api-key`, `{ address, signature }` | links a wallet (ownership-proved) |
| POST | `/api/wallet/unlink` | `x-api-key` | `{ ok }` |
| POST | `/api/withdraw` | `x-api-key`, `{ amount }` | sends real SOL/USDC; `{ signature, explorer }` |

`apiKey` is returned once at register and stored in the player's browser; it
authorises that player to publish their own house and claim/withdraw rewards.

## Run locally

```
node server/index.js
# → LifeSim community API on :3001 (in-memory)
```

Then point the front-end at it by editing `js/config.js`:

```js
window.LIFESIM_CONFIG = { cloudApi: 'http://localhost:3001' };
```

## Deploy on Railway (persistent, shared by real players)

1. Push this repo to GitHub.
2. On [railway.app](https://railway.app): **New Project → Deploy from GitHub repo**, and set the
   service **Root Directory** to `server` (so it runs this folder).
3. In the same project: **New → Database → PostgreSQL**. Railway injects `DATABASE_URL`
   automatically — the server detects it and switches to Postgres on next deploy.
4. Railway gives the service a public URL like `https://your-app.up.railway.app`.
   Put that in the front-end `js/config.js`:

   ```js
   window.LIFESIM_CONFIG = { cloudApi: 'https://your-app.up.railway.app' };
   ```

5. Host the front-end anywhere static (Railway static service, Netlify, Vercel, GitHub Pages…)
   or keep running it locally — it just needs to reach the API URL above. CORS is open (`*`).

That's it: every player who opens the site and picks a name joins the **same** shared
neighbourhood, their house is saved to the database, and the Community tab shows—and
lets you visit—everyone's real houses.

---

# P2E — real Solana payouts

Players earn **redeemable credits** for *verified* achievements and cash them out as
**real SOL or USDC** from a treasury you fund. It is **non-custodial** (players keep
their own keys; payouts go to their connected wallet) and **server-authoritative** (the
browser is never trusted with reward amounts).

## The economy (why it can't be drained)

Two separate currencies, on purpose:

- **`$LSC`** — the in-game soft currency. Earned and spent freely in-game. *Not money.*
- **Reward credits (RC)** — a **capped, server-verified** pool that converts to SOL/USDC.
  Only a curated set of achievements mint RC (daily login, quest + life-milestone
  completions), each **once per account**, under a **daily earn cap**. So the lifetime
  payout any account can mint is **bounded and known** — a cheating client can forge
  events all day and still mint nothing the server doesn't recognise.

Withdrawals are gated by a **minimum**, a **daily cap**, a **cooldown**, and an optional
**fee**, and are **debited before they're sent** (refunded on failure) so a race can't
double-spend. The treasury key lives **only** on the server (env var); it is never sent
to the client and must never be committed (`.gitignore` covers `.env` and key files).

## Setup

1. **Install deps** (adds the Solana libs):
   ```
   cd server && npm install
   ```
2. **Create a treasury wallet** and fund it. Either export a Phantom private key
   (base58) or `solana-keygen new`. This wallet *pays* players.
3. **Configure** — copy `.env.example` → `.env` and fill it in (Railway: use the
   Variables tab). The important ones:
   ```
   P2E_TREASURY_SECRET=<base58 or [json array] secret key>   # SECRET — server only
   P2E_SOLANA_NETWORK=devnet        # develop here first; mainnet-beta when ready
   P2E_REWARD_ASSET=SOL             # or USDC
   P2E_PAYOUTS_ENABLED=false        # flip to true ONLY when you're ready to pay real money
   ```
4. **Verify before going live** — confirms key parsing, RPC, balance, and a real transfer:
   ```
   node scripts/verify-payout.js                 # devnet, throwaway recipient
   node scripts/verify-payout.js <yourWallet>    # send to a specific address
   ```

## Going from devnet → mainnet

Develop and test on **devnet** (free test SOL: <https://faucet.solana.com>). When you're
ready, and only after your own legal + security review:

```
P2E_SOLANA_NETWORK=mainnet-beta
P2E_SOLANA_RPC_URL=<a paid/private RPC — don't use the public endpoint for mainnet>
P2E_PAYOUTS_ENABLED=true
```

Fund the treasury with real SOL/USDC, run `verify-payout.js` once against a wallet you
own, then it's live.

## ⚠ Before you accept real money

This code gives you a **safe, bounded payout mechanism** — it is **not** legal or
financial advice. Real-money rewards can trigger **gambling / money-transmission /
securities / tax** obligations that vary by country and by how you market the game. You
are responsible for: a legal review for your jurisdictions, terms of service, KYC/AML if
required, a security audit of your deployment + treasury key handling, treasury funding &
runway, and abuse monitoring. The defaults here are conservative starting points, not a
guarantee of compliance or solvency.
