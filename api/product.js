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

function extractShopeeIds(rawUrl) {
  try {
    const parsed = new URL(normalizeInputUrl(rawUrl));
    const path = decodeURIComponent(parsed.pathname);

    const match =
      path.match(/\/product\/(\d+)\/(\d+)/) ||
      path.match(/\/[^/]+\/(\d+)\/(\d+)/) ||
      path.match(/-i\.(\d+)\.(\d+)/);

    if (!match) return { shopId: '', itemId: '' };

    return {
      shopId: String(match[1]),
      itemId: String(match[2]),
    };
  } catch {
    return { shopId: '', itemId: '' };
  }
}

function normalizeShopeeProductUrl(rawUrl) {
  const { shopId, itemId } = extractShopeeIds(rawUrl);
  if (!shopId || !itemId) return rawUrl;

  return `https://shopee.vn/product/${shopId}/${itemId}`;
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

function pickProductInfo(data, resolvedUrl) {
  const source = data?.productInfo || {};
  const ids = extractShopeeIds(source.productLink || resolvedUrl);

  return {
    itemId: source.itemId || ids.itemId,
    shopId: source.shopId || ids.shopId,
    productName: source.productName || '',
    shopName: source.shopName || '',
    price: Number(source.price || 0),
    sales: Number(source.sales || 0),
    imageUrl: source.imageUrl || '',
    rating: source.rating || '0',
    commission: Number(source.commission || 0),
    isXtra: Boolean(source.isXtra),
    hasSellerCommission: Boolean(source.hasSellerCommission),
    hasShopeeCommission: Boolean(source.hasShopeeCommission),
  };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const rawUrl = Array.isArray(req.query.url) ? req.query.url[0] : req.query.url;

  if (!rawUrl) {
    return res.status(400).json({
      status: 'error',
      error: 'Thieu tham so url',
    });
  }

  try {
    let resolvedUrl = normalizeInputUrl(rawUrl);

    if (isShopeeShortUrl(resolvedUrl)) {
      resolvedUrl = await expandShortUrl(resolvedUrl);
    } else {
      resolvedUrl = normalizeShopeeProductUrl(resolvedUrl);
    }

    const data = await getProductData(resolvedUrl);

    return res.status(200).json({
      status: 'success',
      productInfo: pickProductInfo(data, resolvedUrl),
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      error: error.message,
    });
  }
}
