const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36';

function normalizeInputUrl(rawUrl) {
  return String(rawUrl || '')
    .trim()
    .replace(/^https:\/(?!\/)/, 'https://')
    .replace(/^http:\/(?!\/)/, 'http://');
}

function isShopeeShortUrl(rawUrl) {
  try {
    const hostname = new URL(normalizeInputUrl(rawUrl)).hostname.toLowerCase();

    return ['s.shopee.vn', 'shp.ee', 'vn.shp.ee'].includes(hostname);
  } catch {
    return false;
  }
}

function normalizeShopeeProductUrl(rawUrl) {
  try {
    const parsed = new URL(normalizeInputUrl(rawUrl));
    const path = decodeURIComponent(parsed.pathname);

    const match =
      path.match(/\/product\/(\d+)\/(\d+)/) ||
      path.match(/\/[^/]+\/(\d+)\/(\d+)/) ||
      path.match(/-i\.(\d+)\.(\d+)/);

    if (!match) return rawUrl;

    const shopId = match[1];
    const itemId = match[2];

    return `https://shopee.vn/product/${shopId}/${itemId}`;
  } catch {
    return rawUrl;
  }
}

async function expandShortUrl(url) {
  let currentUrl = normalizeInputUrl(url);

  try {
    for (let i = 0; i < 10; i++) {
      const res = await fetch(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        headers: {
          'user-agent': USER_AGENT,
          'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });

      const location = res.headers.get('location');
      if (!location) break;

      currentUrl = new URL(location, currentUrl).href;
    }

    return normalizeShopeeProductUrl(currentUrl);
  } catch {
    return normalizeShopeeProductUrl(currentUrl);
  }
}

async function getProductData(shopeeUrl) {
  const apiUrl = `https://data.addlivetag.com/product-data/product-data.php?url=${encodeURIComponent(shopeeUrl)}`;

  const res = await fetch(apiUrl, {
    headers: {
      'user-agent': USER_AGENT,
      'accept': 'application/json',
    },
  });

  if (!res.ok) throw new Error(`API loi: ${res.status}`);

  return await res.json();
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const rawUrl = Array.isArray(req.query.url) ? req.query.url[0] : req.query.url;

  if (!rawUrl) {
    return res.status(400).json({
      success: false,
      error: 'Thieu tham so url',
    });
  }

  try {
    let fullUrl = normalizeInputUrl(rawUrl);

    if (isShopeeShortUrl(fullUrl)) {
      fullUrl = await expandShortUrl(fullUrl);
    } else {
      fullUrl = normalizeShopeeProductUrl(fullUrl);
    }

    const data = await getProductData(fullUrl);

    const productInfo = data?.productInfo || {};
    const productName = productInfo.productName || '';
    const imageUrl = productInfo.imageUrl || '';
    const productLink = normalizeShopeeProductUrl(productInfo.productLink || fullUrl);

    return res.status(200).json({
      success: true,
      originalUrl: rawUrl,
      fullUrl: productLink,
      resolvedUrl: fullUrl,
      productName,
      imageUrl,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}
