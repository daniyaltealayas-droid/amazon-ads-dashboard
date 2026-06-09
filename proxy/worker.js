/**
 * Amazon Ads API CORS Proxy — Cloudflare Worker
 *
 * Routes:
 *   POST /token          → https://api.amazon.com/auth/o2/token  (token exchange)
 *   ANY  /ads/*          → https://advertising-api*.amazon.com/* (all Ads API calls)
 *
 * Required Worker Secrets (set via `wrangler secret put` or Cloudflare dashboard):
 *   ALLOWED_ORIGIN  — your GitHub Pages URL, e.g. https://yourusername.github.io
 *                     Set to * during development, restrict in production.
 */

const ADS_HOSTS = {
  na: "https://advertising-api.amazon.com",
  eu: "https://advertising-api-eu.amazon.com",
  fe: "https://advertising-api-fe.amazon.com",
};

const TOKEN_URL = "https://api.amazon.com/auth/o2/token";

function corsHeaders(origin, env) {
  const allowed = env.ALLOWED_ORIGIN || "*";
  const allowedOrigin =
    allowed === "*" || origin === allowed ? origin || "*" : allowed;
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type,Authorization,Amazon-Advertising-API-ClientId,Amazon-Advertising-API-Scope,x-amz-region",
    "Access-Control-Max-Age": "86400",
  };
}

function jsonResponse(data, status, origin, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin, env),
    },
  });
}

async function handleToken(request, origin, env) {
  const body = await request.text();
  const upstream = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await upstream.json();
  return jsonResponse(data, upstream.status, origin, env);
}

async function handleAds(request, url, origin, env) {
  const region = request.headers.get("x-amz-region") || "na";
  const host = ADS_HOSTS[region] || ADS_HOSTS.na;

  // Strip /ads prefix, forward the rest
  const adsPath = url.pathname.replace(/^\/ads/, "") + url.search;
  const upstreamUrl = host + adsPath;

  // Forward all relevant headers
  const forwardHeaders = new Headers();
  for (const [key, value] of request.headers.entries()) {
    const lower = key.toLowerCase();
    if (
      lower === "authorization" ||
      lower === "amazon-advertising-api-clientid" ||
      lower === "amazon-advertising-api-scope" ||
      lower === "content-type"
    ) {
      forwardHeaders.set(key, value);
    }
  }

  const body =
    request.method !== "GET" && request.method !== "HEAD"
      ? await request.arrayBuffer()
      : undefined;

  const upstream = await fetch(upstreamUrl, {
    method: request.method,
    headers: forwardHeaders,
    body,
  });

  const responseData = await upstream.text();

  return new Response(responseData, {
    status: upstream.status,
    headers: {
      "Content-Type":
        upstream.headers.get("Content-Type") || "application/json",
      ...corsHeaders(origin, env),
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin, env),
      });
    }

    try {
      if (url.pathname === "/token" && request.method === "POST") {
        return await handleToken(request, origin, env);
      }

      if (url.pathname.startsWith("/ads/")) {
        return await handleAds(request, url, origin, env);
      }

      return jsonResponse({ error: "Not found" }, 404, origin, env);
    } catch (err) {
      return jsonResponse(
        { error: "Proxy error", detail: err.message },
        500,
        origin,
        env
      );
    }
  },
};
