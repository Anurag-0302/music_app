const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const session = require('express-session');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const SpotifyWebApi = require('spotify-web-api-node');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'shared_pages');
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const SPOTIFY_REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI;
const SESSION_SECRET = process.env.SESSION_SECRET;

// For Vercel/deployment, use in-memory storage
let importedTracks = [];
let sharedPages = {}; // In-memory storage for shared pages

// Security middleware with CSP for blob URLs and external resources
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://www.youtube.com", "https://s.ytimg.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      styleSrcElem: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "blob:", "https:", "https://i.ytimg.com", "https://img.youtube.com"],
      mediaSrc: ["'self'", "blob:", "https:"],
      connectSrc: ["'self'", "https:", "blob:", "https://www.googleapis.com", "https://www.youtube.com"],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      frameSrc: ["'self'", "https://www.youtube.com", "https://open.spotify.com"],
      workerSrc: ["'self'", "blob:"],
      childSrc: ["'self'", "blob:"]
    }
  }
}));
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'https://vibecraft-theta.vercel.app'],
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname));

// Session middleware - simplified for Vercel compatibility
app.use(session({
  secret: SESSION_SECRET || 'fallback-secret-key-for-development',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Vercel doesn't support secure cookies properly
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Serve static files
app.use(express.static(__dirname));

// Serve main index.html for root route
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// CORS handling for browser extension (specific origins only)
app.use((req, res, next) => {
  const origin = req.headers.origin;

  // Allow specific origins: localhost for local development, Vercel domains, and chrome-extension for the browser helper
  const allowedOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://vibecraft-theta.vercel.app',
    'https://vibecraft-stackup4.vercel.app'
  ];

  // Allow chrome-extension origins (for the browser helper)
  if (origin && origin.startsWith('chrome-extension://')) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  } else if (allowedOrigins.includes(origin) || !origin) {
    // Allow if origin is in allowed list or if no origin (like same-origin requests)
    if (origin) {
      res.header('Access-Control-Allow-Origin', origin);
    }
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  next();
});

// Serve static files
app.use(express.static(__dirname));

// Serve main index.html for root route
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Serve share.html for all /share/:pageId routes
app.get('/share/:pageId', (_req, res) => {
  res.sendFile(path.join(__dirname, 'share.html'));
});

// Create a shared page
app.post('/api/pages', (req, res) => {
  try {
    const { title, description, playlist } = req.body;
    const pageId = crypto.randomBytes(8).toString('hex');
    const pageData = {
      id: pageId,
      title: title || 'Untitled Playlist',
      description: description || '',
      playlist: playlist || [],
      createdAt: new Date().toISOString(),
      views: 0,
    };

    // Store in memory for Vercel
    sharedPages[pageId] = pageData;

    res.json({
      success: true,
      pageId: pageId,
      url: `${req.protocol}://${req.get('host')}/share/${pageId}`,
    });
  } catch (error) {
    console.error('Error creating page:', error);
    res.status(500).json({ error: 'Failed to create shareable page' });
  }
});

// Get a shared page
app.get('/api/pages/:pageId', (_req, res) => {
  try {
    const { pageId } = req.params;
    
    const pageData = sharedPages[pageId];
    
    if (!pageData) {
      return res.status(404).json({ error: 'Page not found' });
    }

    // Increment view count
    pageData.views = (pageData.views || 0) + 1;
    sharedPages[pageId] = pageData;

    res.json(pageData);
  } catch (error) {
    console.error('Error retrieving page:', error);
    res.status(500).json({ error: 'Failed to retrieve page' });
  }
});

// Delete a shared page (optional, for cleanup)
app.delete('/api/pages/:pageId', (req, res) => {
  try {
    const { pageId } = req.params;
    
    if (sharedPages[pageId]) {
      delete sharedPages[pageId];
      res.json({ success: true, message: 'Page deleted' });
    } else {
      res.status(404).json({ error: 'Page not found' });
    }
  } catch (error) {
    console.error('Error deleting page:', error);
    res.status(500).json({ error: 'Failed to delete page' });
  }
});

// Spotify OAuth routes
app.get('/spotify/login', (req, res) => {
  // Generate a random state string for security
  const state = crypto.randomBytes(16).toString('hex');
  req.session.spotifyAuthState = state;

  // Create the authorization URL
  const scopes = [
    'user-read-private',
    'user-read-email',
    'playlist-read-private',
    'playlist-read-collaborative'
  ];

  const authorizeURL = spotifyApi.createAuthorizeURL(scopes, state);
  res.redirect(authorizeURL);
});

app.get('/spotify/callback', (req, res) => {
  const { code, state } = req.query;
  const storedState = req.session.spotifyAuthState;

  // Verify state to prevent CSRF attacks
  if (state === null || state !== storedState) {
    return res.status(400).send('State mismatch: Potential CSRF attack');
  }

  // Clear the state from session
  req.session.spotifyAuthState = null;

  // Exchange authorization code for access token
  spotifyApi.authorizationCodeGrant(code)
    .then(data => {
      // Save the access and refresh tokens
      spotifyApi.setAccessToken(data.body['access_token']);
      spotifyApi.setRefreshToken(data.body['refresh_token']);

      // Save tokens to session
      req.session.spotifyAccessToken = data.body['access_token'];
      req.session.spotifyRefreshToken = data.body['refresh_token'];
      req.session.spotifyExpiresIn = data.body['expires_in'];

      // Redirect back to the frontend
      res.redirect('http://localhost:3000/?spotify_connected=true');
    })
    .catch(error => {
      console.error('Error getting Spotify access token:', error);
      res.redirect('http://localhost:3000/?spotify_error=true');
    });
});

// Token refresh middleware
const refreshSpotifyToken = async (req, res, next) => {
  // If no refresh token in session, user needs to re-authenticate
  if (!req.session.spotifyRefreshToken) {
    return res.status(401).json({ error: 'Not authenticated with Spotify' });
  }

  // Set the refresh token
  spotifyApi.setRefreshToken(req.session.spotifyRefreshToken);

  try {
    // Try to refresh the access token
    const data = await spotifyApi.refreshAccessToken();

    // Save the new access token to session
    const accessToken = data.body['access_token'];
    req.session.spotifyAccessToken = accessToken;
    spotifyApi.setAccessToken(accessToken);

    // Update expires_in if provided
    if (data.body['expires_in']) {
      req.session.spotifyExpiresIn = data.body['expires_in'];
    }

    next();
  } catch (error) {
    console.error('Error refreshing Spotify access token:', error);
    // Clear session and force re-authentication
    req.session.spotifyAccessToken = null;
    req.session.spotifyRefreshToken = null;
    req.session.spotifyExpiresIn = null;
    return res.status(401).json({ error: 'Failed to refresh Spotify token' });
  }
};

// Spotify auth status endpoint
app.get('/api/spotify/status', (req, res) => {
  const isAuthenticated = !!req.session.spotifyAccessToken;
  res.json({ authenticated: isAuthenticated });
});

// Get Spotify playlist tracks endpoint
app.get('/api/spotify/playlist-tracks', refreshSpotifyToken, async (req, res) => {
  try {
    const { playlistId } = req.query;

    if (!playlistId) {
      return res.status(400).json({ error: 'Playlist ID is required' });
    }

    // Get playlist tracks
    const data = await spotifyApi.getPlaylistTracks(playlistId, {
      limit: 100,
      offset: 0
    });

    const tracks = data.body.items
      .filter(item => item.track) // Filter out any null tracks
      .map(item => ({
        id: item.track.id,
        name: item.track.name,
        artists: item.track.artists.map(artist => artist.name).join(', '),
        duration_ms: item.track.duration_ms,
        uri: item.track.uri,
        thumbnail: item.track.album.images[0]?.url || null
      }));

    res.json({ tracks });
  } catch (error) {
    console.error('Error fetching Spotify playlist tracks:', error);
    res.status(500).json({ error: 'Failed to fetch Spotify playlist tracks' });
  }
});

// YouTube search endpoint
app.post('/api/youtube/search', async (req, res) => {
  try {
    const { title, artist, searchType } = req.body;

    console.log('YouTube search request:', { title, artist, searchType });

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    if (!YOUTUBE_API_KEY) {
      console.log('YouTube API key not configured');
      return res.status(500).json({ error: 'YouTube API key not configured' });
    }

    // Determine if this is a playlist search or track search
    const isPlaylistSearch = searchType === 'playlist' ||
                           title.toLowerCase().includes('playlist') ||
                           title.toLowerCase().includes('album') ||
                           title.toLowerCase().includes('full album') ||
                           !artist;

    // Construct search query for best results
    let searchQuery;
    let actualSearchType = 'video';

    if (isPlaylistSearch) {
      // For playlists, search for playlist type
      searchQuery = title.replace(' playlist', '').replace('full album', '').replace('album', '').trim();
      actualSearchType = 'playlist';
    } else {
      // For tracks, search for video with artist and audio keywords
      searchQuery = `${title} ${artist} official audio`;
    }

    console.log('Search query:', searchQuery, 'Type:', actualSearchType);

    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=${actualSearchType}&q=${encodeURIComponent(searchQuery)}&maxResults=10&key=${YOUTUBE_API_KEY}`;

    const response = await fetch(searchUrl);
    console.log('YouTube API response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.log('YouTube API error response:', errorText);
      throw new Error(`YouTube API error: ${response.status}`);
    }

    const data = await response.json();
    console.log('YouTube API results count:', data.items ? data.items.length : 0);

    if (!data.items || data.items.length === 0) {
      console.log('No results found for query:', searchQuery);

      // If playlist search fails, try fallback to video search
      if (isPlaylistSearch) {
        console.log('Playlist search failed, trying video search as fallback');
        const fallbackQuery = searchQuery + ' full album';
        const fallbackUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(fallbackQuery)}&maxResults=5&key=${YOUTUBE_API_KEY}`;

        const fallbackResponse = await fetch(fallbackUrl);
        if (fallbackResponse.ok) {
          const fallbackData = await fallbackResponse.json();
          if (fallbackData.items && fallbackData.items.length > 0) {
            const bestMatch = findBestYouTubeMatch(fallbackData.items, searchQuery, '');
            if (bestMatch) {
              console.log('Found fallback video match');
              res.json({ videoId: bestMatch.id.videoId, title: bestMatch.snippet.title, isPlaylist: false });
              return;
            }
          }
        }
      }

      res.json({ videoId: null, message: 'No results found' });
      return;
    }

    // If it's a playlist, return the playlist ID
    if (actualSearchType === 'playlist' && data.items[0].id.kind === 'youtube#playlist') {
      const playlistId = data.items[0].id.playlistId;
      console.log('Found YouTube playlist:', playlistId);
      res.json({ videoId: playlistId, title: data.items[0].snippet.title, isPlaylist: true });
    } else {
      // Smart matching algorithm to find the best video
      const bestMatch = findBestYouTubeMatch(data.items, title, artist);

      if (bestMatch) {
        console.log('Found best match:', bestMatch.snippet.title);
        res.json({ videoId: bestMatch.id.videoId, title: bestMatch.snippet.title, isPlaylist: false });
      } else {
        console.log('No suitable match found after filtering');
        res.json({ videoId: null, message: 'No suitable match found' });
      }
    }
  } catch (error) {
    console.error('YouTube search error:', error);
    res.status(500).json({ error: 'Failed to search YouTube' });
  }
});

// ==========================================
// SONG LIST IMPORT ENDPOINT
// ==========================================

// YouTube playlist import endpoint
app.post('/api/import-youtube-playlist', async (req, res) => {
  try {
    const { playlistId } = req.body;
    
    if (!playlistId) {
      return res.status(400).json({ error: 'Playlist ID is required' });
    }

    if (!YOUTUBE_API_KEY) {
      return res.status(500).json({ error: 'YouTube API key not configured' });
    }

    console.log('[YouTube] Importing playlist:', playlistId);
    
    // Fetch playlist items from YouTube API
    const playlistUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${playlistId}&maxResults=50&key=${YOUTUBE_API_KEY}`;
    
    const response = await fetch(playlistUrl);
    
    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('YouTube API quota exhausted or playlist is private');
      }
      throw new Error(`YouTube API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.items || data.items.length === 0) {
      throw new Error('No videos found in this playlist or playlist is private');
    }
    
    console.log('[YouTube] Found', data.items.length, 'videos in playlist');
    
    // Extract video information
    const tracks = data.items.map(item => {
      const snippet = item.snippet;
      return {
        id: generateId(),
        type: 'youtube',
        title: snippet.title,
        artist: snippet.channelTitle || 'YouTube',
        duration: '--:--',
        thumbnail: snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url,
        videoId: snippet.resourceId?.videoId,
        audioUrl: null,
      };
    });
    
    // Store imported tracks (in-memory for Vercel compatibility)
    importedTracks.push(...tracks);

    console.log('[YouTube] Successfully imported', tracks.length, 'tracks');
    
    res.json({
      success: true,
      tracks: tracks,
      summary: {
        total: tracks.length,
        playlistId: playlistId
      }
    });
    
  } catch (error) {
    console.error('[YouTube] Playlist import error:', error);
    res.status(500).json({ error: error.message || 'Failed to import YouTube playlist' });
  }
});
function extractPlaylistId(url) {
  const match = url.match(/playlist\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

// Clean and normalize artist names
function cleanArtistName(artistString) {
  if (!artistString) return '';
  
  const unwantedPatterns = [
    /,\s*feat\.\s*/gi,
    /,\s*featuring\s*/gi,
    /,\s*with\s*/gi,
    /,\s*×\s*/gi,
    /\(\s*feat\.\s*[^)]+\)/gi,
    /\(\s*featuring\s*[^)]+\)/gi,
  ];
  
  let cleaned = artistString;
  unwantedPatterns.forEach(pattern => {
    cleaned = cleaned.replace(pattern, ', ');
  });
  
  cleaned = cleaned.replace(/,\s*,/g, ',').replace(/\s+/g, ' ').trim();
  
  return cleaned;
}

// Clean song title
function cleanSongTitle(title) {
  if (!title) return '';
  
  const unwantedPatterns = [
    /\s*-\s*Single/i,
    /\s*-\s*Version/i,
    /\s*-\s*Remastered/i,
    /\s*-\s*Remaster/i,
    /\s*\(\s*Remastered\s*\)/i,
    /\s*\(\s*Remaster\s*\)/i,
  ];
  
  let cleaned = title;
  unwantedPatterns.forEach(pattern => {
    cleaned = cleaned.replace(pattern, '');
  });
  
  return cleaned.trim();
}

// Import Spotify playlist from URL (server-side)
app.post('/api/import-spotify-playlist', async (req, res) => {
  try {
    const { playlistUrl } = req.body;
    
    if (!playlistUrl) {
      return res.status(400).json({ error: 'Playlist URL is required' });
    }

    console.log('[Spotify] Importing playlist from URL:', playlistUrl);
    
    const playlistId = extractPlaylistId(playlistUrl);
    if (!playlistId) {
      return res.status(400).json({ error: 'Invalid Spotify playlist URL' });
    }
    
    console.log('[Spotify] Extracted playlist ID:', playlistId);
    
    // Try multiple methods to fetch playlist data
    let tracks = [];
    
    // Method 1: Try Spotify embed page
    try {
      console.log('[Spotify] Method 1: Trying embed page');
      const embedTracks = await fetchFromEmbedPage(playlistId);
      if (embedTracks && embedTracks.length > 0) {
        tracks = embedTracks;
        console.log('[Spotify] Method 1 successful:', tracks.length, 'tracks');
      }
    } catch (error) {
      console.log('[Spotify] Method 1 failed:', error.message);
    }
    
    // Method 2: Try Spotify oEmbed API
    if (tracks.length === 0) {
      try {
        console.log('[Spotify] Method 2: Trying oEmbed API');
        const oembedTracks = await fetchFromOEmbed(playlistId);
        if (oembedTracks && oembedTracks.length > 0) {
          tracks = oembedTracks;
          console.log('[Spotify] Method 2 successful:', tracks.length, 'tracks');
        }
      } catch (error) {
        console.log('[Spotify] Method 2 failed:', error.message);
      }
    }
    
    // Method 3: Try Spotify Open Graph data
    if (tracks.length === 0) {
      try {
        console.log('[Spotify] Method 3: Trying Open Graph data');
        const ogTracks = await fetchFromOpenGraph(playlistId);
        if (ogTracks && ogTracks.length > 0) {
          tracks = ogTracks;
          console.log('[Spotify] Method 3 successful:', tracks.length, 'tracks');
        }
      } catch (error) {
        console.log('[Spotify] Method 3 failed:', error.message);
      }
    }
    
    if (tracks.length === 0) {
      throw new Error('Could not extract track data from Spotify. The playlist might be private or Spotify changed their page structure.');
    }
    
    console.log('[Spotify] Total unique tracks extracted:', tracks.length);
    
    res.json({
      success: true,
      tracks: tracks,
      summary: {
        total: tracks.length,
        playlistId: playlistId
      }
    });
    
  } catch (error) {
    console.error('[Spotify] Playlist import error:', error);
    res.status(500).json({ error: error.message || 'Failed to import Spotify playlist' });
  }
});

// Method 1: Fetch from Spotify embed page
async function fetchFromEmbedPage(playlistId) {
  const embedUrl = `https://open.spotify.com/embed/playlist/${playlistId}`;
  console.log('[Spotify] Fetching embed page:', embedUrl);
  
  const response = await fetch(embedUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch Spotify embed page: ${response.status}`);
  }
  
  const html = await response.text();
  console.log('[Spotify] Embed page HTML length:', html.length);
  
  // Try multiple patterns to find JSON data
  const patterns = [
    /<script id="initial-state" type="text\/javascript">(.+?)<\/script>/,
    /<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/,
    /window\.__INITIAL_STATE__\s*=\s*({.+?});/,
    /<script type="application\/json" id="__NEXT_DATA__">(.+?)<\/script>/
  ];
  
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      console.log('[Spotify] Found JSON data with pattern:', pattern.toString().substring(0, 50));
      try {
        const jsonData = JSON.parse(match[1]);
        const tracks = parseSpotifyJSON(jsonData);
        if (tracks.length > 0) {
          return tracks;
        }
      } catch (error) {
        console.log('[Spotify] Failed to parse JSON with this pattern:', error.message);
      }
    }
  }
  
  throw new Error('Could not find track data in Spotify embed page');
}

// Method 2: Try Spotify oEmbed API
async function fetchFromOEmbed(playlistId) {
  const oembedUrl = `https://open.spotify.com/oembed?url=https://open.spotify.com/playlist/${playlistId}`;
  console.log('[Spotify] Fetching oEmbed:', oembedUrl);
  
  const response = await fetch(oembedUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch Spotify oEmbed: ${response.status}`);
  }
  
  const data = await response.json();
  console.log('[Spotify] oEmbed data keys:', Object.keys(data));
  
  // oEmbed might not contain track data, but let's try to extract any useful info
  if (data.title) {
    console.log('[Spotify] Playlist title from oEmbed:', data.title);
  }
  
  // oEmbed typically doesn't have track data, so this method usually won't work
  throw new Error('oEmbed does not contain track data');
}

// Method 3: Try Spotify Open Graph data
async function fetchFromOpenGraph(playlistId) {
  const pageUrl = `https://open.spotify.com/playlist/${playlistId}`;
  console.log('[Spotify] Fetching main page for Open Graph:', pageUrl);
  
  const response = await fetch(pageUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch Spotify page: ${response.status}`);
  }
  
  const html = await response.text();
  console.log('[Spotify] Main page HTML length:', html.length);
  
  // Try the same JSON patterns on the main page
  const patterns = [
    /<script id="initial-state" type="text\/javascript">(.+?)<\/script>/,
    /<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/,
    /window\.__INITIAL_STATE__\s*=\s*({.+?});/,
    /<script type="application\/json" id="__NEXT_DATA__">(.+?)<\/script>/
  ];
  
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      console.log('[Spotify] Found JSON data in main page with pattern:', pattern.toString().substring(0, 50));
      try {
        const jsonData = JSON.parse(match[1]);
        const tracks = parseSpotifyJSON(jsonData);
        if (tracks.length > 0) {
          return tracks;
        }
      } catch (error) {
        console.log('[Spotify] Failed to parse JSON from main page:', error.message);
      }
    }
  }
  
  throw new Error('Could not find track data in Spotify main page');
}

// Parse Spotify JSON data (common function for all methods)
function parseSpotifyJSON(jsonData) {
  const tracks = [];
  
  // Try different paths to find track data
  let trackData = null;
  
  const possiblePaths = [
    jsonData?.entities?.items,
    jsonData?.data?.playlistV2?.content?.items,
    jsonData?.playlistV2?.content?.items,
    jsonData?.page?.data?.playlistV2?.content?.items,
    jsonData?.props?.pageProps?.state?.data?.playlistV2?.content?.items,
    jsonData?.props?.initialProps?.pageProps?.state?.data?.playlistV2?.content?.items
  ];
  
  for (const path of possiblePaths) {
    if (path && path.length > 0) {
      console.log('[Spotify] Found track data at path:', path.length, 'items');
      trackData = path;
      break;
    }
  }
  
  if (!trackData) {
    console.log('[Spotify] No track data found in any known path');
    return [];
  }
  
  console.log('[Spotify] Processing', trackData.length, 'track items');
  
  trackData.forEach((item, index) => {
    try {
      let track = item?.item?.track || item?.track || item;
      
      if (track) {
        const title = track?.name || track?.title || '';
        const artists = track?.artists || track?.artist || track?.artistsItems;
        
        let artistName = '';
        if (Array.isArray(artists)) {
          artistName = artists.map(a => a?.name || a?.profile?.name).join(', ');
        } else if (artists?.name) {
          artistName = artists.name;
        } else if (typeof artists === 'string') {
          artistName = artists;
        }
        
        if (title) {
          tracks.push({
            title: cleanSongTitle(title),
            artist: cleanArtistName(artistName)
          });
        }
      }
    } catch (error) {
      console.error('[Spotify] Error parsing track', index, ':', error);
    }
  });
  
  // Remove duplicates
  const uniqueTracks = [];
  const seen = new Set();
  
  tracks.forEach(track => {
    const key = `${track.title.toLowerCase().trim()}-${track.artist.toLowerCase().trim()}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueTracks.push(track);
    }
  });
  
  return uniqueTracks;
}
app.post('/api/import-song-list', async (req, res) => {
  try {
    const { playlistId } = req.body;

    // If playlistId is provided, fetch from Spotify API
    if (playlistId) {
      // Check if authenticated with Spotify
      if (!req.session.spotifyAccessToken) {
        return res.status(401).json({ error: 'Not authenticated with Spotify' });
      }

      // Set access token
      spotifyApi.setAccessToken(req.session.spotifyAccessToken);

      try {
        // Get playlist tracks from Spotify
        const data = await spotifyApi.getPlaylistTracks(playlistId, {
          limit: 100,
          offset: 0
        });

        const songs = data.body.items
          .filter(item => item.track) // Filter out any null tracks
          .map(item => ({
            title: item.track.name,
            artist: item.track.artists.map(artist => artist.name).join(', ')
          }));

        console.log(`Processing ${songs.length} songs from Spotify playlist`);

        // Process each song through YouTube matching
        const results = [];
        let successCount = 0;
        let failureCount = 0;
        const importedTracks = [];

        for (let i = 0; i < songs.length; i++) {
          const song = songs[i];
          const { title, artist } = song;

          if (!title) {
            results.push({
              title: title || 'Unknown',
              artist: artist || 'Unknown',
              success: false,
              error: 'Missing title'
            });
            failureCount++;
            continue;
          }

          try {
            console.log(`Searching YouTube for: ${title} - ${artist}`);

            const searchQuery = artist ? `${title} ${artist} official` : `${title} official`;

            // Try to get from cache first
            const cacheKey = youtubeCache.generateCacheKey(searchQuery, 'video');
            let data = youtubeCache.getFromCache(cacheKey);

            // If not in cache, fetch from YouTube API
            if (!data) {
              const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(searchQuery)}&maxResults=5&key=${YOUTUBE_API_KEY}`;
              const response = await fetch(searchUrl);

              if (!response.ok) {
                if (response.status === 429) {
                  console.error('YouTube API quota exhausted (429)');
                  throw new Error('YouTube API quota exhausted. Please try again later.');
                }
                throw new Error(`YouTube API error: ${response.status}`);
              }

              data = await response.json();
              // Cache the successful response
              youtubeCache.saveToCache(cacheKey, data);
            }

            if (!data.items || data.items.length === 0) {
              results.push({
                title,
                artist: artist || 'Unknown',
                success: false,
                error: 'No YouTube results found'
              });
              failureCount++;
              continue;
            }

            // Use smart matching to find best result
            const bestMatch = findBestYouTubeMatch(data.items, title, artist || '');

            if (bestMatch) {
              const trackData = {
                id: crypto.randomBytes(16).toString('hex'),
                type: 'youtube',
                title,
                artist: artist || 'Unknown',
                duration: '--:--',
                thumbnail: bestMatch.snippet.thumbnails?.medium?.url || bestMatch.snippet.thumbnails?.default?.url,
                videoId: bestMatch.id.videoId,
                audioUrl: null,
              };

              importedTracks.push(trackData);

              results.push({
                title,
                artist: artist || 'Unknown',
                success: true,
                videoId: bestMatch.id.videoId,
                youtubeTitle: bestMatch.snippet.title,
                thumbnail: bestMatch.snippet.thumbnails?.medium?.url || bestMatch.snippet.thumbnails?.default?.url
              });
              successCount++;
            } else {
              results.push({
                title,
                artist: artist || 'Unknown',
                success: false,
                error: 'No suitable match found'
              });
              failureCount++;
            }
          } catch (error) {
            console.error(`Error processing song "${title}":`, error);

            // If quota exhausted, stop immediately
            if (error.message.includes('429') || error.message.includes('quota')) {
              results.push({
                title,
                artist: artist || 'Unknown',
                success: false,
                error: error.message
              });
              failureCount++;

              // Return immediately with quota error
              return res.status(429).json({
                error: 'YouTube API quota exhausted',
                results,
                summary: {
                  total: songs.length,
                  successful: successCount,
                  failed: failureCount,
                  pending: songs.length - i - 1
                }
              });
            }

            results.push({
              title,
              artist: artist || 'Unknown',
              success: false,
              error: error.message
            });
            failureCount++;
          }
        }

        console.log(`Import complete: ${successCount} successful, ${failureCount} failed`);

        // Store imported tracks (in-memory for Vercel compatibility)
        importedTracks.push(...importedTracks);

        res.json({
          results,
          summary: {
            total: songs.length,
            successful: successCount,
            failed: failureCount
          },
          importedTracks // Return track data for frontend
        });

        return; // Exit early since we handled Spotify playlist case
      } catch (error) {
        console.error('Error fetching Spotify playlist:', error);
        return res.status(500).json({ error: 'Failed to fetch Spotify playlist' });
      }
    }

    // Original functionality for manual song list input
    const { songs } = req.body;

    if (!songs || !Array.isArray(songs) || songs.length === 0) {
      return res.status(400).json({ error: 'Songs array is required' });
    }

    if (!YOUTUBE_API_KEY) {
      return res.status(500).json({ error: 'YouTube API key not configured' });
    }

    console.log(`Processing ${songs.length} songs for import`);

    const results = [];
    let successCount = 0;
    let failureCount = 0;
    const importedTracks = [];

    for (let i = 0; i < songs.length; i++) {
      const song = songs[i];
      const { title, artist } = song;

      if (!title) {
        results.push({
          title: title || 'Unknown',
          artist: artist || 'Unknown',
          success: false,
          error: 'Missing title'
        });
        failureCount++;
        continue;
      }

      try {
        console.log(`Searching YouTube for: ${title} - ${artist}`);

        const searchQuery = artist ? `${title} ${artist} official` : `${title} official`;

        // Try to get from cache first
        const cacheKey = youtubeCache.generateCacheKey(searchQuery, 'video');
        let data = youtubeCache.getFromCache(cacheKey);

        // If not in cache, fetch from YouTube API
        if (!data) {
          const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(searchQuery)}&maxResults=5&key=${YOUTUBE_API_KEY}`;
          const response = await fetch(searchUrl);

          if (!response.ok) {
            if (response.status === 429) {
              console.error('YouTube API quota exhausted (429)');
              throw new Error('YouTube API quota exhausted. Please try again later.');
            }
            throw new Error(`YouTube API error: ${response.status}`);
          }

          data = await response.json();
          // Cache the successful response
          youtubeCache.saveToCache(cacheKey, data);
        }

        if (!data.items || data.items.length === 0) {
          results.push({
            title,
            artist: artist || 'Unknown',
            success: false,
            error: 'No YouTube results found'
          });
          failureCount++;
          continue;
        }

        // Use smart matching to find best result
        const bestMatch = findBestYouTubeMatch(data.items, title, artist || '');

        if (bestMatch) {
          const trackData = {
            id: crypto.randomBytes(16).toString('hex'),
            type: 'youtube',
            title,
            artist: artist || 'Unknown',
            duration: '--:--',
            thumbnail: bestMatch.snippet.thumbnails?.medium?.url || bestMatch.snippet.thumbnails?.default?.url,
            videoId: bestMatch.id.videoId,
            audioUrl: null,
          };

          importedTracks.push(trackData);

          results.push({
            title,
            artist: artist || 'Unknown',
            success: true,
            videoId: bestMatch.id.videoId,
            youtubeTitle: bestMatch.snippet.title,
            thumbnail: bestMatch.snippet.thumbnails?.medium?.url || bestMatch.snippet.thumbnails?.default?.url
          });
          successCount++;
        } else {
          results.push({
            title,
            artist: artist || 'Unknown',
            success: false,
            error: 'No suitable match found'
          });
          failureCount++;
        }
      } catch (error) {
        console.error(`Error processing song "${title}":`, error);

        // If quota exhausted, stop immediately
        if (error.message.includes('429') || error.message.includes('quota')) {
          results.push({
            title,
            artist: artist || 'Unknown',
            success: false,
            error: error.message
          });
          failureCount++;

          // Return immediately with quota error
          return res.status(429).json({
            error: 'YouTube API quota exhausted',
            results,
            summary: {
              total: songs.length,
              successful: successCount,
              failed: failureCount,
              pending: songs.length - i - 1
            }
          });
        }

        results.push({
          title,
          artist: artist || 'Unknown',
          success: false,
          error: error.message
        });
        failureCount++;
      }
    }

    console.log(`Import complete: ${successCount} successful, ${failureCount} failed`);

    // Store imported tracks (in-memory for Vercel compatibility)
    importedTracks.push(...importedTracks);

    res.json({
      results,
      summary: {
        total: songs.length,
        successful: successCount,
        failed: failureCount
      },
      importedTracks // Return track data for frontend
    });
  } catch (error) {
    console.error('Song list import error:', error);
    res.status(500).json({ error: 'Failed to import song list' });
  }
});

// Endpoint to get imported tracks (for frontend sync)
app.get('/api/imported-tracks', (_req, res) => {
  try {
    res.json({ tracks: importedTracks });
  } catch (error) {
    console.error('Error getting imported tracks:', error);
    res.status(500).json({ error: 'Failed to get imported tracks' });
  }
});

// Endpoint to clear imported tracks after they've been loaded
app.delete('/api/imported-tracks', (_req, res) => {
  try {
    importedTracks = [];
    res.json({ success: true });
  } catch (error) {
    console.error('Error clearing imported tracks:', error);
    res.status(500).json({ error: 'Failed to clear imported tracks' });
  }
});

// ==========================================
// SMART MATCHING ALGORITHM
// ==========================================
function findBestYouTubeMatch(items, title, artist) {
  const unwantedKeywords = ['cover', 'karaoke', 'remix', 'slowed', 'reverb', 'nightcore', 'tribute', 'live', 'concert', 'reaction'];
  const preferredKeywords = ['official', 'audio', 'lyric', 'video'];

  // Normalize title and artist for comparison
  const normalizedTitle = title.toLowerCase();
  const normalizedArtist = artist.toLowerCase();

  // Score each video
  const scoredItems = items.map(item => {
    const videoTitle = item.snippet.title.toLowerCase();
    const videoChannel = item.snippet.channelTitle.toLowerCase();

    let score = 0;

    // Check for unwanted keywords (negative scoring)
    unwantedKeywords.forEach(keyword => {
      if (videoTitle.includes(keyword)) {
        score -= 10;
      }
    });

    // Check for preferred keywords (positive scoring)
    preferredKeywords.forEach(keyword => {
      if (videoTitle.includes(keyword)) {
        score += 5;
      }
    });

    // Check if artist name appears in title or channel
    if (normalizedArtist && videoTitle.includes(normalizedArtist)) {
      score += 8;
    }
    if (normalizedArtist && videoChannel.includes(normalizedArtist)) {
      score += 10;
    }

    // Check if song title appears in video title
    if (videoTitle.includes(normalizedTitle)) {
      score += 7;
    }

    // Prefer VEVO or official artist channels
    if (videoChannel.includes('vevo') || videoChannel.includes('official')) {
      score += 3;
    }

    return { item, score };
  });

  // Sort by score (highest first)
  scoredItems.sort((a, b) => b.score - a.score);

  // Return the best match if it has a positive score
  const bestMatch = scoredItems[0];
  if (bestMatch && bestMatch.score > 0) {
    return bestMatch.item;
  }

  // If no good match, return the first item as fallback
  return items[0];
}

// Start server
app.listen(PORT, () => {
  console.log('🎵 VibeCraft Server running on http://localhost:' + PORT);
  console.log('📱 Main App: http://localhost:' + PORT);
  console.log('🔗 Shared pages will be at: http://localhost:' + PORT + '/share/{pageId}');
});

// Export for Vercel
module.exports = app;