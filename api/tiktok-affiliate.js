const RIOHUB_API_KEY = 'rhk_8b7d99e3b862a221d0cd74fe72c7512ba66636f2d78b0461';
const CREATOR_USERNAME = 'terriyaki21';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function pickFirstProduct(payload) {
  if (!payload) return null;
  if (payload.product && typeof payload.product === 'object') return payload.product;
  if (Array.isArray(payload.products) && payload.products.length) return payload.products[0];
  if (payload.data?.product && typeof payload.data.product === 'object') return payload.data.product;
  if (Array.isArray(payload.data?.products) && payload.data.products.length) return payload.data.products[0];
  return null;
}

function pickAffiliateLink(payload) {
  return (
    payload?.affiliate_link ||
    payload?.data?.affiliate_link ||
    payload?.link ||
    payload?.data?.link ||
    ''
  );
}

function pickProductId(payload) {
  return String(
    payload?.product_id ||
    payload?.data?.product_id ||
    pickFirstProduct(payload)?.id ||
    ''
  );
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  return { response, text, json };
}

async function fetchTikTokLinkData(productUrl) {
  const { response, text, json } = await fetchJson(
    'https://riohub.vn/api/v1/partner/tiktok/affiliate/links',
    {
      method: 'POST',
      headers: {
        'X-Riohub-Api-Key': RIOHUB_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        creator_username: CREATOR_USERNAME,
        product_url: productUrl,
        sub_id: '',
      }),
    }
  );

  if (!response.ok) {
    throw new Error((json && (json.message || json.error)) || `Riohub links loi HTTP ${response.status}`);
  }

  if (!json) {
    throw new Error(`Riohub links khong tra ve JSON. Raw: ${text.slice(0, 160)}`);
  }

  return json;
}

async function tryFetchProducts(productUrl, productId) {
  const candidates = [
    `https://riohub.vn/api/v1/partner/tiktok/affiliate/products?creator_username=${encodeURIComponent(CREATOR_USERNAME)}&product_id=${encodeURIComponent(productId || '')}`,
    `https://riohub.vn/api/v1/partner/tiktok/affiliate/products?creator_username=${encodeURIComponent(CREATOR_USERNAME)}&product_ids=${encodeURIComponent(productId || '')}`,
    `https://riohub.vn/api/v1/partner/tiktok/affiliate/products?creator_username=${encodeURIComponent(CREATOR_USERNAME)}&product_url=${encodeURIComponent(productUrl)}`,
    `https://riohub.vn/api/v1/partner/tiktok/affiliate/products?creator_username=${encodeURIComponent(CREATOR_USERNAME)}&product_urls=${encodeURIComponent(productUrl)}`,
    `https://riohub.vn/api/v1/partner/tiktok/affiliate/products?product_url=${encodeURIComponent(productUrl)}`,
  ].filter(Boolean);

  for (const url of candidates) {
    try {
      const { response, json } = await fetchJson(url, {
        headers: { 'X-Riohub-Api-Key': RIOHUB_API_KEY },
      });
      if (!response.ok || !json) continue;
      const product = pickFirstProduct(json);
      if (product) return product;
    } catch {
      // try next format
    }
  }

  return null;
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const rawBody =
    typeof req.body === 'string'
      ? (() => {
          try { return JSON.parse(req.body); } catch { return {}; }
        })()
      : (req.body || {});

  const productUrl =
    rawBody.product_url ||
    rawBody.url ||
    req.query.product_url ||
    req.query.url ||
    '';

  if (!productUrl) {
    res.status(400).json({ error: { message: 'Thieu product_url' } });
    return;
  }

  try {
    const linkData = await fetchTikTokLinkData(productUrl);
    const affiliateLink = pickAffiliateLink(linkData);
    const productId = pickProductId(linkData);
    const product = pickFirstProduct(linkData) || await tryFetchProducts(productUrl, productId);

    res.status(200).json({
      affiliate_link: affiliateLink,
      product_id: productId,
      product,
      raw: linkData,
    });
  } catch (error) {
    res.status(500).json({
      error: {
        message: error.message || 'Khong lay duoc du lieu TikTok',
      },
    });
  }
}
