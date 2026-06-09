/**
 * Amazon Ads Dashboard — frontend app
 * All API calls go through the Cloudflare Worker proxy.
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

// ─── Helpers ────────────────────────────────────────────────────────────────

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

// ─── API ─────────────────────────────────────────────────────────────────────

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

async function adsGet(path) {
  const res = await fetch(`${state.proxyUrl}/ads${path}`, {
    headers: {
      Authorization: `Bearer ${state.token}`,
      'Amazon-Advertising-API-ClientId': state.clientId,
      'Amazon-Advertising-API-Scope': state.profileId || '',
      'x-amz-region': state.region,
    },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`${res.status}: ${txt.slice(0, 160)}`);
  }
  return res.json();
}

async function adsPut(path, body) {
  const res = await fetch(`${state.proxyUrl}/ads${path}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${state.token}`,
      'Amazon-Advertising-API-ClientId': state.clientId,
      'Amazon-Advertising-API-Scope': state.profileId || '',
      'x-amz-region': state.region,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`${res.status}: ${txt.slice(0, 160)}`);
  }
  return res.json();
}

// ─── Auth flow ────────────────────────────────────────────────────────────────

async function connectAds() {
  const proxyUrl = document.getElementById('proxy-url').value.trim().replace(/\/$/, '');
  const clientId = document.getElementById('client-id').value.trim();
  const clientSecret = document.getElementById('client-secret').value.trim();
  const refreshToken = document.getElementById('refresh-token').value.trim();
  const region = document.getElementById('region').value;

  if (!proxyUrl || !clientId || !clientSecret || !refreshToken) {
    showAuthError('All fields are required.');
    return;
  }

  document.getElementById('auth-error').style.display = 'none';
  state.proxyUrl = proxyUrl;
  state.clientId = clientId;
  state.region = region;

  setLoading('Exchanging token via proxy...');
  try {
    state.token = await exchangeToken(clientId, clientSecret, refreshToken);
    setLoading('Loading profiles...');
    await loadProfiles();
  } catch (e) {
    showAuthError('Connection failed: ' + e.message);
  }
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

// ─── Tabs ─────────────────────────────────────────────────────────────────────

function showTab(name, btn) {
  ['overview', 'campaigns', 'keywords', 'bids'].forEach(t => {
    document.getElementById('tab-' + t).style.display = t === name ? 'block' : 'none';
  });
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

// ─── Overview ────────────────────────────────────────────────────────────────

async function loadOverview() {
  const ids = ['m-impressions','m-clicks','m-spend','m-sales','m-acos','m-roas','m-ctr','m-cpc'];
  ids.forEach(id => document.getElementById(id).textContent = '…');
  document.getElementById('overview-loading').style.display = 'block';

  try {
    const today = new Date();
    const start = new Date(); start.setDate(today.getDate() - 30);
    const fmt30 = d => d.toISOString().slice(0, 10).replace(/-/g, '');

    const data = await adsGet(
      `/v2/sp/campaigns/report?startDate=${fmt30(start)}&endDate=${fmt30(today)}&metrics=impressions,clicks,cost,attributedSales30d`
    );

    let imp = 0, clk = 0, spend = 0, sales = 0;
    (data.campaigns || data || []).forEach(c => {
      imp   += c.impressions || 0;
      clk   += c.clicks || 0;
      spend += c.cost || 0;
      sales += c.attributedSales30d || 0;
    });

    document.getElementById('m-impressions').textContent = fmt(imp);
    document.getElementById('m-clicks').textContent      = fmt(clk);
    document.getElementById('m-spend').textContent       = fmtUsd(spend);
    document.getElementById('m-sales').textContent       = fmtUsd(sales);
    document.getElementById('m-acos').textContent        = sales > 0 ? fmtPct(spend / sales * 100) : 'N/A';
    document.getElementById('m-roas').textContent        = spend > 0 ? (sales / spend).toFixed(2) + 'x' : 'N/A';
    document.getElementById('m-ctr').textContent         = imp > 0   ? fmtPct(clk / imp * 100) : 'N/A';
    document.getElementById('m-cpc').textContent         = clk > 0   ? fmtUsd(spend / clk) : 'N/A';
  } catch (e) {
    ids.forEach(id => document.getElementById(id).textContent = 'Error');
    console.error('Overview error:', e);
  }

  document.getElementById('overview-loading').style.display = 'none';
}

// ─── Campaigns ───────────────────────────────────────────────────────────────

async function loadCampaigns() {
  document.getElementById('campaigns-body').innerHTML =
    '<tr><td colspan="5" class="loading-row"><span class="spinner sm"></span> Loading…</td></tr>';
  try {
    const data = await adsGet('/v2/sp/campaigns?stateFilter=enabled,paused,archived&count=100');
    state.campaigns = Array.isArray(data) ? data : (data.campaigns || []);
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
    const badge = c.state === 'enabled' ? 'badge-green' : c.state === 'paused' ? 'badge-amber' : 'badge-red';
    const action = c.state === 'enabled' ? 'Pause' : 'Enable';
    return `<tr>
      <td style="font-weight:500;">${escHtml(c.name)}</td>
      <td>${c.campaignType || 'SP'}</td>
      <td><span class="badge ${badge}">${c.state}</span></td>
      <td>${fmtUsd(c.dailyBudget)}/day</td>
      <td><button class="btn-sm" onclick="toggleCampaign('${c.campaignId}','${c.state}')">${action}</button></td>
    </tr>`;
  }).join('');
}

async function toggleCampaign(campaignId, currentState) {
  const newState = currentState === 'enabled' ? 'paused' : 'enabled';
  try {
    await adsPut('/v2/sp/campaigns', [{ campaignId, state: newState }]);
    await loadCampaigns();
  } catch (e) {
    alert('Failed: ' + e.message);
  }
}

// ─── Keywords ────────────────────────────────────────────────────────────────

async function loadKeywords() {
  document.getElementById('keywords-body').innerHTML =
    '<tr><td colspan="5" class="loading-row"><span class="spinner sm"></span> Loading…</td></tr>';
  try {
    const data = await adsGet('/v2/sp/keywords?stateFilter=enabled,paused&count=200');
    state.keywords = Array.isArray(data) ? data : (data.keywords || []);
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
    const badge = k.state === 'enabled' ? 'badge-green' : 'badge-amber';
    return `<tr>
      <td style="font-weight:500;">${escHtml(k.keywordText)}</td>
      <td>${k.matchType}</td>
      <td>${fmtUsd(k.bid)}</td>
      <td><span class="badge ${badge}">${k.state}</span></td>
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
    await adsPut('/v2/sp/keywords', [{ keywordId, bid }]);
    await loadKeywords();
  } catch (e) {
    alert('Failed: ' + e.message);
  }
}

// ─── Bid Manager ─────────────────────────────────────────────────────────────

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
    const newBid = Math.max(0.02, parseFloat((dir === 'increase' ? cur * (1 + pct) : cur * (1 - pct)).toFixed(2)));
    updates.push({ keywordId: cb.dataset.id, bid: newBid });
  });

  if (!updates.length) { alert('Select at least one keyword.'); return; }

  try {
    await adsPut('/v2/sp/keywords', updates);
    updates.forEach(u => {
      const el = document.getElementById('bid-status-' + u.keywordId);
      if (el) el.innerHTML = '<span class="badge badge-green">Saved</span>';
    });
    setTimeout(loadKeywords, 1000);
  } catch (e) {
    alert('Save failed: ' + e.message);
  }
}

// ─── Utils ───────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function loadAllData() {
  loadOverview();
  loadCampaigns();
  loadKeywords();
}
