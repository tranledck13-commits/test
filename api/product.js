import { request } from 'undici';

async function expandShortUrl(url) {
  try {
    // Nếu không phải short URL thì trả về luôn
    if (url.includes('shopee.vn/') && !url.includes('s.shopee.vn')) {
      return url;
    }

    const { headers } = await request(url, {
      method: 'GET',
      maxRedirections: 15,
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (headers.location) {
      return new URL(headers.location, url).href;
    }
    return url;
  } catch (err) {
    // Fallback: dùng fetch
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        headers: {
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
        },
      });
      return res.url;
    } catch (e) {
      return url;
    }
  }
}

async function getProductData(shopeeUrl) {
  const apiUrl = `https://data.addlivetag.com/product-data/product-data.php?url=${encodeURIComponent(shopeeUrl)}`;
  
  const res = await fetch(apiUrl, {
    headers: {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
      'accept': 'application/json',
    },
  });

  if (!res.ok) throw new Error(`API lỗi: ${res.status}`);
  
  const data = await res.json();
  return data;
}

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ 
      success: false, 
      error: 'Thiếu tham số url' 
    });
  }

  try {
    // Bước 1: Expand short URL
    let fullUrl = url;
    if (url.includes('s.shopee.vn') || url.includes('shp.ee')) {
      fullUrl = await expandShortUrl(url);
    }

    // Bước 2: Lấy thông tin sản phẩm
    const productData = await getProductData(fullUrl);

    // Bước 3: Trả về kết quả
    return res.status(200).json({
      success: true,
      originalUrl: url,
      fullUrl: fullUrl,
      productName: productData.productName || productData.name || '',
      imageUrl: productData.imageUrl || productData.image || '',
      raw: productData
    });

  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}
