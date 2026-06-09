/**
 * Amazon Ads Dashboard — frontend app (v3 API)
 */

const state = {
  token: null,
  proxyUrl: '',
  clientId: '',
  region: 'na',
  profileId: null,
  profiles: [],
  campaigns: [],
  keywords: [],
};

function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
function setLoading(msg) {
  document.getElementById('loading-msg').textContent = msg;
  show('screen-loading');
}
function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  el.style.display = 'block';
  el.textContent = msg;
  show('screen-auth');
}
function fmt(n) { return (n || 0).toLocaleString('en-US'); }
function fmtUsd(n) { return '$' + (n || 0).toFixed(2); }
function fmtPct(n) { return n.toFixed(2) + '%'; }
function escHtml(str) {
  return String(str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

async function exchangeToken(clientId, clientSecret, refreshToken) {
  const res = await fetch(`${state.proxyUrl}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) throw new Error(data.error_description || data.error || 'Token exchange failed');
  return data.access_token;
}

function getHeaders() {
  return {
    Authorization: `Bearer ${state.token}`,
    'Amazon-Advertising-API-ClientId': state.clientId,
    'Amazon-Advertising-API-Scope': state.profileId || '',
    'x-amz-region': state.region,
  };
}

async function adsGet(path) {
  const res = await fetch(`${state.proxyUrl}/ads${path}`, { headers: getHeaders() });
  if (!res.ok) { const t = await res.text(); throw new Error(`${res.status}: ${t.slice(0,160)}`); }
  return res.json();
}

async function adsPost(path, body) {
  const res = await fetch(`${state.proxyUrl}/ads${path}`, {
    method: 'POST',
    headers: { ...getHeaders(), 'Content-Type': 'application/vnd.spCampaign.v3+json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) { const t = await res.text(); throw new Error(`${res.status}: ${t.slice(0,160)}`); }
  return res.json();
}

async function adsPut(path, body, contentType) {
  const res = await fetch(`${state.proxyUrl}/ads${path}`, {
    method: 'PUT',
    headers: { ...getHeaders(), 'Content-Type': contentType || 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) { const t = await res.text(); throw new Error(`${res.status}: ${t.slice(0,160)}`); }
  return res.json();
}

async function connectAds() {
  const proxyUrl = document.getElementById('proxy-url').value.trim().replace(/\/$/, '');
  const clientId = document.getElementById('client-id').value.trim();
  const clientSecret = document.getElementById('client-secret').value.trim();
  const refreshToken = document.getElementById('refresh-token').value.trim();
  const region = document.getElementById('region').value;
  if (!proxyUrl || !clientId || !clientSecret || !refreshToken) { showAuthError('All fields are required.'); return; }
  document.getElementById('auth-error').style.display = 'none';
  state.proxyUrl = proxyUrl;
  state.clientId = clientId;
  state.region = region;
  setLoading('Exchanging token via proxy...');
  try {
    state.token = await exchangeToken(clientId, clientSecret, refreshToken);
    setLoading('Loading profiles...');
    await loadProfiles();
  } catch (e) { showAuthError('Connection failed: ' + e.message); }
}

async function loadProfiles() {
  const profiles = await adsGet('/v2/profiles');
  state.profiles = Array.isArray(profiles) ? profiles : [];
  const chips = document.getElementById('profile-chips');
  chips.innerHTML = '';
  state.profiles.forEach((p, i) => {
    const b = document.createElement('button');
    b.className = 'profile-chip' + (i === 0 ? ' selected' : '');
    b.textContent = (p.accountInfo?.name || `Profile ${p.profileId}`) + ` (${p.countryCode})`;
    b.onclick = () => {
      document.querySelectorAll('.profile-chip').forEach(c => c.classList.remove('selected'));
      b.classList.add('selected');
      state.profileId = String(p.profileId);
      loadAllData();
    };
    chips.appendChild(b);
  });
  if (state.profiles.length > 0) state.profileId = String(state.profiles[0].profileId);
  show('screen-main');
  loadAllData();
}

function disconnect() {
  Object.assign(state, { token: null, profileId: null, profiles: [], campaigns: [], keywords: [] });
  show('screen-auth');
}

function showTab(name, btn) {
  ['overview','campaigns','keywords','bids'].forEach(t => {
    document.getElementById('tab-' + t).style.display = t === name ? 'block' : 'none';
  });
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

async function loadOverview() {
  const ids = ['m-impressions','m-clicks','m-spend','m-sales','m-acos','m-roas','m-ctr','m-cpc'];
  ids.forEach(id => document.getElementById(id).textContent = '…');
  document.getElementById('overview-loading').style.display = 'block';
  try {
    const today = new Date();
    const start = new Date(); start.setDate(today.getDate() - 30);
    const fmt30 = d => d.toISOString().slice(0,10);
    const body = {
      startDate: fmt30(start),
      endDate: fmt30(today),
      configuration: {
        adProduct: 'SPONSORED_PRODUCTS',
        groupBy: ['campaign'],
        columns: ['impressions','clicks','cost','purchases30d','sales30d'],
        reportTypeId: 'spCampaigns',
        timeUnit: 'SUMMARY',
        format: 'JSON',
      }
    };
    // Use campaigns list for overview since reporting requires async
    const data = await adsPost('/sp/campaigns/list', {
      stateFilter: { include: ['ENABLED', 'PAUSED'] },
      maxResults: 100,
    });
    const campaigns = data.campaigns || [];
    document.getElementById('m-impressions').textContent = campaigns.length + ' campaigns';
    document.getElementById('m-clicks').textContent = '—';
    document.getElementById('m-spend').textContent = '—';
    document.getElementById('m-sales').textContent = '—';
    document.getElementById('m-acos').textContent = '—';
    document.getElementById('m-roas').textContent = '—';
    document.getElementById('m-ctr').textContent = '—';
    document.getElementById('m-cpc').textContent = '—';
  } catch (e) {
    ids.forEach(id => document.getElementById(id).textContent = 'Error');
    console.error('Overview error:', e);
  }
  document.getElementById('overview-loading').style.display = 'none';
}

async function loadCampaigns() {
  document.getElementById('campaigns-body').innerHTML =
    '<tr><td colspan="5" class="loading-row"><span class="spinner sm"></span> Loading…</td></tr>';
  try {
    const data = await adsPost('/sp/campaigns/list', {
      stateFilter: { include: ['ENABLED', 'PAUSED', 'ARCHIVED'] },
      maxResults: 100,
    });
    state.campaigns = data.campaigns || [];
    renderCampaigns();
  } catch (e) {
    document.getElementById('campaigns-body').innerHTML =
      `<tr><td colspan="5" style="padding:12px;color:var(--danger-text);font-size:13px;">${e.message}</td></tr>`;
  }
}

function renderCampaigns() {
  const tbody = document.getElementById('campaigns-body');
  if (!state.campaigns.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="loading-row">No campaigns found.</td></tr>';
    return;
  }
  tbody.innerHTML = state.campaigns.map(c => {
    const state_val = (c.state || c.extendedData?.state || 'unknown').toLowerCase();
    const badge = state_val === 'enabled' ? 'badge-green' : state_val === 'paused' ? 'badge-amber' : 'badge-red';
    const budget = c.budget?.budget || c.dailyBudget || 0;
    return `<tr>
      <td style="font-weight:500;">${escHtml(c.name)}</td>
      <td>${c.targetingType || 'SP'}</td>
      <td><span class="badge ${badge}">${state_val}</span></td>
      <td>${fmtUsd(budget)}/day</td>
      <td><button class="btn-sm" onclick="toggleCampaign('${c.campaignId}','${state_val}')">${state_val === 'enabled' ? 'Pause' : 'Enable'}</button></td>
    </tr>`;
  }).join('');
}

async function toggleCampaign(campaignId, currentState) {
  const newState = currentState === 'enabled' ? 'PAUSED' : 'ENABLED';
  try {
    await adsPut('/sp/campaigns', { campaigns: [{ campaignId, state: newState }] }, 'application/vnd.spCampaign.v3+json');
    await loadCampaigns();
  } catch (e) { alert('Failed: ' + e.message); }
}

async function loadKeywords() {
  document.getElementById('keywords-body').innerHTML =
    '<tr><td colspan="5" class="loading-row"><span class="spinner sm"></span> Loading…</td></tr>';
  try {
    const data = await adsPost('/sp/keywords/list', {
      stateFilter: { include: ['ENABLED', 'PAUSED'] },
      maxResults: 200,
    });
    state.keywords = data.keywords || [];
    renderKeywords();
    renderBidsTable();
  } catch (e) {
    document.getElementById('keywords-body').innerHTML =
      `<tr><td colspan="5" style="padding:12px;color:var(--danger-text);font-size:13px;">${e.message}</td></tr>`;
  }
}

function renderKeywords() {
  const tbody = document.getElementById('keywords-body');
  if (!state.keywords.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="loading-row">No keywords found.</td></tr>';
    return;
  }
  tbody.innerHTML = state.keywords.map(k => {
    const kstate = (k.state || 'unknown').toLowerCase();
    const badge = kstate === 'enabled' ? 'badge-green' : 'badge-amber';
    return `<tr>
      <td style="font-weight:500;">${escHtml(k.keywordText)}</td>
      <td>${k.matchType || '—'}</td>
      <td>${fmtUsd(k.bid)}</td>
      <td><span class="badge ${badge}">${kstate}</span></td>
      <td><button class="btn-sm" onclick="editBid('${k.keywordId}')">Edit bid</button></td>
    </tr>`;
  }).join('');
}

async function editBid(keywordId) {
  const k = state.keywords.find(kw => String(kw.keywordId) === String(keywordId));
  if (!k) return;
  const input = prompt(`New bid for "${k.keywordText}" (current: $${k.bid}):`, k.bid);
  if (input === null || isNaN(input)) return;
  const bid = Math.max(0.02, parseFloat(parseFloat(input).toFixed(2)));
  try {
    await adsPut('/sp/keywords', { keywords: [{ keywordId, bid }] }, 'application/vnd.spKeyword.v3+json');
    await loadKeywords();
  } catch (e) { alert('Failed: ' + e.message); }
}

function renderBidsTable() {
  const tbody = document.getElementById('bids-body');
  if (!state.keywords.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="loading-row">No keywords loaded.</td></tr>';
    return;
  }
  tbody.innerHTML = state.keywords.map(k => `<tr>
    <td><input type="checkbox" class="kw-check" data-id="${k.keywordId}" data-bid="${k.bid || 0}" /></td>
    <td>${escHtml(k.keywordText)}</td>
    <td>${fmtUsd(k.bid)}</td>
    <td id="new-bid-${k.keywordId}">—</td>
    <td id="bid-status-${k.keywordId}">—</td>
  </tr>`).join('');
}

function toggleAll(cb) {
  document.querySelectorAll('.kw-check').forEach(c => { c.checked = cb.checked; });
  previewBids();
}

function previewBids() {
  const pct = parseFloat(document.getElementById('bid-pct').value) / 100;
  const dir = document.getElementById('bid-dir').value;
  document.querySelectorAll('.kw-check').forEach(cb => {
    const el = document.getElementById('new-bid-' + cb.dataset.id);
    if (!el) return;
    if (!cb.checked) { el.textContent = '—'; return; }
    const cur = parseFloat(cb.dataset.bid);
    const newBid = dir === 'increase' ? cur * (1 + pct) : cur * (1 - pct);
    el.textContent = fmtUsd(Math.max(0.02, newBid));
  });
}

async function saveBids() {
  const pct = parseFloat(document.getElementById('bid-pct').value) / 100;
  const dir = document.getElementById('bid-dir').value;
  const updates = [];
  document.querySelectorAll('.kw-check:checked').forEach(cb => {
    const cur = parseFloat(cb.dataset.bid);
    const newBid = Math.max(0.02, parseFloat((dir === 'increase' ? cur*(1+pct) : cur*(1-pct)).toFixed(2)));
    updates.push({ keywordId: cb.dataset.id, bid: newBid });
  });
  if (!updates.length) { alert('Select at least one keyword.'); return; }
  try {
    await adsPut('/sp/keywords', { keywords: updates }, 'application/vnd.spKeyword.v3+json');
    updates.forEach(u => {
      const el = document.getElementById('bid-status-' + u.keywordId);
      if (el) el.innerHTML = '<span class="badge badge-green">Saved</span>';
    });
    setTimeout(loadKeywords, 1000);
  } catch (e) { alert('Save failed: ' + e.message); }
}

function loadAllData() {
  loadOverview();
  loadCampaigns();
  loadKeywords();
}
