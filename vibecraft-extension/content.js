// VibeCraft Content Script for Spotify
// Extracts track information from Spotify playlist pages

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

// Extract playlist ID from Spotify URL
function extractPlaylistId() {
  const url = window.location.href;
  const match = url.match(/playlist\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

// Alternative method: Fetch from Spotify embed page
async function fetchFromEmbedPage(playlistId) {
  try {
    console.log('[Spotify] Trying embed page approach for playlist:', playlistId);
    
    const embedUrl = `https://open.spotify.com/embed/playlist/${playlistId}`;
    const response = await fetch(embedUrl);
    
    if (!response.ok) {
      console.log('[Spotify] Embed page not accessible, falling back to DOM extraction');
      return null;
    }
    
    const html = await response.text();
    
    const scriptMatch = html.match(/<script id="initial-state" type="text\/javascript">(.+?)<\/script>/);
    
    if (scriptMatch) {
      try {
        const jsonData = JSON.parse(scriptMatch[1]);
        console.log('[Spotify] Found JSON data in embed page');
        
        const tracks = [];
        let trackData = null;
        
        const possiblePaths = [
          jsonData?.entities?.items,
          jsonData?.data?.playlistV2?.content?.items,
          jsonData?.playlistV2?.content?.items,
          jsonData?.page?.data?.playlistV2?.content?.items
        ];
        
        for (const path of possiblePaths) {
          if (path && path.length > 0) {
            trackData = path;
            break;
          }
        }
        
        if (trackData) {
          console.log('[Spotify] Found', trackData.length, 'tracks in embed data');
          
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
          
          const uniqueTracks = [];
          const seen = new Set();
          
          tracks.forEach(track => {
            const key = `${track.title.toLowerCase().trim()}-${track.artist.toLowerCase().trim()}`;
            if (!seen.has(key)) {
              seen.add(key);
              uniqueTracks.push(track);
            }
          });
          
          console.log('[Spotify] Songs detected from embed:', uniqueTracks.length);
          console.log('[Spotify] Unique songs from embed:', uniqueTracks.length);
          
          return uniqueTracks;
        }
      } catch (error) {
        console.error('[Spotify] Error parsing embed JSON:', error);
      }
    }
    
    console.log('[Spotify] No track data found in embed page, falling back to DOM extraction');
    return null;
    
  } catch (error) {
    console.error('[Spotify] Error fetching embed page:', error);
    return null;
  }
}

// Extract track information from Spotify DOM
async function extractTracksFromDOM() {
  const songs = [];
  
  try {
    console.log('[Spotify] Starting DOM extraction');
    
    const playlistId = extractPlaylistId();
    if (playlistId) {
      const embedTracks = await fetchFromEmbedPage(playlistId);
      if (embedTracks && embedTracks.length > 0) {
        return embedTracks;
      }
    }
    
    console.log('[Spotify] Falling back to DOM extraction');
    
    const trackRows = document.querySelectorAll('[data-testid="tracklist-row"]');
    console.log('[Spotify] Found', trackRows.length, 'track rows with primary selector');
    
    if (trackRows.length > 0) {
      trackRows.forEach((row, index) => {
        try {
          const titleEl = row.querySelector('[data-testid="tracklist-row__title-link"]') || 
                         row.querySelector('.standalone-ellipsis-one-line');
          
          const artistEl = row.querySelector('[data-testid="tracklist-row__artist-link"]') ||
                         row.querySelector('.artists') ||
                         row.querySelector('a[href*="/artist/"]') ||
                         row.querySelector('[aria-label*="artist"]');
          
          if (titleEl) {
            const title = cleanSongTitle(titleEl.textContent || titleEl.getAttribute('title') || '');
            let artist = '';
            
            if (artistEl) {
              artist = cleanArtistName(artistEl.textContent || artistEl.getAttribute('title') || '');
            } else {
              const siblings = Array.from(row.children);
              for (const sibling of siblings) {
                if (sibling !== titleEl && sibling.textContent && sibling.textContent.length > 0) {
                  const text = sibling.textContent.trim();
                  if (text !== title && text.length < 50) {
                    artist = cleanArtistName(text);
                    break;
                  }
                }
              }
            }
            
            if (title && title.length > 1) {
              songs.push({ title, artist });
            }
          }
        } catch (error) {
          console.error('Error extracting track from row', index, ':', error);
        }
      });
    }
    
    if (songs.length === 0) {
      console.log('[Spotify] Method 1 failed, trying generic approach');
      const allRows = document.querySelectorAll('div[data-testid]');
      console.log('[Spotify] Found', allRows.length, 'elements with data-testid');
      
      allRows.forEach((el, index) => {
        const testId = el.getAttribute('data-testid');
        if (testId && testId.includes('track')) {
          console.log('[Spotify] Found track-related element:', testId);
          
          const text = el.textContent.trim();
          if (text && text.length > 3 && text.length < 100) {
            songs.push({ title: cleanSongTitle(text), artist: '' });
          }
        }
      });
    }
    
    const uniqueSongs = [];
    const seen = new Set();
    
    songs.forEach(song => {
      const key = `${song.title.toLowerCase().trim()}-${song.artist.toLowerCase().trim()}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueSongs.push(song);
      }
    });
    
    console.log('[Spotify] Songs detected:', uniqueSongs.length);
    console.log('[Spotify] Unique songs:', uniqueSongs.length);
    return uniqueSongs;
    
  } catch (error) {
    console.error('[Spotify] Error extracting tracks from DOM:', error);
    return [];
  }
}

// Scroll to load more tracks (for large playlists)
async function scrollToLoadMoreTracks() {
  console.log('[Spotify] Scrolling to load more tracks');
  const songs = await extractTracksFromDOM();
  let previousCount = songs.length;
  let scrollAttempts = 0;
  const maxScrollAttempts = 100;
  let consecutiveNoNewSongs = 0;
  const maxConsecutiveNoNewSongs = 15;
  
  const contentContainer = document.querySelector('[data-testid="track-list"]') || 
                          document.querySelector('.os-viewport') ||
                          document.querySelector('.queue-queue-QueueList') ||
                          document.body;
  
  console.log('[Spotify] Using container for scrolling:', contentContainer.tagName);
  
  while (scrollAttempts < maxScrollAttempts) {
    if (contentContainer === document.body) {
      window.scrollTo(0, document.body.scrollHeight);
    } else {
      contentContainer.scrollTop = contentContainer.scrollHeight;
    }
    
    await new Promise(resolve => setTimeout(resolve, 1200));
    
    const currentSongs = await extractTracksFromDOM();
    
    if (currentSongs.length === previousCount) {
      consecutiveNoNewSongs++;
      console.log('[Spotify] No new songs found (attempt', consecutiveNoNewSongs, ') - current:', currentSongs.length);
      
      if (consecutiveNoNewSongs >= 5) {
        console.log('[Spotify] Trying smaller scroll increments');
        for (let i = 0; i < 8; i++) {
          if (contentContainer === document.body) {
            window.scrollBy(0, 300);
          } else {
            contentContainer.scrollTop += 300;
          }
          await new Promise(resolve => setTimeout(resolve, 600));
          
          const intermediateSongs = await extractTracksFromDOM();
          if (intermediateSongs.length > previousCount) {
            console.log('[Spotify] Found songs with small scroll!');
            previousCount = intermediateSongs.length;
            consecutiveNoNewSongs = 0;
            break;
          }
        }
      }
      
      if (consecutiveNoNewSongs >= maxConsecutiveNoNewSongs) {
        console.log('[Spotify] No new songs for', maxConsecutiveNoNewSongs, 'attempts, stopping scroll');
        break;
      }
    } else {
      consecutiveNoNewSongs = 0;
      console.log('[Spotify] Found new songs! Total:', currentSongs.length);
      previousCount = currentSongs.length;
    }
    
    scrollAttempts++;
    
    if (currentSongs.length >= 1000) {
      console.log('[Spotify] Reached 1000 songs, stopping scroll');
      break;
    }
  }
  
  if (contentContainer === document.body) {
    window.scrollTo(0, 0);
  } else {
    contentContainer.scrollTop = 0;
  }
  await new Promise(resolve => setTimeout(resolve, 500));
  
  const finalSongs = await extractTracksFromDOM();
  console.log('[Spotify] Final extraction after scrolling:', finalSongs.length, 'songs');
  console.log('[Spotify] Songs detected:', finalSongs.length);
  console.log('[Spotify] Unique songs:', finalSongs.length);
  return finalSongs;
}

// Main message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extractSongs') {
    try {
      console.log('[Spotify] ExtractSongs request received');
      
      (async () => {
        try {
          const initialSongs = await extractTracksFromDOM();
          console.log('[Spotify] Initial extraction found', initialSongs.length, 'songs');
          
          const finalSongs = await scrollToLoadMoreTracks();
          console.log('[Spotify] Final extraction after scrolling:', finalSongs.length, 'songs');
          sendResponse({ songs: finalSongs, success: true });
        } catch (error) {
          console.error('[Spotify] Error during extraction:', error);
          sendResponse({ songs: [], success: false, error: error.message });
        }
      })();
      
      return true;
    } catch (error) {
      console.error('Error in extractSongs:', error);
      sendResponse({ songs: [], success: false, error: error.message });
      return true;
    }
  }
});

console.log('VibeCraft Spotify content script loaded');