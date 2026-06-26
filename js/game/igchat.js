/* ============================================================
   Plumtown — in-game Neighbourhood Chat
   A floating, collapsible chat widget on the play screen so players
   can talk while they play (not just from the dashboard). Uses the
   same LS.Cloud.sendChat/getChat layer — local demo when offline,
   real cross-player chat once the backend is deployed.
   Self-contained: touches only its own #igChat* elements.
   ============================================================ */
(function () {
  'use strict';
  const LS = window.LifeSim;
  if (!LS || !LS.Cloud || !LS.Cloud.getChat) return;

  const $ = (s) => document.querySelector(s);
  function esc(s) {
    const m = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(s).replace(/[&<>"']/g, (c) => m[c]);
  }
  function ago(t) {
    const s = Math.floor((Date.now() - t) / 1000);
    if (s < 60) return 'now';
    if (s < 3600) return Math.floor(s / 60) + 'm';
    if (s < 86400) return Math.floor(s / 3600) + 'h';
    return Math.floor(s / 86400) + 'd';
  }

  let open = false, lastCount = 0, seenCount = 0;

  async function refresh() {
    let msgs = [];
    try { msgs = await LS.Cloud.getChat(50); } catch (e) { msgs = []; }
    lastCount = msgs.length;
    if (open) { renderLog(msgs); seenCount = lastCount; setDot(false); }
    else if (lastCount > seenCount) setDot(true);
    updateOnline();
  }

  async function updateOnline() {
    const el = $('#igChatOnline'); if (!el) return;
    let players = [];
    try { players = (LS.Cloud.listPlayers ? await LS.Cloud.listPlayers() : []); } catch (e) { players = []; }
    const on = players.filter((p) => p.online).length;
    el.textContent = on ? ' · 🟢 ' + on + ' online' : '';
  }

  function renderLog(msgs) {
    const log = $('#igChatLog'); if (!log) return;
    const myId = (LS.Cloud.me && LS.Cloud.me()) ? LS.Cloud.me().id : null;
    const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 50;
    log.innerHTML = msgs.length
      ? msgs.map((m) => {
          const mine = m.isYou || (myId && m.playerId === myId);
          return '<div class="chat-msg' + (mine ? ' mine' : '') + '">' +
            '<span class="cmsg-name">' + esc(m.name || '?') + '</span>' +
            '<span class="cmsg-text">' + esc(m.text) + '</span>' +
            '<span class="cmsg-time">' + ago(m.at) + '</span></div>';
        }).join('')
      : '<div class="chat-empty">No messages yet — say hi 👋</div>';
    if (atBottom) log.scrollTop = log.scrollHeight;
  }

  function setDot(on) { const d = $('#igChatDot'); if (d) d.hidden = !on; }

  async function send() {
    const inp = $('#igChatText'); if (!inp || !inp.value.trim()) return;
    const t = inp.value; inp.value = '';
    try { await LS.Cloud.sendChat(t); } catch (e) { /* */ }
    refresh();
  }

  function setOpen(v) {
    open = v;
    const panel = $('#igChatPanel'); if (panel) panel.hidden = !v;
    const wrap = $('#igChat'); if (wrap) wrap.classList.toggle('open', v);
    if (v) { setDot(false); refresh(); const i = $('#igChatText'); if (i) i.focus(); }
  }

  function init() {
    const toggle = $('#igChatToggle'); if (!toggle) return;
    toggle.addEventListener('click', () => setOpen(!open));
    const close = $('#igChatClose'); if (close) close.addEventListener('click', () => setOpen(false));
    const sendBtn = $('#igChatSend'); if (sendBtn) sendBtn.addEventListener('click', send);
    const inp = $('#igChatText'); if (inp) inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); send(); }
    });
    setInterval(refresh, 6000); // background poll: keeps panel fresh + flags unread
    refresh();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
