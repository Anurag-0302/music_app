// Vercel serverless function
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const SPOTIFY_REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI;
const SESSION_SECRET = process.env.SESSION_SECRET;

// In-memory storage for Vercel
let importedTracks = [];
let sharedPages = {};

// Serve static files from root directory
app.use(express.static(path.resolve(__dirname, '..')));

// Middleware
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
}));

app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'https://vibecraft-theta.vercel.app', 'https://vibecraft-stackup4.vercel.app', 'https://music-app-stackup4.vercel.app'],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// CORS handling
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://vibecraft-theta.vercel.app',
    'https://vibecraft-stackup4.vercel.app',
    'https://music-app-stackup4.vercel.app'
  ];

  if (origin && origin.startsWith('chrome-extension://')) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  } else if (allowedOrigins.includes(origin) || !origin) {
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

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// API Routes

// YouTube search endpoint
app.post('/api/search-youtube', async (req, res) => {
  try {
    const { title, artist } = req.body;
    
    if (!YOUTUBE_API_KEY) {
      return res.status(500).json({ error: 'YouTube API key not configured' });
    }

    if (!title || !artist) {
      return res.status(400).json({ error: 'Title and artist are required' });
    }

    const searchQuery = `${title} ${artist} official`;
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(searchQuery)}&maxResults=5&key=${YOUTUBE_API_KEY}`;

    const response = await fetch(searchUrl);
    const data = await response.json();

    if (data.error) {
      return res.status(500).json({ error: data.error.message });
    }

    const results = data.items.map(item => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      thumbnail: item.snippet.thumbnails.default?.url,
      channel: item.snippet.channelTitle
    }));

    res.json({ results });
  } catch (error) {
    console.error('YouTube search error:', error);
    res.status(500).json({ error: 'Failed to search YouTube' });
  }
});

// Import song list endpoint
app.post('/api/import-song-list', async (req, res) => {
  try {
    const { songs } = req.body;
    
    if (!YOUTUBE_API_KEY) {
      return res.status(500).json({ error: 'YouTube API key not configured' });
    }

    if (!songs || !Array.isArray(songs)) {
      return res.status(400).json({ error: 'Songs array is required' });
    }

    const results = [];
    let successCount = 0;
    let failureCount = 0;

    for (const song of songs) {
      try {
        const searchQuery = `${song.title} ${song.artist} official`;
        const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(searchQuery)}&maxResults=1&key=${YOUTUBE_API_KEY}`;

        const response = await fetch(searchUrl);
        const data = await response.json();

        if (data.items && data.items.length > 0) {
          const item = data.items[0];
          results.push({
            success: true,
            title: song.title,
            artist: song.artist,
            videoId: item.id.videoId,
            thumbnail: item.snippet.thumbnails.default?.url
          });
          successCount++;
        } else {
          results.push({
            success: false,
            title: song.title,
            artist: song.artist,
            error: 'No YouTube video found'
          });
          failureCount++;
        }
      } catch (error) {
        results.push({
          success: false,
          title: song.title,
          artist: song.artist,
          error: error.message
        });
        failureCount++;
      }
    }

    // Store imported tracks
    importedTracks.push(...results.filter(r => r.success));

    res.json({
      results,
      summary: {
        total: songs.length,
        successful: successCount,
        failed: failureCount
      }
    });
  } catch (error) {
    console.error('Import song list error:', error);
    res.status(500).json({ error: 'Failed to import song list' });
  }
});

// Get imported tracks
app.get('/api/imported-tracks', (_req, res) => {
  try {
    res.json({ tracks: importedTracks });
  } catch (error) {
    console.error('Error getting imported tracks:', error);
    res.status(500).json({ error: 'Failed to get imported tracks' });
  }
});

// Clear imported tracks
app.delete('/api/imported-tracks', (_req, res) => {
  try {
    importedTracks = [];
    res.json({ success: true });
  } catch (error) {
    console.error('Error clearing imported tracks:', error);
    res.status(500).json({ error: 'Failed to clear imported tracks' });
  }
});

// Create shared page
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

    sharedPages[pageId] = pageData;

    res.json({
      success: true,
      pageId: pageId,
      url: `/share/${pageId}`,
    });
  } catch (error) {
    console.error('Error creating page:', error);
    res.status(500).json({ error: 'Failed to create shareable page' });
  }
});

// Get shared page
app.get('/api/pages/:pageId', (_req, res) => {
  try {
    const { pageId } = _req.params;
    const pageData = sharedPages[pageId];
    
    if (!pageData) {
      return res.status(404).json({ error: 'Page not found' });
    }

    pageData.views = (pageData.views || 0) + 1;
    sharedPages[pageId] = pageData;

    res.json(pageData);
  } catch (error) {
    console.error('Error retrieving page:', error);
    res.status(500).json({ error: 'Failed to retrieve page' });
  }
});

// Delete shared page
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

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Fallback for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.resolve(__dirname, '..', 'index.html'));
});

// Export for Vercel
module.exports = app;