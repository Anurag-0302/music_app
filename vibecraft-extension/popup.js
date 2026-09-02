// VibeCraft Extension Popup Script

let vibeCraftServerUrl = 'http://localhost:3000';
let youtubeCache = {};
let quotaExhausted = false;

// Initialize cache from storage
async function initializeCache() {
  try {
    const result = await chrome.storage.local.get(['youtubeCache', 'quotaExhausted']);
    youtubeCache = result.youtubeCache || {};
    quotaExhausted = result.quotaExhausted || false;
    console.log('[YouTube] Cache initialized with', Object.keys(youtubeCache).length, 'entries');
  } catch (error) {
    console.error('[YouTube] Failed to initialize cache:', error);
  }
}

// Save cache to storage
async function saveCache() {
  try {
    await chrome.storage.local.set({ youtubeCache, quotaExhausted });
  } catch (error) {
    console.error('[YouTube] Failed to save cache:', error);
  }
}

// Normalize song key for caching
function normalizeSongKey(title, artist) {
  return `${title.toLowerCase().trim()}-${artist.toLowerCase().trim()}`;
}

// Check if song is cached
function getCachedResult(title, artist) {
  const key = normalizeSongKey(title, artist);
  const cached = youtubeCache[key];
  if (cached) {
    console.log('[YouTube] Cache hit:', title);
    return cached;
  }
  return null;
}

// Cache result
function cacheResult(title, artist, result) {
  const key = normalizeSongKey(title, artist);
  youtubeCache[key] = {
    title,
    artist,
    ...result,
    timestamp: Date.now()
  };
  console.log('[YouTube] Cached result for:', title);
}

// Check if VibeCraft server is running
async function checkVibeCraftServer() {
  try {
    // Try the status endpoint first
    const response = await fetch(`${vibeCraftServerUrl}/api/import-song-list`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ songs: [] }), // Send empty array to test connection
    });
    
    // If we get any response (even error), server is running
    return true;
  } catch (error) {
    console.error('VibeCraft server not reachable:', error);
    return false;
  }
}

// Get current tab
async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// Extract songs from Spotify page
async function extractSongs() {
  const tab = await getCurrentTab();
  
  try {
    // Inject content script if not already injected
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });
  } catch (error) {
    console.error('Failed to inject content script:', error);
    throw new Error('Could not inject content script. Make sure you\'re on a Spotify page.');
  }
  
  // Wait a moment for the content script to initialize
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Send message to content script to extract songs
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'extractSongs' });
    return response;
  } catch (error) {
    console.error('Failed to send message to content script:', error);
    throw new Error('Could not communicate with content script. Try refreshing the Spotify page.');
  }
}

// Import songs to VibeCraft with caching and quota handling
async function importToVibeCraft(songs) {
  try {
    const songsToProcess = [];
    const cachedResults = [];
    let cacheHits = 0;
    
    // Check cache for each song
    for (const song of songs) {
      const cached = getCachedResult(song.title, song.artist);
      if (cached && cached.status === 'matched') {
        cachedResults.push(cached);
        cacheHits++;
      } else if (cached && cached.status === 'not_found') {
        // Skip songs that were previously not found
        console.log('[YouTube] Skipping previously not found song:', song.title);
      } else {
        songsToProcess.push(song);
      }
    }
    
    console.log('[YouTube] Cache hits:', cacheHits);
    console.log('[YouTube] Songs to process:', songsToProcess.length);
    
    if (quotaExhausted && songsToProcess.length > 0) {
      console.log('[YouTube] Quota exhausted, returning only cached results');
      return {
        results: cachedResults.map(c => ({
          title: c.title,
          artist: c.artist,
          success: true,
          videoId: c.youtubeVideoId,
          youtubeTitle: c.youtubeTitle,
          thumbnail: c.thumbnail
        })),
        summary: {
          total: songs.length,
          successful: cachedResults.length,
          failed: songsToProcess.length,
          pending: songsToProcess.length
        },
        quotaExhausted: true
      };
    }
    
    // Process songs with rate limiting
    const batchSize = 3; // Process 3 songs at a time
    const delayBetweenBatches = 2000; // 2 seconds between batches
    const delayBetweenSongs = 500; // 500ms between songs
    
    const processedResults = [];
    let apiRequests = 0;
    
    for (let i = 0; i < songsToProcess.length; i++) {
      const song = songsToProcess[i];
      
      // Rate limiting
      if (i > 0 && i % batchSize === 0) {
        console.log('[YouTube] Pausing for rate limit');
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      } else if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenSongs));
      }
      
      try {
        console.log('[YouTube] Searching:', song.title, '-', song.artist);
        apiRequests++;
        
        const response = await fetch(`${vibeCraftServerUrl}/api/import-song-list`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ songs: [song] }),
        });
        
        const data = await response.json();
        
        if (!response.ok) {
          if (response.status === 429 || data.error?.includes('429')) {
            console.log('[YouTube] 429 quota exhausted');
            quotaExhausted = true;
            await saveCache();
            
            // Return what we have so far
            return {
              results: [...cachedResults.map(c => ({
                title: c.title,
                artist: c.artist,
                success: true,
                videoId: c.youtubeVideoId,
                youtubeTitle: c.youtubeTitle,
                thumbnail: c.thumbnail
              })), ...processedResults],
              summary: {
                total: songs.length,
                successful: cachedResults.length + processedResults.length,
                failed: processedResults.filter(r => !r.success).length,
                pending: songsToProcess.length - i - 1
              },
              quotaExhausted: true
            };
          }
          throw new Error(data.error || 'Failed to import song');
        }
        
        if (data.results && data.results.length > 0) {
          const result = data.results[0];
          processedResults.push(result);
          
          // Cache successful results
          if (result.success) {
            cacheResult(song.title, song.artist, {
              status: 'matched',
              youtubeVideoId: result.videoId,
              youtubeTitle: result.youtubeTitle,
              thumbnail: result.thumbnail
            });
            console.log('[YouTube] Match found:', result.videoId);
          } else {
            // Cache failed results
            cacheResult(song.title, song.artist, {
              status: 'not_found',
              error: result.error
            });
          }
        }
        
      } catch (error) {
        console.error('[YouTube] Error processing song:', song.title, error);
        processedResults.push({
          title: song.title,
          artist: song.artist,
          success: false,
          error: error.message
        });
      }
    }
    
    await saveCache();
    
    // Combine cached and processed results
    const allResults = [
      ...cachedResults.map(c => ({
        title: c.title,
        artist: c.artist,
        success: true,
        videoId: c.youtubeVideoId,
        youtubeTitle: c.youtubeTitle,
        thumbnail: c.thumbnail
      })),
      ...processedResults
    ];
    
    return {
      results: allResults,
      summary: {
        total: songs.length,
        successful: allResults.filter(r => r.success).length,
        failed: allResults.filter(r => !r.success).length,
        pending: 0
      },
      apiRequests,
      cacheHits
    };
    
  } catch (error) {
    console.error('Import error:', error);
    throw error;
  }
}

// Update UI status
function updateStatus(message, isError = false) {
  const statusEl = document.getElementById('status');
  statusEl.textContent = message;
  statusEl.className = isError ? 'status error' : 'status';
}

function updateProgress(message) {
  const progressEl = document.getElementById('progress');
  progressEl.textContent = message;
  progressEl.style.display = 'block';
}

function showError(message) {
  const errorEl = document.getElementById('errorMessage');
  errorEl.textContent = message;
  errorEl.style.display = 'block';
}

function hideError() {
  const errorEl = document.getElementById('errorMessage');
  errorEl.style.display = 'none';
}

// Main import flow
async function handleImport() {
  const importBtn = document.getElementById('importBtn');
  const songCountEl = document.getElementById('songCount');
  
  try {
    hideError();
    importBtn.disabled = true;
    updateStatus('Checking VibeCraft server...');
    
    // Check if VibeCraft is running
    const serverRunning = await checkVibeCraftServer();
    if (!serverRunning) {
      throw new Error('VibeCraft server is not running. Please start VibeCraft first.');
    }
    
    updateStatus('Extracting songs from Spotify...');
    updateProgress('Scanning playlist...');
    
    // Extract songs
    const result = await extractSongs();
    
    if (!result || !result.songs || result.songs.length === 0) {
      throw new Error('No songs found. Make sure you\'re on a Spotify playlist page.');
    }
    
    const songs = result.songs;
    songCountEl.textContent = `${songs.length} songs detected`;
    songCountEl.style.display = 'block';
    
    updateStatus(`Found ${songs.length} songs. Importing...`);
    updateProgress(`Importing 0/${songs.length}...`);
    
    // Import to VibeCraft with caching
    const importResult = await importToVibeCraft(songs);
    
    updateProgress('Import complete!');
    
    if (importResult.quotaExhausted) {
      updateStatus(`⚠ YouTube API quota exhausted. ${importResult.summary.successful}/${importResult.summary.total} songs matched. ${importResult.summary.pending} pending.`);
      updateProgress(`✓ ${importResult.summary.successful} matched\n⏳ ${importResult.summary.pending} pending (quota exhausted)`);
      
      setTimeout(() => {
        alert(`Import complete!\n\n✓ ${importResult.summary.successful} songs matched\n⏳ ${importResult.summary.pending} songs pending (YouTube API quota exhausted)\n\nRetry later to process remaining songs.`);
      }, 500);
    } else {
      updateStatus(`✓ Successfully imported ${importResult.summary.successful} songs`);
      
      if (importResult.summary.failed > 0) {
        updateProgress(`⚠ ${importResult.summary.failed} songs could not be found`);
      }
      
      if (importResult.cacheHits > 0) {
        updateProgress(`✓ ${importResult.summary.successful} songs added (including ${importResult.cacheHits} from cache)`);
      }
      
      // Success message
      setTimeout(() => {
        alert(`Import complete!\n\n✓ ${importResult.summary.successful} songs added\n${importResult.summary.failed > 0 ? `⚠ ${importResult.summary.failed} songs not found` : ''}${importResult.cacheHits > 0 ? `\n📦 ${importResult.cacheHits} songs loaded from cache` : ''}`);
      }, 500);
    }
    
  } catch (error) {
    console.error('Import failed:', error);
    updateStatus('Import failed', true);
    showError(error.message);
  } finally {
    importBtn.disabled = false;
  }
}

// Check if on Spotify playlist page
async function checkSpotifyPage() {
  try {
    const tab = await getCurrentTab();
    const isSpotify = tab.url && tab.url.includes('open.spotify.com');
    const isPlaylist = tab.url && (tab.url.includes('/playlist/') || tab.url.includes('/playlist'));
    
    const statusEl = document.getElementById('status');
    const importBtn = document.getElementById('importBtn');
    
    if (!isSpotify) {
      statusEl.textContent = 'Please open Spotify first';
      statusEl.classList.add('error');
      importBtn.disabled = true;
      return false;
    }
    
    if (!isPlaylist) {
      statusEl.textContent = 'Please open a Spotify playlist';
      statusEl.classList.add('error');
      importBtn.disabled = true;
      return false;
    }
    
    statusEl.textContent = 'Spotify playlist detected ✓';
    statusEl.classList.remove('error');
    importBtn.disabled = false;
    
    // Try to get song count with better error handling
    try {
      const result = await extractSongs();
      if (result && result.songs) {
        const songCountEl = document.getElementById('songCount');
        songCountEl.textContent = `${result.songs.length} songs detected`;
        songCountEl.style.display = 'block';
      }
    } catch (error) {
      console.log('Could not get song count (extension will retry on import):', error);
      // Don't fail the whole page check, just log it
    }
    
    return true;
  } catch (error) {
    console.error('Error checking Spotify page:', error);
    const statusEl = document.getElementById('status');
    const importBtn = document.getElementById('importBtn');
    
    statusEl.textContent = 'Error checking page. Please refresh.';
    statusEl.classList.add('error');
    importBtn.disabled = true;
    return false;
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  const importBtn = document.getElementById('importBtn');
  importBtn.addEventListener('click', handleImport);
  
  // Initialize cache
  await initializeCache();
  
  // Check current page
  checkSpotifyPage();
  
  // Listen for tab changes
  chrome.tabs.onActivated.addListener(checkSpotifyPage);
});
