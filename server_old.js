const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'shared_pages');
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname));

// Serve share.html for all /share/:pageId routes
app.get('/share/:pageId', (req, res) => {
  res.sendFile(path.join(__dirname, 'share.html'));
});

// Generate unique page ID
function generatePageId() {
  return crypto.randomBytes(6).toString('hex');
}

// Create a shareable page
app.post('/api/pages', (req, res) => {
  try {
    const { playlist, background, title, description } = req.body;

    if (!playlist || !Array.isArray(playlist)) {
      return res.status(400).json({ error: 'Invalid playlist data' });
    }

    const pageId = generatePageId();
    const pageData = {
      id: pageId,
      title: title || 'My Music Page',
      description: description || 'A music page created with VibeCraft',
      background: background || 'https://images.unsplash.com/photo-1533900298318-6b8da08a523e?w=1920&q=80',
      playlist: playlist,
      createdAt: new Date().toISOString(),
      views: 0,
    };

    const filePath = path.join(DATA_DIR, `${pageId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(pageData, null, 2));

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
app.get('/api/pages/:pageId', (req, res) => {
  try {
    const { pageId } = req.params;
    const filePath = path.join(DATA_DIR, `${pageId}.json`);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Page not found' });
    }

    const pageData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    // Increment view count
    pageData.views = (pageData.views || 0) + 1;
    fs.writeFileSync(filePath, JSON.stringify(pageData, null, 2));

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
    const filePath = path.join(DATA_DIR, `${pageId}.json`);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Page not found' });
    }

    fs.unlinkSync(filePath);
    res.json({ success: true, message: 'Page deleted' });
  } catch (error) {
    console.error('Error deleting page:', error);
    res.status(500).json({ error: 'Failed to delete page' });
  }
});

// YouTube Search API endpoint
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
              console.log('Fallback successful, found video:', bestMatch.snippet.title);
              return res.json({ videoId: bestMatch.id.videoId, title: bestMatch.snippet.title, isPlaylist: false });
            }
          }
        }
      }
      return res.json({ videoId: null, message: 'No results found' });
    }

    // For playlists, return the first result (less filtering needed)
    if (isPlaylistSearch) {
      const playlistId = data.items[0].id.playlistId;
      console.log('Found playlist:', data.items[0].snippet.title);
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
// SPOTIFY OAUTH & API ENDPOINTS
// ==========================================

// Generate Spotify authorization URL
app.get('/api/spotify/auth-url', (req, res) => {
  if (!SPOTIFY_CLIENT_ID) {
    return res.status(500).json({ error: 'Spotify Client ID not configured' });
  }

  const state = crypto.randomBytes(16).toString('hex');
  const scope = 'playlist-read-private playlist-read-collaborative';
  
  const authUrl = `https://accounts.spotify.com/authorize?` +
    `client_id=${SPOTIFY_CLIENT_ID}&` +
    `response_type=code&` +
    `redirect_uri=${encodeURIComponent(SPOTIFY_REDIRECT_URI)}&` +
    `scope=${encodeURIComponent(scope)}&` +
    `state=${state}`;

  res.json({ authUrl, state });
});

// Spotify OAuth callback
app.get('/spotify/callback', (req, res) => {
  const { code, state } = req.query;
  
  if (!code) {
    return res.status(400).send('Authorization failed: No code received');
  }

  // Exchange code for access token
  const tokenUrl = 'https://accounts.spotify.com/api/token';
  const auth = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');

  fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: SPOTIFY_REDIRECT_URI,
    }),
  })
  .then(response => response.json())
  .then(data => {
    if (data.error) {
      throw new Error(data.error);
    }
    
    // Store tokens in a simple file (in production, use a database)
    const tokenData = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (data.expires_in * 1000),
    };
    
    fs.writeFileSync(path.join(__dirname, 'spotify_tokens.json'), JSON.stringify(tokenData, null, 2));
    
    // Redirect back to the app
    res.redirect('/?spotify_connected=true');
  })
  .catch(error => {
    console.error('Spotify token exchange error:', error);
    res.status(500).send('Failed to exchange authorization code for token');
  });
});

// Get Spotify playlist tracks
app.post('/api/spotify/playlist-tracks', async (req, res) => {
  try {
    const { playlistId } = req.body;
    
    if (!playlistId) {
      return res.status(400).json({ error: 'Playlist ID is required' });
    }

    // Check if we have valid tokens
    const tokenPath = path.join(__dirname, 'spotify_tokens.json');
    if (!fs.existsSync(tokenPath)) {
      return res.status(401).json({ error: 'Not authenticated with Spotify' });
    }

    let tokenData = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    
    // Check if token needs refresh
    if (Date.now() >= tokenData.expires_at) {
      if (!tokenData.refresh_token) {
        return res.status(401).json({ error: 'Access token expired and no refresh token available' });
      }

      // Refresh the token
      const tokenUrl = 'https://accounts.spotify.com/api/token';
      const auth = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');

      const refreshResponse = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: tokenData.refresh_token,
        }),
      });

      const refreshText = await refreshResponse.text();
      console.log('Spotify token refresh response:', refreshText);
      
      let refreshData;
      try {
        refreshData = JSON.parse(refreshText);
      } catch (e) {
        console.error('Failed to parse Spotify refresh response:', refreshText);
        throw new Error('Failed to refresh Spotify token');
      }
      
      if (refreshData.error) {
        throw new Error(refreshData.error);
      }

      tokenData.access_token = refreshData.access_token;
      tokenData.expires_at = Date.now() + (refreshData.expires_in * 1000);
      if (refreshData.refresh_token) {
        tokenData.refresh_token = refreshData.refresh_token;
      }

      fs.writeFileSync(tokenPath, JSON.stringify(tokenData, null, 2));
    }

    // Fetch playlist tracks from Spotify
    const playlistUrl = `https://api.spotify.com/v1/playlists/${playlistId}/tracks`;
    console.log('Fetching from Spotify:', playlistUrl);
    
    const response = await fetch(playlistUrl, {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
      },
    });

    const responseText = await response.text();
    console.log('Spotify API response status:', response.status);
    console.log('Spotify API response (first 200 chars):', responseText.substring(0, 200));

    if (!response.ok) {
      let errorData;
      try {
        errorData = JSON.parse(responseText);
      } catch (e) {
        throw new Error(`Spotify API error: ${response.status} - ${responseText.substring(0, 100)}`);
      }
      throw new Error(errorData.error?.message || 'Failed to fetch playlist tracks');
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      throw new Error('Failed to parse Spotify response');
    }
    
    // Extract track information
    const tracks = data.items
      .filter(item => item.track) // Filter out null tracks
      .map(item => ({
        id: item.track.id,
        name: item.track.name,
        artists: item.track.artists.map(a => a.name).join(', '),
        album: item.track.album?.name,
        duration_ms: item.track.duration_ms,
        uri: item.track.uri,
        thumbnail: item.track.album?.images?.[0]?.url || null,
      }));

    res.json({ tracks, total: data.total });
  } catch (error) {
    console.error('Spotify playlist tracks error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch playlist tracks' });
  }
});

// Check Spotify authentication status
app.get('/api/spotify/auth-status', (req, res) => {
  const tokenPath = path.join(__dirname, 'spotify_tokens.json');
  const isAuthenticated = fs.existsSync(tokenPath);
  
  if (isAuthenticated) {
    const tokenData = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    const isValid = Date.now() < tokenData.expires_at;
    res.json({ authenticated: isValid });
  } else {
    res.json({ authenticated: false });
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
    const channelTitle = item.snippet.channelTitle.toLowerCase();
    const description = (item.snippet.description || '').toLowerCase();
    
    let score = 0;
    
    // Penalty for unwanted keywords
    unwantedKeywords.forEach(keyword => {
      if (videoTitle.includes(keyword) || channelTitle.includes(keyword)) {
        score -= 50;
      }
    });
    
    // Bonus for preferred keywords
    preferredKeywords.forEach(keyword => {
      if (videoTitle.includes(keyword)) {
        score += 20;
      }
    });
    
    // Bonus for artist name match in title or channel
    if (videoTitle.includes(normalizedArtist) || channelTitle.includes(normalizedArtist)) {
      score += 30;
    }
    
    // Bonus for title match
    if (videoTitle.includes(normalizedTitle)) {
      score += 25;
    }
    
    // Bonus for high view count (quality signal)
    // Note: We'd need additional API call for view counts, using viewCount if available
    // For now, we'll skip this as it requires extra API quota
    
    // Bonus for official-looking channels
    if (channelTitle.includes('official') || channelTitle.includes('vevo') || channelTitle.includes(normalizedArtist)) {
      score += 15;
    }
    
    // Bonus for music-related categories
    if (description.includes('music') || description.includes('song') || description.includes('album')) {
      score += 10;
    }
    
    return {
      item,
      score
    };
  });
  
  // Sort by score (highest first)
  scoredItems.sort((a, b) => b.score - a.score);
  
  // Return the best match if it has a positive score
  const bestMatch = scoredItems[0];
  if (bestMatch && bestMatch.score > 0) {
    return bestMatch.item;
  }
  
  // If no positive scores, return the first result as fallback
  return items[0];
}

app.listen(PORT, () => {
  console.log(`\n🎵 VibeCraft Server running on http://localhost:${PORT}`);
  console.log(`📱 Main App: http://localhost:${PORT}`);
  console.log(`🔗 Shared pages will be at: http://localhost:${PORT}/share/{pageId}\n`);
});
