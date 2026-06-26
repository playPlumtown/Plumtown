/* ============================================================
   Plumtown — Dashboard Controller
   Wires dashboard UI to the Plumtown state engine
   ============================================================ */

(function () {
  'use strict';

  const LS = window.LifeSim;
  let state = LS.load();

  // Ensure quests exist
  if (!state.quests || !state.quests.length) {
    state.quests = LS.defaultQuests();
    LS.save(state);
  }

  // ---------------- DOM HELPERS ----------------
  const $ = (s, p = document) => p.querySelector(s);
  const $$ = (s, p = document) => Array.from(p.querySelectorAll(s));

  function toast(msg, type = '') {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast show ' + type;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (t.className = 'toast ' + type), 2600);
  }

  function num(n) { return Math.round(n).toLocaleString(); }

  function logActivity(icon, text) {
    state.activity.unshift({ icon, text, at: LS.nowISO() });
    if (state.activity.length > 30) state.activity.length = 30;
  }

  function addTx(type, amount, note) {
    state.economy.transactions.unshift({
      id: LS.uid(), type, amount, note, at: LS.nowISO()
    });
    if (state.economy.transactions.length > 50) state.economy.transactions.length = 50;
  }

  function earnLSC(amount, note) {
    state.player.lsc += amount;
    state.economy.totalEarned += amount;
    addTx('earn', amount, note);
    logActivity('💰', `Earned ${amount} PLUM — ${note}`);
  }

  // ---------------- VIEW SWITCHING ----------------
  function switchView(name) {
    $$('.view').forEach((v) => v.classList.remove('active'));
    const view = $('#view-' + name);
    if (view) view.classList.add('active');
    $$('.side-link').forEach((l) => l.classList.toggle('active', l.dataset.view === name));
    if (name === 'sims') renderSimsList($('#simListFull'));
    if (name === 'quests') renderQuestsFull();
    if (name === 'wallet') renderWallet();
    if (name === 'community') { renderCommunity(); startChatPoll(); } else { stopChatPoll(); }
    if (name === 'settings') renderSettings();
    $('#sidebar').classList.remove('open');
  }

  // ---------------- RENDER: STATS / TOPBAR ----------------
  function renderTopbar() {
    $('#lscBalance').textContent = state.player.lsc.toLocaleString();
    const tc = $('#topConnect');
    if (tc) {
      if (state.player.wallet) {
        const w = state.player.wallet;
        tc.textContent = '🟢 ' + w.slice(0, 4) + '…' + w.slice(-4);
        tc.classList.remove('btn-primary'); tc.classList.add('btn-ghost');
        tc.title = 'Wallet connected — open Wallet';
      } else {
        tc.textContent = '🔗 Connect Wallet';
        tc.classList.add('btn-primary'); tc.classList.remove('btn-ghost');
        tc.title = 'Connect your Solana wallet';
      }
    }
  }

  function renderOverview() {
    const name = state.player.name && state.player.name !== 'Player' ? state.player.name : '';
    const greet = $('#hubGreeting');
    if (greet) greet.textContent = state.sims.length ? ('Welcome back' + (name ? ', ' + name.split(' ')[0] : '') + ' 👋') : 'Welcome to Plumtown';

    const play = $('#hubPlay');
    if (play) {
      const active = state.activeSimId && state.sims.find((s) => s.id === state.activeSimId);
      const sim = active || state.sims[0];
      play.style.display = state.sims.length ? '' : 'none';
      play.href = sim ? ('game.html?sim=' + sim.id) : 'game.html';
      play.innerHTML = sim ? '▶ Play ' + escapeHtml(sim.name.split(' ')[0]) : '▶ Play';
    }

    const lsc = $('#statLSC'); if (lsc) lsc.textContent = num(state.player.lsc);
    const usd = $('#statUSD'); if (usd) usd.textContent = (state.player.lsc * state.economy.lscPriceUSD).toFixed(2);

    renderSimsList($('#simList'));
    renderActivity();
    renderDaily();
  }

  function renderActivity() {
    const feed = $('#activityFeed');
    if (!state.activity.length) {
      feed.innerHTML = '<div class="feed-item"><span class="fi-ic">🎉</span><div><b>Welcome to Plumtown!</b><small>Just now</small></div></div>';
      return;
    }
    feed.innerHTML = state.activity.slice(0, 8).map((a) => {
      const ago = timeAgo(a.at);
      return `<div class="feed-item"><span class="fi-ic">${a.icon}</span><div><b>${a.text}</b><small>${ago}</small></div></div>`;
    }).join('');
  }

  function timeAgo(iso) {
    const d = new Date(iso).getTime();
    const s = Math.floor((Date.now() - d) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
  }

  // ---------------- RENDER: SIMS ----------------
  function simAvatarHTML(sim) {
    return `<div class="sim-avatar" style="border-color:${sim.outfitColor}">
      <div class="sa-hair" style="background:${sim.hairColor || '#1c1410'}"></div>
      <div class="sa-head" style="background:${sim.skinTone}"></div>
      <div class="sa-body" style="background:${sim.outfitColor}"></div>
    </div>`;
  }

  function renderSimsList(container) {
    if (!container) return;
    if (!state.sims.length) {
      container.innerHTML = `<div class="empty-state">
        <div class="empty-ic">🧍</div>
        <p>You don't have any Sims yet.</p>
        <button class="btn btn-primary" onclick="openSimModal()">Create your first Sim</button>
      </div>`;
      return;
    }
    container.innerHTML = state.sims.map((sim) => {
      const career = sim.career ? `${LS.CAREERS[sim.career.track].label} · Lvl ${sim.career.level + 1}` : 'Unemployed';
      const asp = LS.aspirationStatus ? LS.aspirationStatus(sim) : { progress: 0, label: LS.ASPIRATIONS[sim.aspiration].label };
      const pct = Math.round((asp.progress || 0) * 100);
      return `<div class="sim-card">
        ${simAvatarHTML(sim)}
        <div class="sim-info">
          <b>${escapeHtml(sim.name)}</b>
          <small>${career} · ₱${num(sim.money)}</small>
          <div class="sim-tags">
            <span class="tag">${LS.ASPIRATIONS[sim.aspiration].icon} ${LS.ASPIRATIONS[sim.aspiration].label}</span>
            ${sim.traits.slice(0, 2).map((t) => `<span class="tag">${t}</span>`).join('')}
          </div>
          <div class="sim-asp" title="Aspiration progress: ${pct}%"><div class="sim-asp-bar"><span style="width:${pct}%"></span></div><small>${pct}%</small></div>
        </div>
        <div class="sim-actions">
          <a href="game.html?sim=${sim.id}" class="btn btn-primary">Play</a>
          <button class="btn btn-ghost" onclick="deleteSim('${sim.id}')">Delete</button>
        </div>
      </div>`;
    }).join('');
  }

  window.deleteSim = function (id) {
    if (!confirm('Delete this Sim permanently?')) return;
    state.sims = state.sims.filter((s) => s.id !== id);
    if (state.activeSimId === id) state.activeSimId = null;
    LS.save(state);
    renderOverview();
    renderSimsList($('#simListFull'));
    renderTopbar();
    toast('Sim deleted', 'error');
  };

  // ---------------- RENDER: QUESTS ----------------
  function renderQuestPreview() {
    const c = $('#questPreview');
    c.innerHTML = state.quests.slice(0, 3).map(questRowHTML).join('');
  }

  function renderQuestsFull() {
    const c = $('#questFull');
    c.innerHTML = state.quests.map(questRowHTML).join('');
  }

  function questRowHTML(q) {
    const pct = Math.min(100, Math.round((q.progress / q.target) * 100));
    return `<div class="quest-row ${q.done ? 'completed' : ''}">
      <div class="q-ic">${q.icon}</div>
      <div class="q-body">
        <b>${q.title}</b>
        <small>${q.desc}</small>
        <div class="q-bar"><span style="width:${pct}%"></span></div>
      </div>
      <div class="q-reward ${q.done ? 'done' : ''}">${q.done ? '✓ Done' : '+' + q.reward + ' PLUM'}</div>
    </div>`;
  }

  // ---------------- RENDER: DAILY ----------------
  function renderDaily() {
    const claimed = state.player.dailyClaimedAt;
    const now = Date.now();
    const dayMs = 86400000;
    const canClaim = !claimed || now - new Date(claimed).getTime() >= dayMs;
    const btn = $('#claimDaily');
    const amount = $('#drAmount');
    const timer = $('#drTimer');

    const dailyAmt = 50 + Math.min(150, (state.player.level - 1) * 10);
    amount.textContent = '+' + dailyAmt;

    if (canClaim) {
      btn.disabled = false;
      btn.textContent = 'Claim Now';
      timer.textContent = 'Ready to claim!';
    } else {
      btn.disabled = true;
      btn.textContent = 'Claimed';
      const remain = dayMs - (now - new Date(claimed).getTime());
      timer.textContent = 'Resets in ' + formatDur(remain);
    }
  }

  function formatDur(ms) {
    const s = Math.floor(ms / 1000);
    const h = String(Math.floor(s / 3600)).padStart(2, '0');
    const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const sec = String(s % 60).padStart(2, '0');
    return `${h}:${m}:${sec}`;
  }

  // ---------------- RENDER: WALLET ----------------
  function renderWallet() {
    $('#walletLSC').textContent = num(state.player.lsc);
    $('#walletUSD').textContent = (state.player.lsc * state.economy.lscPriceUSD).toFixed(2);
    renderSparkline();
    renderWalletConnect();
    renderP2E();
    const list = $('#txList');
    if (!state.economy.transactions.length) {
      list.innerHTML = '<div class="empty-state small"><p>No transactions yet. Earn $PLUM by playing!</p></div>';
      return;
    }
    list.innerHTML = state.economy.transactions.map((tx) => {
      const pos = tx.type === 'earn' || tx.type === 'reward';
      const icon = { earn: '💰', reward: '🎁', withdraw: '📤', spend: '🛒' }[tx.type] || '💰';
      return `<div class="tx-row">
        <div class="tx-type">${icon}</div>
        <div class="tx-info"><b>${tx.note}</b><small>${timeAgo(tx.at)}</small></div>
        <div class="tx-amt ${pos ? 'pos' : 'neg'}">${pos ? '+' : '-'}${tx.amount} PLUM</div>
      </div>`;
    }).join('');
  }

  // Deterministic-ish sparkline from a seed so it doesn't reshuffle each view.
  function renderSparkline() {
    const line = $('#lscSparkLine');
    if (!line) return;
    const seed = (state.economy.totalEarned || 0) + 7;
    const pts = [];
    let v = 30 + (seed % 17);
    for (let i = 0; i <= 16; i++) {
      const x = (i / 16) * 320;
      // gentle pseudo-random walk seeded by index
      v += ((Math.sin(seed * 0.7 + i * 1.3) + Math.sin(i * 0.9)) * 4);
      v = Math.max(8, Math.min(54, v));
      pts.push(x.toFixed(0) + ',' + (60 - v).toFixed(0));
    }
    line.setAttribute('points', pts.join(' '));
    const price = $('#lscPrice');
    if (price) price.textContent = '$' + state.economy.lscPriceUSD.toFixed(3);
  }

  function renderWalletConnect() {
    const el = $('#walletConnect');
    if (!el) return;
    if (state.player.wallet) {
      const w = state.player.wallet;
      el.innerHTML = '<div class="wc-connected">🟢 ' + escapeHtml(w.slice(0, 6) + '…' + w.slice(-4)) +
        '<button class="link" id="wcDisconnect">Disconnect</button></div>';
      const d = $('#wcDisconnect');
      if (d) d.addEventListener('click', disconnectWallet);
    } else {
      el.innerHTML = '<button class="btn btn-ghost btn-sm" id="wcConnect">🔗 Connect Phantom</button>';
      const c = $('#wcConnect');
      if (c) c.addEventListener('click', connectWallet);
    }
  }

  // Real, non-custodial Phantom connect (client-side — works with or
  // without the backend; linking for withdrawals needs the backend).
  async function connectWallet() {
    if (!LS.P2E) { toast('Wallet unavailable', 'error'); return; }
    if (!LS.P2E.walletInstalled()) {
      toast('Install the Phantom wallet to connect', 'error');
      window.open('https://phantom.app/', '_blank', 'noopener');
      return;
    }
    try {
      toast('Approve the connection in your wallet…');
      const addr = await LS.P2E.connect();
      state.player.wallet = addr;
      LS.save(state);
      if (LS.P2E.isLive && LS.P2E.isLive()) { try { await LS.P2E.linkWallet(); } catch (e) { /* */ } }
      renderTopbar();
      renderWalletConnect();
      if ($('#view-wallet') && $('#view-wallet').classList.contains('active')) renderWallet();
      toast('Wallet connected ✓', 'success');
    } catch (e) {
      toast((e && e.userMessage) || 'Connection cancelled', 'error');
    }
  }

  async function disconnectWallet() {
    try { if (LS.P2E && LS.P2E.disconnect) await LS.P2E.disconnect(); } catch (e) { /* */ }
    state.player.wallet = '';
    LS.save(state);
    renderTopbar();
    renderWalletConnect();
    if ($('#view-wallet') && $('#view-wallet').classList.contains('active')) renderWallet();
    toast('Wallet disconnected');
  }

  // ---------------- RENDER: P2E (real Solana rewards) ----------------
  let _p2eConfig = null;
  async function renderP2E() {
    const panel = $('#p2ePanel');
    if (!panel) return;
    const P2E = LS.P2E;
    // The real-money panel only appears when a backend is configured.
    if (!P2E || !P2E.isRemote()) { panel.hidden = true; return; }
    panel.hidden = false;
    const body = $('#p2eBody');

    let cfg = _p2eConfig;
    try { if (!cfg) cfg = _p2eConfig = await P2E.config(); } catch (e) { cfg = null; }

    const netEl = $('#p2eNet'), assetEl = $('#p2eAsset');
    if (cfg && netEl) {
      const live = cfg.payoutsLive;
      const netName = cfg.network === 'mainnet-beta' ? 'Mainnet' : (cfg.network || 'devnet');
      netEl.textContent = (live ? '🟢 ' : '🧪 ') + netName + (live ? '' : ' · test');
      netEl.className = 'p2e-net ' + (live ? 'live' : 'test');
      if (assetEl) assetEl.textContent = '· ' + (cfg.rewardAsset || 'SOL');
    }

    if (!LS.Cloud || !LS.Cloud.me || !LS.Cloud.me()) {
      body.innerHTML = '<div class="p2e-cta"><p>Real rewards are tied to your shared-world account.</p>' +
        '<button class="btn btn-primary btn-sm" id="p2eJoin">Sign in from Community →</button></div>';
      const j = $('#p2eJoin'); if (j) j.addEventListener('click', () => switchView('community'));
      return;
    }

    let data;
    try { data = await P2E.rewards(); } catch (e) { data = null; }
    if (!data || !data.rewards) {
      body.innerHTML = '<div class="community-loading">Couldn’t reach the rewards backend.</div>';
      return;
    }
    const r = data.rewards, c = data.config || cfg || {};
    const perUnit = c.creditsPerUnit || 100000;
    const asset = c.rewardAsset || 'SOL';
    const dp = asset === 'USDC' ? 4 : 6;
    const bal = r.balance || 0;
    const min = c.minWithdraw || 0;
    const canWithdraw = !!r.wallet && c.payoutsLive && bal >= min;

    const walletRow = r.wallet
      ? '<div class="p2e-wallet connected">🟢 <code>' + escapeHtml(r.wallet.slice(0, 6) + '…' + r.wallet.slice(-4)) + '</code>' +
        (r.walletVerified ? '<span class="verified">verified</span>' : '') +
        '<button class="link" id="p2eUnlink">Disconnect</button></div>'
      : (P2E.walletInstalled()
          ? '<button class="btn btn-ghost btn-sm" id="p2eConnect">🔗 Connect Phantom wallet</button>'
          : '<a class="btn btn-ghost btn-sm" href="https://phantom.app/" target="_blank" rel="noopener">Install Phantom wallet ↗</a>');

    body.innerHTML =
      '<div class="p2e-balance">' +
        '<div class="p2e-credits"><b>' + num(bal) + '</b> <span>credits</span></div>' +
        '<div class="p2e-approx">≈ ' + (bal / perUnit).toFixed(dp) + ' ' + asset + ' redeemable</div>' +
      '</div>' +
      '<div class="p2e-walletrow">' + walletRow + '</div>' +
      '<button class="btn btn-primary btn-block" id="p2eWithdraw"' + (canWithdraw ? '' : ' disabled') + '>Withdraw to wallet</button>' +
      '<div class="p2e-meta"><span>Min ' + num(min) + '</span><span>·</span>' +
        '<span>Daily cap ' + num(c.dailyWithdrawCap || 0) + '</span><span>·</span>' +
        '<span>Earned today ' + num(r.earnedToday || 0) + '/' + num(c.dailyEarnCap || 0) + '</span></div>' +
      (c.payoutsLive ? '' :
        '<div class="p2e-warn">⚠ <b>Test mode.</b> The operator hasn’t enabled live payouts; withdrawals run on <b>' +
        escapeHtml(c.network || 'devnet') + '</b> (no real-money value).</div>') +
      payoutHistoryHTML(data.payouts, asset);

    const cBtn = $('#p2eConnect'); if (cBtn) cBtn.addEventListener('click', connectWalletReal);
    const uBtn = $('#p2eUnlink'); if (uBtn) uBtn.addEventListener('click', async () => { await P2E.unlinkWallet(); toast('Wallet disconnected'); renderP2E(); });
    const wBtn = $('#p2eWithdraw'); if (wBtn) wBtn.addEventListener('click', doWithdrawReal);
  }

  function payoutHistoryHTML(list, asset) {
    if (!list || !list.length) return '';
    const rows = list.slice(0, 5).map((p) => {
      const ok = p.status === 'sent';
      const amt = (p.base / (p.asset === 'USDC' ? 1e6 : 1e9)).toFixed(p.asset === 'USDC' ? 4 : 6);
      const link = p.signature ? ' <a href="https://explorer.solana.com/tx/' + encodeURIComponent(p.signature) + '" target="_blank" rel="noopener">view ↗</a>' : '';
      return '<div class="p2e-payout ' + (ok ? 'ok' : 'fail') + '"><span>' + (ok ? '✅' : '❌') + '</span>' +
        '<span>' + amt + ' ' + escapeHtml(p.asset || asset || '') + '</span>' +
        '<span class="ptime">' + timeAgo(p.at) + '</span><span>' + link + '</span></div>';
    }).join('');
    return '<div class="p2e-history"><h4>Recent payouts</h4>' + rows + '</div>';
  }

  async function connectWalletReal() {
    if (!LS.P2E) return;
    try {
      toast('Approve the connection & signature in your wallet…');
      const res = await LS.P2E.linkWallet();
      toast(res.verified ? 'Wallet linked & verified ✓' : 'Wallet linked', 'success');
      renderP2E();
    } catch (e) {
      toast(e.userMessage || ('Connect failed — ' + reasonText(e.reason || e.message)), 'error');
    }
  }

  async function doWithdrawReal() {
    if (!LS.P2E) return;
    const btn = $('#p2eWithdraw');
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
    try {
      const res = await LS.P2E.withdraw();
      const amt = (res.base / (res.asset === 'USDC' ? 1e6 : 1e9)).toFixed(res.asset === 'USDC' ? 4 : 6);
      addTx('withdraw', res.credits, 'Cashed out ' + amt + ' ' + res.asset + ' to wallet');
      logActivity('📤', 'Cashed out ' + amt + ' ' + res.asset);
      LS.save(state);
      toast('Sent ' + amt + ' ' + res.asset + ' ✓', 'success');
      renderP2E();
    } catch (e) {
      toast('Withdraw failed — ' + reasonText(e.reason), 'error');
      renderP2E();
    }
  }

  function reasonText(reason) {
    return ({
      below_min: 'below the minimum', no_wallet: 'connect a wallet first',
      payouts_disabled: 'payouts not enabled by the operator', payouts_unavailable: 'treasury not configured',
      cooldown: 'please wait a moment and retry', treasury_insufficient: 'treasury is low — try later',
      in_progress: 'a withdrawal is already processing', offline: 'this needs the backend',
      daily_cap: 'daily earn cap reached', bad_signature: 'signature rejected', bad_address: 'invalid wallet',
      network: 'network error', no_wallet_found: 'no wallet detected'
    })[reason] || (reason || 'error');
  }

  // ---------------- RENDER: COMMUNITY ----------------
  function renderCommunityHeader() {
    const head = $('#communityHeader');
    if (!head || !LS.Cloud) return;
    if (!LS.Cloud.isRemote()) {
      head.innerHTML = '<div class="join-banner offline">🔌 <span><b>Offline preview.</b> These neighbours are simulated locally. Deploy the backend (see <code>server/README.md</code>) and set <code>js/config.js</code> for real shared multiplayer.</span></div>';
      return;
    }
    if (!LS.Cloud.me()) {
      head.innerHTML = '<div class="join-banner"><div><b>Join the shared neighbourhood</b><small>Pick a display name to put your home on the map and visit others.</small></div><div class="join-form"><input id="joinName" placeholder="Display name" maxlength="24" /><button class="btn btn-primary" id="joinBtn">Join</button></div></div>';
      const jb = $('#joinBtn'); if (jb) jb.addEventListener('click', doJoin);
      const ji = $('#joinName'); if (ji) ji.addEventListener('keydown', (e) => { if (e.key === 'Enter') doJoin(); });
    } else {
      head.innerHTML = '<div class="join-banner"><div><b>🟢 Signed in as ' + escapeHtml(LS.Cloud.me().name) + '</b><small>Your home is live on the shared map.</small></div><div class="join-form"><button class="btn btn-ghost btn-sm" id="publishBtn">↻ Publish my home</button><button class="btn btn-ghost btn-sm" id="signoutBtn">Sign out</button></div></div>';
      const pb = $('#publishBtn'); if (pb) pb.addEventListener('click', async () => { await LS.Cloud.publish(LS.load()); toast('Home published to the community', 'success'); renderCommunity(); });
      const sb = $('#signoutBtn'); if (sb) sb.addEventListener('click', () => { LS.Cloud.signOut(); renderCommunity(); });
    }
  }

  async function doJoin() {
    const input = $('#joinName');
    const name = ((input && input.value) || '').trim() || state.player.name || 'Player';
    try {
      await LS.Cloud.signIn(name);
      state.player.name = name; LS.save(state);
      toast('Joined the community!', 'success');
      renderTopbar(); renderCommunity();
    } catch (e) { toast('Could not reach the server — check js/config.js', 'error'); }
  }

  // Where a townie is currently playing. Deterministic by id so it's
  // stable between renders. Uses your real venue list (Sim Town).
  function venueFor(p) {
    const venues = (LS.Locations && LS.Locations.list) ? LS.Locations.list() : [];
    const list = venues.length ? venues : [{ id: 'home', name: 'Home', icon: '🏠' }];
    if (p.location && p.location.name) return p.location;
    if (p.isYou) return { id: list[0].id, name: list[0].name || 'Home', icon: list[0].icon || '🏠' };
    // neighbours are "out" at a town venue (skip Home so it feels lively)
    const pool = list.filter((v) => v.id !== 'home');
    const arr = pool.length ? pool : list;
    let h = 5381; const s = String(p.id || p.name || '');
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    const v = arr[h % arr.length];
    return { id: v.id, name: v.name || v.label || v.id, icon: v.icon || '📍' };
  }

  async function renderCommunity() {
    const grid = $('#communityGrid');
    if (!grid || !LS.Cloud) return;
    renderCommunityHeader();
    grid.innerHTML = '<div class="community-loading">Loading neighbourhood…</div>';
    let players = [];
    try { players = await LS.Cloud.listPlayers(); } catch (e) { players = []; }

    // live presence bar — how many townies, who's playing, the hotspot
    const statsEl = $('#communityStats');
    if (statsEl) {
      if (!players.length) { statsEl.innerHTML = ''; }
      else {
        const online = players.filter((p) => p.online);
        const tally = {};
        online.forEach((p) => { const v = venueFor(p); (tally[v.id] = tally[v.id] || { v, n: 0 }).n++; });
        let hot = null; Object.keys(tally).forEach((k) => { if (!hot || tally[k].n > hot.n) hot = tally[k]; });
        statsEl.innerHTML =
          `<div class="cstat"><b>${players.length}</b><span>townies</span></div>` +
          `<div class="cstat"><b class="on">🟢 ${online.length}</b><span>playing now</span></div>` +
          (hot ? `<div class="cstat"><b>${hot.v.icon} ${escapeHtml(hot.v.name)}</b><span>hotspot</span></div>` : '');
      }
    }

    if (!players.length) {
      grid.innerHTML = '<div class="empty-state"><div class="empty-ic">🏘️</div><p>No homes here yet — be the first to join the neighbourhood!</p></div>';
      return;
    }
    grid.innerHTML = players.map((p) => {
      const preview = LS.Cloud.housePreviewHTML(p, 230);
      const av = p.sim
        ? `<div class="cm-avatar" style="border-color:${p.sim.outfitColor}"><div class="sa-hair" style="background:${p.sim.hairColor}"></div><div class="sa-head" style="background:${p.sim.skinTone}"></div><div class="sa-body" style="background:${p.sim.outfitColor}"></div></div>`
        : '<div class="cm-avatar"></div>';
      const link = p.isYou ? 'game.html' : ('game.html?visit=' + p.id);
      const loc = venueFor(p);
      const status = p.online ? `🟢 at ${loc.icon} ${escapeHtml(loc.name)}` : '⚪ Offline';
      return `<div class="community-card${p.isYou ? ' you' : ''}">
        <div class="cm-preview">${preview}<span class="cm-status ${p.online ? 'on' : 'off'}" title="${p.online ? 'Online' : 'Offline'}"></span></div>
        <div class="cm-body">
          ${av}
          <div class="cm-info"><b>${escapeHtml(p.name)}${p.isYou ? ' <span class="cm-tag">You</span>' : ''}</b>
            <small>${status}</small>
            <small class="cm-sub">🪑 ${p.furniture || 0} items · ₱${num(p.houseValue || 0)}</small></div>
          <a href="${link}" class="btn btn-primary btn-sm">${p.isYou ? 'Enter' : 'Visit'} →</a>
        </div>
      </div>`;
    }).join('');
  }

  // ---------------- NEIGHBOURHOOD CHAT ----------------
  let chatTimer = null;
  function startChatPoll() { stopChatPoll(); renderChat(); chatTimer = setInterval(renderChat, 4500); }
  function stopChatPoll() { if (chatTimer) { clearInterval(chatTimer); chatTimer = null; } }

  async function renderChat() {
    const log = $('#chatLog');
    if (!log || !LS.Cloud || !LS.Cloud.getChat) return;
    let msgs = [];
    try { msgs = await LS.Cloud.getChat(50); } catch (e) { msgs = []; }
    const myId = (LS.Cloud.me && LS.Cloud.me()) ? LS.Cloud.me().id : null;
    const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 50;
    log.innerHTML = msgs.length
      ? msgs.map((m) => {
          const mine = m.isYou || (myId && m.playerId === myId);
          return `<div class="chat-msg${mine ? ' mine' : ''}"><span class="cmsg-name">${escapeHtml(m.name || '?')}</span><span class="cmsg-text">${escapeHtml(m.text)}</span><span class="cmsg-time">${timeAgo(new Date(m.at).toISOString())}</span></div>`;
        }).join('')
      : '<div class="chat-empty">No messages yet — say hi 👋</div>';
    if (atBottom) log.scrollTop = log.scrollHeight;
  }

  async function sendChatMsg() {
    const input = $('#chatText');
    if (!input || !input.value.trim()) return;
    const text = input.value;
    input.value = '';
    try { await LS.Cloud.sendChat(text); } catch (e) { /* */ }
    renderChat();
  }

  // ---------------- RENDER: SETTINGS ----------------
  function renderSettings() {
    $('#setName').value = state.player.name;
    $('#setWallet').value = state.player.wallet || '';
    $('#setAutosave').checked = !!state.player.settings.autosave;
    $('#setSound').checked = !!state.player.settings.sound;
  }

  // ---------------- SIM CREATOR MODAL ----------------
  let modalState = {
    skinTone: LS.SKIN_TONES[0],
    outfitColor: LS.OUTFIT_COLORS[0],
    hairColor: LS.HAIR_COLORS[0],
    traits: []
  };

  function openSimModal() {
    modalState = {
      skinTone: LS.SKIN_TONES[0],
      outfitColor: LS.OUTFIT_COLORS[0],
      hairColor: LS.HAIR_COLORS[0],
      traits: []
    };
    $('#simName').value = '';
    $('#simAspiration').value = 'wealth';
    $('#simGender').value = 'nb';
    buildToneRow('#skinToneRow', LS.SKIN_TONES, modalState.skinTone, (c) => { modalState.skinTone = c; updatePreview(); });
    buildToneRow('#outfitColorRow', LS.OUTFIT_COLORS, modalState.outfitColor, (c) => { modalState.outfitColor = c; updatePreview(); });
    buildToneRow('#hairColorRow', LS.HAIR_COLORS, modalState.hairColor, (c) => { modalState.hairColor = c; updatePreview(); });
    buildTraitGrid();
    updatePreview();
    $('#simModal').classList.add('open');
  }

  function buildToneRow(sel, colors, current, onPick) {
    $(sel).innerHTML = colors.map((c) =>
      `<div class="tone ${c === current ? 'selected' : ''}" style="background:${c}" data-c="${c}"></div>`
    ).join('');
    $$(sel + ' .tone').forEach((el) => {
      el.addEventListener('click', () => {
        $$(sel + ' .tone').forEach((x) => x.classList.remove('selected'));
        el.classList.add('selected');
        onPick(el.dataset.c);
      });
    });
  }

  // Each trait + its real in-game effect (matches needs.js / skills.js /
  // careers.js / relationships.js), so players know what they're picking.
  const TRAIT_INFO = {
    Ambitious:    { icon: '🏆', desc: 'Better job performance & faster skill learning' },
    Lazy:         { icon: '😴', desc: 'Energy lasts longer, but weaker at work' },
    Genius:       { icon: '🧠', desc: 'Learns Logic & Programming much faster' },
    Clumsy:       { icon: '🤕', desc: 'Slower at Handiness & Athletics' },
    Romantic:     { icon: '💘', desc: 'Romance builds 30% faster' },
    Loner:        { icon: '🧘', desc: 'Barely needs social time' },
    Outgoing:     { icon: '🥳', desc: 'Loves company — needs to socialise more' },
    Neat:         { icon: '🧼', desc: 'Stays clean & tidy far longer' },
    Slob:         { icon: '🧦', desc: 'Gets dirty & messy fast' },
    Creative:     { icon: '🎨', desc: 'Masters every art skill much faster' },
    Active:       { icon: '🏃', desc: 'Stays fit; faster Fitness & Athletics' },
    Glutton:      { icon: '🍔', desc: 'Always hungry — eats a lot' },
    Bookworm:     { icon: '📚', desc: 'Rarely bored; faster Writing & Logic' },
    'Hot-Headed': { icon: '🌋', desc: 'Short temper — mood runs lower' },
    Cheerful:     { icon: '😄', desc: 'Naturally happier & easy-going socially' }
  };

  function buildTraitGrid() {
    $('#traitGrid').innerHTML = LS.TRAITS.map((t) => {
      const info = TRAIT_INFO[t] || { icon: '✨', desc: '' };
      return `<div class="trait" data-t="${t}"><span class="tr-ic">${info.icon}</span><span class="tr-name">${t}</span><span class="tr-desc">${info.desc}</span></div>`;
    }).join('');
    $$('#traitGrid .trait').forEach((el) => {
      el.addEventListener('click', () => {
        const t = el.dataset.t;
        if (modalState.traits.includes(t)) {
          modalState.traits = modalState.traits.filter((x) => x !== t);
          el.classList.remove('selected');
        } else {
          if (modalState.traits.length >= 3) { toast('Pick up to 3 traits', 'error'); return; }
          modalState.traits.push(t);
          el.classList.add('selected');
        }
      });
    });
  }

  function updatePreview() {
    const av = $('#simPreviewAvatar');
    const hair = av.querySelector('.sa-hair');
    if (hair) hair.style.background = modalState.hairColor;
    av.querySelector('.sa-head').style.background = modalState.skinTone;
    av.querySelector('.sa-body').style.background = modalState.outfitColor;
    av.style.borderColor = modalState.outfitColor;
    const name = $('#simName').value.trim() || 'New Sim';
    $('#spName').textContent = name;
    $('#spAsp').textContent = LS.ASPIRATIONS[$('#simAspiration').value].icon + ' ' + LS.ASPIRATIONS[$('#simAspiration').value].label;
  }

  function createSimFromForm() {
    const name = $('#simName').value.trim();
    if (!name) { toast('Please enter a name', 'error'); return; }
    const sim = LS.createSim({
      name,
      gender: $('#simGender').value,
      aspiration: $('#simAspiration').value,
      skinTone: modalState.skinTone,
      outfitColor: modalState.outfitColor,
      hairColor: modalState.hairColor,
      traits: modalState.traits
    });
    sim.bornDay = (state.time && state.time.day) || 1;
    state.sims.push(sim);
    state.activeSimId = sim.id;
    logActivity('🧍', `Created Sim: ${name}`);
    LS.save(state);
    $('#simModal').classList.remove('open');
    renderOverview();
    renderSimsList($('#simListFull'));
    renderTopbar();
    toast(`${name} has been created!`, 'success');
  }

  window.openSimModal = openSimModal;

  // ---------------- DAILY CLAIM ----------------
  function claimDaily() {
    const claimed = state.player.dailyClaimedAt;
    const now = Date.now();
    const dayMs = 86400000;
    if (claimed && now - new Date(claimed).getTime() < dayMs) {
      toast('Already claimed today', 'error');
      return;
    }
    const amt = 50 + Math.min(150, (state.player.level - 1) * 10);
    state.player.dailyClaimedAt = new Date().toISOString();
    earnLSC(amt, 'Daily login reward');
    state.player.xp += 20;
    LS.save(state);
    renderDaily();
    renderOverview();
    renderTopbar();
    toast(`+${amt} PLUM claimed!`, 'success');
    // Mirror to the server-verified redeemable pool (real-reward credits).
    if (LS.P2E && LS.P2E.isLive()) {
      LS.P2E.claim('daily').then((res) => {
        if (res && res.ok) { toast('+' + res.credited + ' redeemable credits', 'success'); renderP2E(); }
      }).catch(() => {});
    }
  }

  // ---------------- WITHDRAW ----------------
  function withdraw() {
    // When real payouts are live, this $PLUM button defers to the
    // server-verified Redeemable Rewards panel (real money lives there).
    if (LS.P2E && LS.P2E.isLive()) {
      toast('Cash out real rewards from “Redeemable Rewards” below', '');
      const p = document.getElementById('p2ePanel');
      if (p) { p.hidden = false; p.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      renderP2E();
      return;
    }
    // Real payouts are server-verified — connect a wallet, then withdrawals
    // open once the shared backend is live. (No fake balances are touched.)
    if (!state.player.wallet) { connectWallet(); return; }
    toast('Withdrawals open once the Plumtown backend is live', '');
  }

  // ---------------- SETTINGS SAVE ----------------
  function saveSettings() {
    state.player.name = $('#setName').value.trim() || 'Player';
    state.player.wallet = $('#setWallet').value.trim();
    state.player.settings.autosave = $('#setAutosave').checked;
    state.player.settings.sound = $('#setSound').checked;
    LS.save(state);
    $('.uc-info b').textContent = state.player.name;
    toast('Settings saved', 'success');
  }

  function resetAll() {
    if (!confirm('This will permanently delete ALL progress (Sims, PLUM, quests). Continue?')) return;
    state = LS.reset();
    state.quests = LS.defaultQuests();
    LS.save(state);
    renderOverview();
    renderSimsList($('#simListFull'));
    renderTopbar();
    toast('All progress reset', 'error');
  }

  // ---------------- EVENTS ----------------
  function bind() {
    // sidebar nav
    $$('.side-link').forEach((l) => {
      l.addEventListener('click', (e) => { e.preventDefault(); switchView(l.dataset.view); });
    });
    $$('[data-view]').forEach((l) => {
      if (!l.classList.contains('side-link')) {
        l.addEventListener('click', (e) => { e.preventDefault(); switchView(l.dataset.view); });
      }
    });

    // menu
    $('#menuBtn').addEventListener('click', () => $('#sidebar').classList.toggle('open'));

    // create sim buttons
    ['newSimBtn', 'newSimBtn2', 'newSimBtn3', 'hubCreate'].forEach((id) => {
      const el = $('#' + id);
      if (el) el.addEventListener('click', openSimModal);
    });

    // modal
    $('#closeModal').addEventListener('click', () => $('#simModal').classList.remove('open'));
    $('#cancelSim').addEventListener('click', () => $('#simModal').classList.remove('open'));
    $('#createSim').addEventListener('click', createSimFromForm);
    $('#simModal').addEventListener('click', (e) => { if (e.target.id === 'simModal') $('#simModal').classList.remove('open'); });
    $('#simName').addEventListener('input', updatePreview);
    $('#simAspiration').addEventListener('change', updatePreview);

    // daily
    $('#claimDaily').addEventListener('click', claimDaily);
    // wallet
    $('#withdrawBtn').addEventListener('click', withdraw);
    const tcb = $('#topConnect'); if (tcb) tcb.addEventListener('click', () => { if (state.player.wallet) switchView('wallet'); else connectWallet(); });
    // settings
    $('#saveSettings').addEventListener('click', saveSettings);
    $('#resetAll').addEventListener('click', resetAll);

    // welcome modal
    const ws = $('#welcomeStart'); if (ws) ws.addEventListener('click', () => { closeWelcome(); openSimModal(); });
    const wh = $('#welcomeHow'); if (wh) wh.addEventListener('click', () => { closeWelcome(); switchView('howitworks'); });
    const wcl = $('#welcomeClose'); if (wcl) wcl.addEventListener('click', closeWelcome);
    const wm = $('#welcomeModal'); if (wm) wm.addEventListener('click', (e) => { if (e.target.id === 'welcomeModal') closeWelcome(); });

    // neighbourhood chat
    const cs = $('#chatSend'); if (cs) cs.addEventListener('click', sendChatMsg);
    const ct = $('#chatText'); if (ct) ct.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); sendChatMsg(); } });
  }

  // ---------------- WELCOME / ONBOARDING ----------------
  const WELCOME_KEY = 'lifesim_welcomed';
  function showWelcomeModal() { const wm = $('#welcomeModal'); if (wm) wm.classList.add('open'); }
  function closeWelcome() {
    const wm = $('#welcomeModal'); if (wm) wm.classList.remove('open');
    try { localStorage.setItem(WELCOME_KEY, 'true'); } catch (e) { /* */ }
  }
  function maybeShowWelcome() {
    let seen = false;
    try { seen = !!localStorage.getItem(WELCOME_KEY); } catch (e) { /* */ }
    // Greet first-timers, or any player who hasn't made a Sim yet. Delay a
    // tick so it lands on a clean first paint. Flag is set only on dismiss.
    if (!seen || !(state.sims && state.sims.length)) setTimeout(showWelcomeModal, 350);
  }

  // ---------------- INIT ----------------
  function init() {
    bind();
    renderTopbar();
    renderOverview();
    // deep-link to a view via #hash (e.g. #howto); otherwise greet first-timers
    const hv = (location.hash || '').replace('#', '');
    const views = ['overview', 'howitworks', 'sims', 'wallet', 'quests', 'community', 'settings'];
    if (views.indexOf(hv) >= 0) switchView(hv);
    else maybeShowWelcome();
    // refresh daily timer every second
    setInterval(renderDaily, 1000);
    // keep the shared world in sync if we're signed in to a backend
    if (LS.Cloud && LS.Cloud.isRemote() && LS.Cloud.me()) {
      LS.Cloud.publish(state);
      LS.Cloud.heartbeat();
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();

function escapeHtml(s) {
  const map = {};
  map['&'] = '&' + 'amp;';
  map['<'] = '&' + 'lt;';
  map['>'] = '&' + 'gt;';
  map['"'] = '&' + 'quot;';
  map["'"] = '&' + '#39;';
  return String(s).replace(/[&<>"']/g, (c) => map[c]);
}
