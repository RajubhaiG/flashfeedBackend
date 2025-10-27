// backend/routes/news.js
const express = require('express');
const axios = require('axios');
const router = express.Router();

const NEWSAPI_KEY = process.env.NEWSAPI_KEY;
if (!NEWSAPI_KEY) {
  console.warn('NEWSAPI_KEY not set. Set it in .env.');
}

const ALLOWED_CATEGORIES = new Set([
  'business', 'entertainment', 'general', 'health', 'science', 'sports', 'technology', 'politics'
]);

const DEFAULT_COUNTRY = process.env.DEFAULT_COUNTRY || 'in';

// Simple in-memory cache
const cache = new Map();
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

function makeCacheKey({ q, category, country, pageSize, page }) {
  return `q:${q || ''}:cat:${category || ''}:cty:${country || ''}:ps:${pageSize || 10}:p:${page || 1}`;
}

async function fetchFromNewsAPI(url, params) {
  const resp = await axios.get(url, { params, timeout: 10000 });
  return resp.data;
}

router.get('/', async (req, res) => {
  try {
    const userQ = req.query.q;
    const category = req.query.category;
    const country = req.query.country || DEFAULT_COUNTRY;
    // pageSize and page (for pagination)
    const pageSize = Math.min(parseInt(req.query.pageSize) || 12, 100);
    const page = Math.max(parseInt(req.query.page) || 1, 1);

    if (category && !ALLOWED_CATEGORIES.has(category)) {
      return res.status(400).json({ success: false, message: 'Invalid category' });
    }

    const cacheKey = makeCacheKey({ q: userQ, category, country, pageSize, page });
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return res.json({ success: true, totalResults: cached.totalResults, articles: cached.articles, cached: true, page });
    }

    // Build params for top-headlines (preferred when category or country provided)
    let usedTopHeadlines = false;
    let url = '';
    let params = { apiKey: NEWSAPI_KEY, pageSize, page };

    if ((category && category !== 'politics') || country) {
      url = 'https://newsapi.org/v2/top-headlines';
      usedTopHeadlines = true;
      if (category) params.category = category;
      if (country) params.country = country;
      if (userQ) params.q = userQ;
      // Do not force language here to be less strict
    } else {
      url = 'https://newsapi.org/v2/everything';
      params.sortBy = 'publishedAt';
      params.language = 'en';
      if (userQ) params.q = userQ;
      else params.q = 'flash OR breaking OR latest OR breaking-news';
    }

    // First call
    let data = await fetchFromNewsAPI(url, params);
    let articles = (data.articles || []).map(a => ({
      title: a.title,
      description: a.description,
      source: a.source?.name || null,
      url: a.url,
      image: a.urlToImage,
      publishedAt: a.publishedAt,
    }));

    // Fallback: if used top-headlines and got zero results, call everything with a fallback query (biased by country)
    if (usedTopHeadlines && (!articles || articles.length === 0)) {
      const fallbackQ = category && category !== 'general' && category !== 'politics'
        ? category
        : (userQ || 'flash OR breaking OR latest OR breaking-news');

      const fallbackParams = {
        apiKey: NEWSAPI_KEY,
        pageSize,
        page,
        sortBy: 'publishedAt',
        q: fallbackQ,
      };

      if (country && country.toLowerCase() === 'in') {
        fallbackParams.q = `${fallbackParams.q} AND (india OR indian)`;
      }

      const fallbackData = await fetchFromNewsAPI('https://newsapi.org/v2/everything', fallbackParams);
      data = fallbackData;
      articles = (fallbackData.articles || []).map(a => ({
        title: a.title,
        description: a.description,
        source: a.source?.name || null,
        url: a.url,
        image: a.urlToImage,
        publishedAt: a.publishedAt,
      }));
    }

    cache.set(cacheKey, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      articles,
      totalResults: data.totalResults || articles.length,
    });

    res.json({ success: true, totalResults: data.totalResults, articles, cached: false, page });
  } catch (err) {
    console.error('Error fetching news:', err?.response?.data || err.message || err);
    res.status(500).json({ success: false, message: 'Failed to fetch news', error: err?.message });
  }
});

module.exports = router;
