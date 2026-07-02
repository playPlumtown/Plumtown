<div align="center">

# Open RAM

<img src="https://static.wixstatic.com/media/e2da02_df60ba95366a410f9d46c572b4513ca4~mv2.png" alt="Open RAM" width="100%" />

### Rent any machine. Run any model.

**A Solana-native marketplace for AI compute & open-source models — pay on-chain in SOL, get real GPUs and 139+ models.**

<br/>

![Next.js](https://img.shields.io/badge/Next.js_15-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)
![Solana](https://img.shields.io/badge/Solana-mainnet-9945FF?style=for-the-badge&logo=solana&logoColor=white)
![Vast.ai](https://img.shields.io/badge/Vast.ai-GPUs-1f6feb?style=for-the-badge)
![OpenRouter](https://img.shields.io/badge/OpenRouter-139%2B_models-6E56CF?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-2ea44f?style=for-the-badge)

[![Website](https://img.shields.io/badge/Website-tryopenram.app-C6742B?style=for-the-badge&logo=safari&logoColor=white)](https://tryopenram.app)
[![X](https://img.shields.io/badge/Follow-@tryopenram-000000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/tryopenram)

</div>

---

CA: GTDSxLef3pnLPpChemVDnB6n2CFqoFTMyDecydqGpump

## 🌾 Overview

AI runs on two things: **compute** to run it, and **models** to run. Both are gatekept — GPUs are scarce and paid for with cards through providers that reject half the world, and model access is locked behind per-provider accounts and billing.

**Open RAM removes the gatekeepers.** It's a marketplace where:

- You **rent real GPUs by the hour** and use them in your browser or over SSH.
- You **call 139+ open and frontier models** through a single prepaid key.
- You can **list your own** compute or API and get paid by buyers directly.

Everything is settled **on-chain in SOL** through your Solana wallet. There is no sign-up billing, no store credit, no invoices. You connect Phantom, you pay SOL, you get the thing — and every payment is verified on-chain before anything is delivered.

Think of it as **Stripe-free, account-free infrastructure for AI**: a two-sided market where the settlement layer is a blockchain instead of a payment processor.

---

## 🧩 How it all fits together

Open RAM is a two-sided marketplace with **three products** sitting on **one settlement layer**.

```
                      ┌──────────────────────── SELLERS ────────────────────────┐
                      │   list a GPU / CPU / RAM box      list an API endpoint   │
                      └───────────────┬─────────────────────────┬───────────────┘
                                      │                         │
   ┌──────────────────┐      ┌────────▼─────────┐      ┌────────▼─────────┐
   │  Compute Market  │      │  Community Market │      │   Model APIs     │
   │  (Vast.ai GPUs)  │      │  (P2P listings)   │      │  (OpenRouter)    │
   └────────┬─────────┘      └────────┬──────────┘      └────────┬─────────┘
            │                         │                          │
            └───────────────┬─────────┴──────────────┬───────────┘
                            │                         │
                   ┌────────▼─────────┐      ┌────────▼─────────┐
                   │  Solana wallet   │      │   $RAM token     │
                   │  pay in SOL      │  or  │  pay -50%, burns │
                   └────────┬─────────┘      └────────┬─────────┘
                            └────────────┬────────────┘
                                ┌────────▼─────────┐
                                │  On-chain verify │  (Helius) → deliver / credit
                                └──────────────────┘
```

Whether you buy compute, buy API credits, or buy from another user, the flow is the same: **approve a real SOL transaction → the server verifies it on-chain → you receive access.**

---

## 🖥️ Renting compute

The **Compute Marketplace** is backed by **Vast.ai's live GPU network** — hundreds of real machines from independent hosts worldwide.

**What you see:** a live catalog of GPUs (RTX 3060 → H100-class), each showing real specs — GPU model, VRAM, vCPU, RAM, disk, region, host reliability score — and a live hourly price (Vast's raw rate + the platform's markup, charged in SOL).

**How renting works:**

1. Pick a machine and a duration. The cost is shown in SOL and its USD equivalent.
2. Approve the SOL payment in your wallet — it goes to the platform treasury.
3. The server calls Vast, finds a currently-available host for that GPU model, and **launches a real instance**.
4. The machine appears in your **Workspace** within a minute, with a live status and connection details.

**You get real access** — an SSH command (`ssh root@… -p …`) and an in-browser **Jupyter** link. The instance is billed per hour while it runs; stop or terminate it anytime and the charges stop.

> Because it's real hardware, the box is yours to do anything with — train, fine-tune, run inference, serve a model, whatever.

---

## 🔑 The Universal API Key

Not everyone wants to manage a machine. The **Model APIs** side gives you **one prepaid key that calls every model** — no per-provider accounts, no monthly bills.

- **One key, 139+ models** — Claude, Llama, Qwen, DeepSeek, Mistral and more, routed through OpenRouter. Switch models by changing one field in your request.
- **OpenAI-compatible** — the endpoint is a drop-in for the OpenAI SDK. Point any existing code at it by changing the base URL and key.
- **Prepaid in SOL** — top the key up with SOL; the balance is held in SOL. Each call is **metered per token** (real upstream cost + markup) and debited from the balance. When it hits zero, calls pause until you top up again.
- **Use it anywhere** — from your own code, or from the built-in prompt box on the site.

```bash
curl https://tryopenram.app/api/v1/chat/completions \
  -H "Authorization: Bearer oca_live_xxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "anthropic/claude-3.5-sonnet",
    "messages": [{ "role": "user", "content": "Hello!" }]
  }'
```

```python
from openai import OpenAI

client = OpenAI(base_url="https://tryopenram.app/api/v1", api_key="oca_live_xxxxxxxx")
r = client.chat.completions.create(
    model="meta-llama/llama-3.1-70b-instruct",
    messages=[{"role": "user", "content": "Explain RAM in one sentence."}],
)
print(r.choices[0].message.content)
```

Behind the key: requests without a valid key are rejected (`401`); a key with no balance is rejected (`402`); otherwise the request is forwarded upstream, the response returned, and the token cost debited from the key's SOL balance.

---

## 🧑‍💻 The Workspace

The **Workspace** is where everything you've bought lives and gets used.

- **Your rented machines** — each with a live status, an SSH command you can copy, and an **"Open Jupyter"** button to run notebooks in your browser. Step-by-step instructions are right on the card.
- **Your API key** — balance, top-up, endpoint, and a prompt box to chat with any model, all in one place.

It's the "cockpit": rent or create on the marketplace, then come here to actually do the work.

---

## 🤝 The Community Marketplace

Open RAM isn't just first-party — **anyone can become a seller.** The Community tab is a true peer-to-peer market.

**Listing your own compute or API:**

- List a **GPU / CPU / RAM machine** you control, or an **API endpoint** you operate.
- Set your price in SOL and provide the access details (SSH connection, or the API's base URL + key) — these stay **private** until someone pays.

**Real verification — no fake listings:**

- **API listings are test-called.** Before an API goes live, the server makes a real completion request to the endpoint with the seller's key. If it doesn't return a valid response, the listing is **rejected**. Verified APIs get a ✅ badge.
- **Machine listings are SSH-probed.** If the seller provides a host, the server opens a connection and reads the SSH banner to confirm a real server is reachable — with an SSRF guard so it can't be used to scan private networks.

**Buying — one transaction, split on-chain:**

- When a buyer purchases, they sign **a single Solana transaction that splits the payment**: **99% straight to the seller's wallet, 1% to the marketplace treasury.**
- The server **verifies that split on-chain** — reading the actual balance changes to confirm both the seller and the treasury were paid the right amounts — before releasing the seller's access details.
- Every payment signature can be redeemed **only once** (replay-protected), so a payment can never be reused.

The result: sellers get paid directly and instantly, buyers only get access after a verified payment, and the platform takes a flat 1% — all without escrow or a middleman holding funds.

---

## 🪙 $RAM — the token

`$RAM` is the platform token, designed to be **useful first and deflationary by construction.**

**Utility — pay less:**

- At checkout you choose **SOL or $RAM**.
- Paying in **$RAM is 50% cheaper** than paying in SOL for the same purchase.

**Deflation — every spend burns:**

- Every $RAM spent flows into the Open RAM **treasury**.
- A server process **burns the treasury's entire $RAM balance every 10 minutes** — a real on-chain burn transaction, signed autonomously by the treasury and run on a timer.
- There is no buyback discretion and no manual step: **usage → treasury → burn.** Supply only ever goes down as the platform is used.

**Transparent:**

- All payments land in a single, public treasury wallet, and every burn is an on-chain transaction anyone can verify.

> $RAM launches soon. Until the mint is live, SOL powers everything and the token option stays dormant.

---

## ⛓️ Payments & verification

The thing that makes a walletless, account-free marketplace possible is that **money is verified on-chain, not trusted from the client.**

- **Real wallets, real network.** Payments are made with **Phantom** (directly or via **Privy**) on **Solana mainnet**. No demo balances.
- **Server-side verification.** For every purchase — compute, API credits, or a community listing — the server pulls the transaction from a **Helius** RPC and checks the on-chain balance deltas: the correct recipient(s) received the correct amount. Only then is access delivered or credit granted.
- **No replays.** Each payment signature is recorded and can be redeemed once. A signature can't be reused to claim a second purchase.
- **One treasury.** All platform payments settle to a single, public treasury address, which also signs the autonomous $RAM burns.

This is the core design principle: **the client can ask, but the chain decides.**

---

## 🧱 Tech stack

- **Next.js 15** (App Router) · **React 18** · **TypeScript**
- **Tailwind CSS** with CSS-variable theming (a warm cream palette + a roasted-espresso dark mode)
- **Solana** — `@solana/web3.js`, `@solana/kit`, `@solana/spl-token`, **Privy** wallet auth, Phantom
- **Vast.ai** — real GPU provisioning: search offers, launch, poll status, SSH/Jupyter, stop, destroy
- **OpenRouter** — real LLM inference across 139+ models, metered per token
- **Helius** — Solana RPC for on-chain payment verification and the token burn

The app is a single Next.js codebase: server-only integrations (Vast, OpenRouter, on-chain verification, the burn loop) live in API routes and server libs; the client is a wallet-aware React app that never handles secrets.

---

## 🚀 Run it locally

```bash
git clone https://github.com/ctrlshifthash/openram
cd openram
cp .env.example .env.local     # add your keys
npm install
npm run dev                    # http://localhost:3000
```

---

## 🔗 Links

- 🌐 **Website** — [tryopenram.app](https://tryopenram.app)
- 𝕏 **X** — [@tryopenram](https://x.com/tryopenram)

---

## 📄 License

Released under the [MIT License](LICENSE).

<div align="center">
<br/>
<strong>Open RAM</strong> — 🐏 Rent any machine. Run any model.
</div>
