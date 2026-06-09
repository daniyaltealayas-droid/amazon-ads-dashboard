# Amazon Ads Dashboard

A browser-based Amazon Ads dashboard with a Cloudflare Worker CORS proxy. Hosted on GitHub Pages — no backend server required.

---

## Architecture

```
Browser (GitHub Pages)
  └─▶ Cloudflare Worker (CORS proxy)
        └─▶ Amazon Ads API
```

---

## Setup — Step by Step

### 1. Fork / clone this repo

```bash
git clone https://github.com/YOUR_USERNAME/amazon-ads-dashboard.git
cd amazon-ads-dashboard
```

### 2. Deploy the Cloudflare Worker proxy

You need a free [Cloudflare account](https://dash.cloudflare.com/sign-up).

```bash
cd proxy
npm install -g wrangler          # install Wrangler CLI
wrangler login                   # authenticate with Cloudflare
wrangler deploy                  # deploy the Worker
```

After deploy, Wrangler prints your Worker URL:
```
https://amazon-ads-proxy.<your-subdomain>.workers.dev
```

**Restrict the allowed origin** (recommended before sharing):
```bash
wrangler secret put ALLOWED_ORIGIN
# Enter: https://YOUR_USERNAME.github.io
```

### 3. Enable GitHub Pages

1. Go to your repo → **Settings** → **Pages**
2. Under **Source**, select **GitHub Actions**
3. Push to `main` — the workflow deploys `frontend/` automatically

Your app will be live at:
```
https://YOUR_USERNAME.github.io/amazon-ads-dashboard/
```

### 4. Open the app

1. Visit your GitHub Pages URL
2. Enter your **Cloudflare Worker URL** (from step 2)
3. Enter your Amazon Ads **Client ID**, **Client Secret**, **Refresh Token**
4. Select your region and click **Connect**

---

## Amazon Ads API Credentials

To get your credentials:

1. Go to [Amazon Ads Developer Console](https://advertising.amazon.com/API/docs/en-us/get-started/create-application)
2. Create an application → note your **Client ID** and **Client Secret**
3. Complete OAuth flow to get a **Refresh Token**
   - Scopes needed: `advertising::campaign_management`

---

## Project Structure

```
├── frontend/
│   ├── index.html       # Main app UI
│   ├── style.css        # Styles (light + dark mode)
│   └── app.js           # All API + UI logic
├── proxy/
│   ├── worker.js        # Cloudflare Worker (CORS proxy)
│   └── wrangler.toml    # Wrangler config
└── .github/
    └── workflows/
        └── deploy.yml   # GitHub Actions → GitHub Pages
```

---

## Features

| Tab | What it does |
|-----|-------------|
| Overview | Last 30-day aggregate: impressions, clicks, spend, sales, ACOS, ROAS, CTR, CPC |
| Campaigns | List all SP campaigns, enable/pause toggle |
| Keywords | All keywords with match type, current bid, inline bid editing |
| Bid Manager | Bulk-select keywords and apply % increase/decrease |

---

## Security Notes

- Credentials are **never stored** — they live only in your browser's memory for the session
- The Worker only proxies requests; it never logs or stores tokens
- Set `ALLOWED_ORIGIN` to your GitHub Pages URL to prevent other sites from using your proxy
- For production use, consider adding token caching in a Cloudflare KV namespace

---

## License

MIT
