// Simple in-memory cache for YouTube API responses to reduce quota usage
const youtubeCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

/**
 * Get cached YouTube search results
 * @param {string} cacheKey - Unique key for the search query
 * @returns {Object|null} Cached results or null if not found/expired
 */
function getFromCache(cacheKey) {
  const cachedItem = youtubeCache.get(cacheKey);
  if (!cachedItem) return null;

  // Check if cache entry has expired
  if (Date.now() - cachedItem.timestamp > CACHE_TTL) {
    youtubeCache.delete(cacheKey);
    return null;
  }

  return cachedItem.data;
}

/**
 * Store YouTube search results in cache
 * @param {string} cacheKey - Unique key for the search query
 * @param {Object} data - YouTube API response data
 */
function saveToCache(cacheKey, data) {
  youtubeCache.set(cacheKey, {
    data,
    timestamp: Date.now()
  });
}

/**
 * Clear expired cache entries
 * Should be called periodically to prevent memory leaks
 */
function cleanupCache() {
  const now = Date.now();
  for (const [key, value] of youtubeCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      youtubeCache.delete(key);
    }
  }
}

/**
 * Generate a cache key for YouTube search
 * @param {string} query - Search query
 * @param {string} type - Search type (video, playlist, etc.)
 * @returns {string} Unique cache key
 */
function generateCacheKey(query, type) {
  return `${type}:${encodeURIComponent(query.toLowerCase().trim())}`;
}

// Cleanup cache every hour
setInterval(cleanupCache, 60 * 60 * 1000);

module.exports = {
  getFromCache,
  saveToCache,
  generateCacheKey
};