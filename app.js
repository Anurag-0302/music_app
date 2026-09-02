(function() {
  'use strict';

  // ==========================================
  // 1. APP STATE
  // ==========================================
  const state = {
    currentView: 'landing',
    playlist: [],
    currentTrackIndex: -1,
    isPlaying: false,
    isShuffle: false,
    repeatMode: 'none', // 'none' | 'all' | 'one'
    volume: 80,
    isRecording: false,
    recordingStream: null,
    mediaRecorder: null,
    recordingChunks: [],
    recordingStartTime: null,
    recordingBlob: null,
    audioContext: null,
    analyser: null,
    animationFrameId: null,
    timerInterval: null,
    progressInterval: null,
    ytPlayer: null,
    ytReady: false,
    pendingYouTubeVideoId: null,
    currentPlaybackType: null, // 'youtube' | 'audio' | 'spotify'
    // Spotify
    spotifyAPI: null,
    spotifyController: null,
    spotifyReady: false,
  };

  // ==========================================
  // 2. BACKGROUNDS ARRAY
  // ==========================================
  const backgrounds = [
    'https://images.unsplash.com/photo-1533900298318-6b8da08a523e?w=1920&q=80',
    'https://images.unsplash.com/photo-1483412033650-1015ddeb83d1?w=1920&q=80',
    'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=1920&q=80',
    'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=1920&q=80',
    'https://images.unsplash.com/photo-1507838153414-b4b713384a76?w=1920&q=80',
    'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=1920&q=80',
    'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=1920&q=80',
    'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=1920&q=80',
  ];

  // ==========================================
  // 3. DOM REFERENCES CACHE
  // ==========================================
  const $el = (id) => document.getElementById(id);
  const dom = {};

  function cacheDOM() {
    const ids = [
      'landing-page', 'editor-page',
      'start-creating-nav', 'start-creating-hero', 'back-btn',
      'bg-panel-toggle', 'songs-panel-toggle',
      'bg-panel', 'songs-panel', 'panel-overlay', 'songs-panel-close',
      'playlist-collapse-btn', 'playlist-card-body',
      'editor-canvas', 'bg-grid', 'bg-upload-input',
      'youtube-url-input', 'add-youtube-btn', 'yt-player',
      'audio-upload-zone', 'audio-upload-input',
      'record-btn', 'recorder-dot', 'waveform-canvas', 'recorder-timer', 'recorder-status',
      'save-recording-form', 'recording-name-input', 'save-recording-btn', 'discard-recording-btn',
      'track-list', 'track-count', 'empty-playlist',
      'music-player', 'player-progress-bar', 'progress-fill', 'progress-thumb',
      'now-playing-thumb', 'now-playing-title', 'now-playing-artist',
      'play-pause-btn', 'play-icon', 'pause-icon',
      'prev-btn', 'next-btn', 'shuffle-btn', 'repeat-btn',
      'current-time', 'total-time',
      'volume-btn', 'volume-icon', 'volume-mute-icon', 'volume-slider', 'audio-element',
      'widget-title', 'widget-clock', 'clock-display', 'widget-links',
      'song-list-textarea', 'import-song-list-btn', 'install-extension-btn', 'spotify-embed',
      'spotify-url-input', 'add-spotify-btn',
      'share-btn', 'share-modal', 'modal-close', 'share-title-input', 'share-desc-input',
      'share-track-count', 'create-share-btn', 'share-result', 'share-link-input', 'copy-link-btn'
    ];
    ids.forEach(id => {
      const element = $el(id);
      if (element) {
        dom[id] = element;
      } else {
        console.warn(`[VibeCraft] Element not found: ${id}`);
      }
    });
  }

  // ==========================================
  // SPOTIFY AUTH STATUS CHECK
  // ==========================================
  async function checkSpotifyAuthStatus() {
    // No longer needed - Spotify Web API removed
  }

  async function connectSpotify() {
    // No longer needed - Spotify Web API removed
  }

  // ==========================================
  // 4. INITIALIZATION
  // ==========================================

  // Check if page loaded with Spotify connection success
  if (window.location.search.includes('spotify_connected=true')) {
    // Remove the query param
    window.history.replaceState({}, document.title, window.location.pathname);
    alert('Successfully connected to Spotify! You can now add playlists.');
  }

  // Poll for imported tracks from extension
  function pollForImportedTracks() {
    console.log('[VibeCraft] Starting poll for imported tracks');
    
    setInterval(async () => {
      try {
        const response = await fetch('/api/imported-tracks');
        const data = await response.json();
        
        if (data.tracks && data.tracks.length > 0) {
          console.log('[VibeCraft] Found', data.tracks.length, 'imported tracks from extension');
          
          // Add imported tracks to playlist
          let addedCount = 0;
          data.tracks.forEach(track => {
            // Check if track already exists
            const exists = state.playlist.some(t => t.videoId === track.videoId);
            if (!exists) {
              state.playlist.push(track);
              addedCount++;
            }
          });
          
          if (addedCount > 0) {
            console.log('[VibeCraft] Added', addedCount, 'new tracks to playlist. Total playlist length:', state.playlist.length);
            renderPlaylist();
            saveState();
            
            // Clear imported tracks after loading
            await fetch('/api/imported-tracks', { method: 'DELETE' });
          } else {
            console.log('[VibeCraft] All', data.tracks.length, 'tracks already exist in playlist');
            // Clear imported tracks even if no new ones added
            await fetch('/api/imported-tracks', { method: 'DELETE' });
          }
        }
      } catch (error) {
        console.error('[VibeCraft] Error polling for imported tracks:', error);
      }
    }, 3000); // Check every 3 seconds
  }
  // ==========================================

  // Global error handler
  window.onerror = function(msg, src, line) {
    console.error('[VibeCraft ERROR]', msg, 'at', src, line);
  };

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    try { cacheDOM(); }
    catch(e) { console.error('cacheDOM failed:', e); return; }

    try { setupEventListeners(); }
    catch(e) { console.error('setupEventListeners failed:', e); return; }

    try { renderBackgrounds(); } catch(e) { console.error('renderBackgrounds failed:', e); }
    try { startClock(); } catch(e) { console.error('startClock failed:', e); }

    try { loadState(); }
    catch(e) { console.error('loadState failed:', e); }

    closeAllPanels();
    document.body.classList.remove('editor-open');

    try { loadWidgetPositions(); } catch(e) { console.error('loadWidgetPositions failed:', e); }
    try { initDrag(); } catch(e) { console.error('initDrag failed:', e); }
    try { resizeWaveformCanvas(); } catch(e) { console.error('resizeWaveformCanvas failed:', e); }
    window.addEventListener('resize', resizeWaveformCanvas);
    
    // Start polling for imported tracks from extension
    try { pollForImportedTracks(); } catch(e) { console.error('pollForImportedTracks failed:', e); }
  }

  // ==========================================
  // 5. VIEW MANAGEMENT
  // ==========================================
  function showEditor() {
    dom['landing-page'].style.display = 'none';
    dom['editor-page'].classList.add('active');
    document.body.classList.add('editor-open');
    state.currentView = 'editor';
    closeAllPanels();
    renderPlaylist();
    if (state.playlist.length > 0) {
      dom['music-player'].classList.remove('player-hidden');
    }
  }

  function showLanding() {
    closeAllPanels();
    hideSpotifyEmbed();
    if (state.isPlaying) {
      try { stopPlayback(); } catch (e) {}
    }
    dom['music-player']?.classList.add('player-hidden');
    document.body.classList.remove('editor-open');
    dom['landing-page'].style.display = '';
    dom['editor-page'].classList.remove('active');
    state.currentView = 'landing';
  }

  // ==========================================
  // 6. PANEL MANAGEMENT
  // ==========================================
  function syncPanelChrome() {
    const anyOpen = !!document.querySelector('.side-panel.open');
    dom['panel-overlay']?.classList.toggle('visible', anyOpen);
    dom['songs-panel-toggle']?.classList.toggle('active', !!dom['songs-panel']?.classList.contains('open'));
    dom['bg-panel-toggle']?.classList.toggle('active', !!dom['bg-panel']?.classList.contains('open'));
  }

  function closeAllPanels() {
    document.querySelectorAll('.side-panel.open').forEach(p => p.classList.remove('open'));
    syncPanelChrome();
  }

  function openPanel(panelId) {
    const panel = dom[panelId];
    if (!panel || state.currentView !== 'editor') return;
    document.querySelectorAll('.side-panel.open').forEach(p => {
      if (p !== panel) p.classList.remove('open');
    });
    panel.classList.add('open');
    syncPanelChrome();
  }

  function togglePanel(panelId) {
    const panel = dom[panelId];
    if (!panel) return;
    if (panel.classList.contains('open')) {
      closeAllPanels();
    } else {
      openPanel(panelId);
    }
  }

  function hideSpotifyEmbed() {
    const visibleEmbed = document.getElementById('spotify-visible-embed');
    if (visibleEmbed) visibleEmbed.remove();
  }

  // ==========================================
  // 7. BACKGROUND PICKER
  // ==========================================
  function renderBackgrounds() {
    if (!dom['bg-grid']) return;
    dom['bg-grid'].innerHTML = '';
    
    const currentBg = dom['editor-canvas'].style.backgroundImage || '';
    
    backgrounds.forEach((bg, index) => {
      const div = document.createElement('div');
      div.className = 'bg-option';
      
      // Mark as selected if it matches the current background, or if first and no match found
      if (currentBg.includes(bg.split('?')[0]) || (index === 0 && !currentBg)) {
        div.classList.add('selected');
      }
      
      div.style.backgroundImage = `url(${bg})`;
      
      div.addEventListener('click', () => {
        document.querySelectorAll('.bg-option').forEach(el => el.classList.remove('selected'));
        div.classList.add('selected');
        dom['editor-canvas'].style.backgroundImage = `url('${bg}')`;
        saveState();
      });
      
      dom['bg-grid'].appendChild(div);
    });
    
    // If no option was selected, select the first one
    if (!dom['bg-grid'].querySelector('.bg-option.selected')) {
      const first = dom['bg-grid'].querySelector('.bg-option');
      if (first) first.classList.add('selected');
    }
  }

  function handleBgUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      document.querySelectorAll('.bg-option').forEach(el => el.classList.remove('selected'));
      dom['editor-canvas'].style.backgroundImage = `url(${event.target.result})`;
      saveState();
    };
    reader.readAsDataURL(file);
  }

  // ==========================================
  // 8. YOUTUBE INTEGRATION
  // ==========================================
  window.onYouTubeIframeAPIReady = function() {
    const ytEl = document.getElementById('yt-player');
    if (!ytEl) return;
    state.ytPlayer = new YT.Player('yt-player', {
      height: '1',
      width: '1',
      playerVars: {
        autoplay: 0,
        controls: 0,
        disablekb: 1,
        fs: 0,
        modestbranding: 1,
      },
      events: {
        onReady: () => {
          state.ytReady = true;
          const track = state.playlist[state.currentTrackIndex];
          const videoId = state.pendingYouTubeVideoId || (track && track.type === 'youtube' ? track.videoId : null);
          if (videoId) {
            playYouTubeVideo(videoId, true);
            state.pendingYouTubeVideoId = null;
          }
        },
        onStateChange: onYTStateChange,
      },
    });
  };

  function onYTStateChange(event) {
    // YT.PlayerState.ENDED = 0, PLAYING = 1, PAUSED = 2
    if (event.data === 0) {
      playNext();
    } else if (event.data === 1) {
      state.isPlaying = true;
      updatePlayPauseIcon();
    } else if (event.data === 2) {
      state.isPlaying = false;
      updatePlayPauseIcon();
    }
  }

  function playYouTubeVideo(videoId, autoplay) {
    if (!videoId) return;
    if (state.ytReady && state.ytPlayer) {
      state.ytPlayer.loadVideoById(videoId);
      state.ytPlayer.setVolume(state.volume);
      if (autoplay) {
        state.ytPlayer.playVideo();
      }
    } else {
      state.pendingYouTubeVideoId = videoId;
    }
  }

  function playYouTubePlaylist(playlistId, autoplay) {
    if (!playlistId) return;
    if (state.ytReady && state.ytPlayer) {
      state.ytPlayer.cuePlaylist({ list: playlistId, listType: 'playlist' });
      state.ytPlayer.setVolume(state.volume);
      if (autoplay) {
        state.ytPlayer.playVideo();
      }
    } else {
      state.pendingYouTubeVideoId = playlistId;
    }
  }

  function parseYouTubeUrl(url) {
    // Extract video ID
    const vidExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=|shorts\/)([^#&?]*).*/;
    const vidMatch = url.match(vidExp);
    const videoId = (vidMatch && vidMatch[2].length === 11) ? vidMatch[2] : null;

    // Extract playlist ID
    const listMatch = url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
    const listId = listMatch ? listMatch[1] : null;

    // Check for playlist-only URL: youtube.com/playlist?list=...
    const playlistOnlyMatch = url.match(/youtube\.com\/playlist\?list=([a-zA-Z0-9_-]+)/);
    
    return { videoId, listId: listId || (playlistOnlyMatch ? playlistOnlyMatch[1] : null) };
  }

  async function addYouTubeContent() {
    const url = dom['youtube-url-input'].value.trim();
    if (!url) return;

    const { videoId, listId } = parseYouTubeUrl(url);

    if (!videoId && !listId) {
      alert('Invalid YouTube URL. Paste a video or playlist link.');
      return;
    }

    dom['add-youtube-btn'].disabled = true;

    try {
      if (listId) {
        dom['add-youtube-btn'].textContent = 'Loading playlist...';
        await addYouTubePlaylist(listId);
      } else {
        dom['add-youtube-btn'].textContent = 'Adding...';
        await addYouTubeSingle(videoId);
      }
      dom['youtube-url-input'].value = '';
    } catch (err) {
      console.error('YouTube add error:', err);
      alert('Error adding from YouTube. Please try again.');
    } finally {
      dom['add-youtube-btn'].disabled = false;
      dom['add-youtube-btn'].textContent = 'Add';
    }
  }

  async function addYouTubeSingle(videoId) {
    let title = 'YouTube Video';
    try {
      const response = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`);
      const data = await response.json();
      if (data && data.title) title = data.title;
    } catch (err) {}

    state.playlist.push({
      id: generateId(),
      type: 'youtube',
      title,
      artist: 'YouTube',
      duration: '--:--',
      thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
      videoId,
      audioUrl: null,
    });
    renderPlaylist();
    saveState();
    openPanel('songs-panel');
    dom['music-player'].classList.remove('player-hidden');
  }

  async function addYouTubePlaylist(listId) {
    dom['add-youtube-btn'].textContent = 'Loading playlist...';
    
    try {
      const response = await fetch('/api/import-youtube-playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playlistId }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to import YouTube playlist');
      }
      
      if (!data.tracks || data.tracks.length === 0) {
        throw new Error('No videos found in this playlist');
      }
      
      console.log('[VibeCraft] Adding', data.tracks.length, 'YouTube playlist tracks');
      
      // Add all tracks to playlist
      data.tracks.forEach(track => {
        state.playlist.push(track);
      });
      
      renderPlaylist();
      saveState();
      openPanel('songs-panel');
      dom['music-player'].classList.remove('player-hidden');
      
      console.log('[VibeCraft] Playlist rendered and panel opened');
      
      alert(`Successfully imported ${data.tracks.length} videos from YouTube playlist!`);
      
    } catch (error) {
      console.error('[VibeCraft] YouTube playlist import error:', error);
      alert('Error importing YouTube playlist: ' + error.message);
    }
  }

  // ==========================================
  // 8b. SPOTIFY INTEGRATION
  // ==========================================

  // Set up the callback FIRST, then dynamically load the script
  window.onSpotifyIframeApiReady = function(IFrameAPI) {
    state.spotifyAPI = IFrameAPI;
    state.spotifyReady = true;
    console.log('Spotify IFrame API ready');
  };

  // Dynamically load Spotify IFrame API (avoids race condition with static script tags)
  (function loadSpotifyAPI() {
    const script = document.createElement('script');
    script.src = 'https://open.spotify.com/embed/iframe-api/v1';
    script.async = true;
    script.onerror = () => {
      console.warn('Spotify IFrame API failed to load. Will use iframe fallback.');
    };
    document.head.appendChild(script);
  })();

  function parseSpotifyUrl(url) {
    if (!url) return null;

    // URI format: spotify:track:ID, spotify:playlist:ID, spotify:album:ID
    const uriMatch = url.match(/spotify:(track|playlist|album):([a-zA-Z0-9]+)/);
    if (uriMatch) return { type: uriMatch[1], id: uriMatch[2] };

    // URL format: open.spotify.com/[intl-xx/]track|playlist|album/ID
    const urlMatch = url.match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(track|playlist|album)\/([a-zA-Z0-9]+)/);
    if (urlMatch) return { type: urlMatch[1], id: urlMatch[2] };

    return null;
  }

  async function fetchSpotifyMeta(spotifyType, spotifyId) {
    const spotifyUrl = `https://open.spotify.com/${spotifyType}/${spotifyId}`;
    const endpoints = [
      `https://open.spotify.com/oembed?url=${spotifyUrl}`,
      `https://noembed.com/embed?url=${spotifyUrl}`,
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint);
        if (response.ok) {
          const data = await response.json();
          if (data && data.title) {
            return { title: data.title, thumbnail: data.thumbnail_url || null };
          }
        }
      } catch (err) { continue; }
    }

    const fallbackNames = { track: 'Spotify Track', playlist: 'Spotify Playlist', album: 'Spotify Album' };
    return { title: fallbackNames[spotifyType] || 'Spotify', thumbnail: null };
  }

  async function addSpotifyContent() {
    const url = dom['spotify-url-input'].value.trim();
    if (!url) return;

    const parsed = parseSpotifyUrl(url);
    if (!parsed) {
      alert('Invalid Spotify URL.\n\nSupported links:\n• Track: open.spotify.com/track/...\n• Playlist: open.spotify.com/playlist/...\n• Album: open.spotify.com/album/...');
      return;
    }

    dom['add-spotify-btn'].disabled = true;
    dom['add-spotify-btn'].textContent = 'Adding...';

    try {
      const metadata = await fetchSpotifyMeta(parsed.type, parsed.id);

      if (parsed.type === 'track') {
        // Handle single track
        await addSpotifyTrack(parsed, metadata);
      } else if (parsed.type === 'playlist' || parsed.type === 'album') {
        // Handle playlist/album by searching for matching YouTube playlist
        await addSpotifyPlaylist(parsed, metadata);
      }
    } catch (err) {
      console.error('Error adding Spotify content:', err);
      alert('Error adding from Spotify: ' + err.message);
    } finally {
      dom['add-spotify-btn'].disabled = false;
      dom['add-spotify-btn'].textContent = 'Add';
    }
  }

  async function addSpotifyTrack(parsed, metadata) {
    // Extract artist from title if possible (format: "title - artist" or "title by artist")
    let artist = 'Unknown Artist';
    let title = metadata.title;
    
    // Try to parse artist from title
    const titleParts = metadata.title.split(/ - | by /i);
    if (titleParts.length >= 2) {
      title = titleParts[0].trim();
      artist = titleParts[1].trim();
    } else {
      // Fallback: use the full title as both title and artist
      artist = metadata.title;
    }

    // Search YouTube for the best matching video
    dom['add-spotify-btn'].textContent = 'Searching YouTube...';
    
    try {
      const ytResponse = await fetch('/api/youtube/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, artist })
      });
      
      const ytData = await ytResponse.json();
      
      if (!ytResponse.ok || !ytData.videoId) {
        console.log('YouTube search failed:', ytData);
        throw new Error(ytData.message || 'Failed to find matching YouTube video');
      }

      const track = {
        id: generateId(),
        type: 'youtube',
        title: title,
        artist: artist,
        duration: '--:--',
        thumbnail: metadata.thumbnail,
        videoId: ytData.videoId,
        audioUrl: null,
        originalSpotifyId: parsed.id,
        originalSpotifyUri: `spotify:${parsed.type}:${parsed.id}`,
        originalSpotifyTitle: metadata.title,
      };

      state.playlist.push(track);
      renderPlaylist();
      saveState();
      openPanel('songs-panel');
      dom['spotify-url-input'].value = '';
      dom['music-player'].classList.remove('player-hidden');
    } catch (ytError) {
      console.log('YouTube search failed, falling back to Spotify embed:', ytError);
      
      // Fallback: Add as Spotify embed if YouTube search fails
      const track = {
        id: generateId(),
        type: 'spotify',
        title: metadata.title,
        artist: 'Spotify',
        duration: '--:--',
        thumbnail: metadata.thumbnail,
        videoId: null,
        audioUrl: null,
        spotifyTrackId: parsed.id,
        spotifyType: parsed.type,
        spotifyUri: `spotify:${parsed.type}:${parsed.id}`,
      };

      state.playlist.push(track);
      renderPlaylist();
      saveState();
      openPanel('songs-panel');
      dom['spotify-url-input'].value = '';
      dom['music-player'].classList.remove('player-hidden');
      
      // Notify user about fallback
      console.log('Added as Spotify embed (YouTube search failed)');
    }
  }

  // ==========================================
  // 8. SPOTIFY PLAYLIST/ALBUM HANDLING
  // ==========================================
  async function addSpotifyPlaylist(parsed, metadata) {
    // For playlists/albums, fetch actual tracks from Spotify and search YouTube for each
    dom['add-spotify-btn'].textContent = 'Connecting to Spotify...';
    
    try {
      // Check if authenticated with Spotify
      const authResponse = await fetch('/api/spotify/auth-status');
      const authData = await authResponse.json();
      
      if (!authData.authenticated) {
        // Show instructions to authenticate
        const shouldAuth = confirm(
          'To add Spotify playlists, you need to authenticate with Spotify first.\n\n' +
          'This will redirect you to Spotify to authorize this app.\n\n' +
          'Continue to Spotify?'
        );
        
        if (shouldAuth) {
          const authUrlResponse = await fetch('/api/spotify/auth-url');
          const authUrlData = await authUrlResponse.json();
          window.location.href = authUrlData.authUrl;
          return;
        } else {
          dom['add-spotify-btn'].disabled = false;
          dom['add-spotify-btn'].textContent = 'Add';
          return;
        }
      }
      
      // Fetch actual playlist tracks from Spotify
      dom['add-spotify-btn'].textContent = 'Fetching playlist tracks...';
      
      const tracksResponse = await fetch('/api/spotify/playlist-tracks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playlistId: parsed.id }),
      });
      
      const tracksData = await tracksResponse.json();
      
      if (!tracksResponse.ok) {
        throw new Error(tracksData.error || 'Failed to fetch playlist tracks');
      }
      
      const spotifyTracks = tracksData.tracks;
      console.log('[VibeCraft] Fetched', spotifyTracks.length, 'tracks from Spotify playlist');
      
      if (spotifyTracks.length === 0) {
        alert('This playlist has no tracks or is empty.');
        dom['add-spotify-btn'].disabled = false;
        dom['add-spotify-btn'].textContent = 'Add';
        return;
      }
      
      // Search YouTube for each track (limit to first 50 to avoid overwhelming)
      const tracksToProcess = spotifyTracks.slice(0, 50);
      dom['add-spotify-btn'].textContent = `Searching YouTube 0/${tracksToProcess.length}...`;
      
      let addedCount = 0;
      let failedCount = 0;
      
      for (let i = 0; i < tracksToProcess.length; i++) {
        const spotifyTrack = tracksToProcess[i];
        
        try {
          dom['add-spotify-btn'].textContent = `Searching YouTube ${i + 1}/${tracksToProcess.length}...`;
          
          const ytResponse = await fetch('/api/youtube/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              title: spotifyTrack.name, 
              artist: spotifyTrack.artists.split(',')[0].trim() // Use first artist
            }),
          });
          
          const ytData = await ytResponse.json();
          
          if (ytResponse.ok && ytData.videoId) {
            const track = {
              id: generateId(),
              type: 'youtube',
              title: spotifyTrack.name,
              artist: spotifyTrack.artists,
              duration: formatDuration(spotifyTrack.duration_ms),
              thumbnail: spotifyTrack.thumbnail,
              videoId: ytData.videoId,
              audioUrl: null,
              originalSpotifyId: spotifyTrack.id,
              originalSpotifyUri: spotifyTrack.uri,
            };

            state.playlist.push(track);
            addedCount++;
          } else {
            failedCount++;
            console.log('[VibeCraft] Failed to find YouTube match for:', spotifyTrack.name);
          }
        } catch (error) {
          failedCount++;
          console.error('[VibeCraft] Error processing track:', spotifyTrack.name, error);
        }
      }
      
      renderPlaylist();
      saveState();
      openPanel('songs-panel');
      dom['spotify-url-input'].value = '';
      dom['music-player'].classList.remove('player-hidden');
      
      alert(`Added ${addedCount} tracks from Spotify playlist${failedCount > 0 ? ` (${failedCount} failed to find YouTube matches)` : ''}`);
      
    } catch (error) {
      console.error('Error adding Spotify playlist:', error);
      alert('Error adding Spotify playlist: ' + error.message);
    } finally {
      dom['add-spotify-btn'].disabled = false;
      dom['add-spotify-btn'].textContent = 'Add';
    }
  }

  function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  // ==========================================
  // 8. SONG LIST PARSER
  // ==========================================
  function parseSongList(text) {
    const songs = [];
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    let currentTitle = null;
    let currentArtist = null;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Format: "Title - Artist"
      if (line.includes(' - ')) {
        const parts = line.split(' - ');
        if (parts.length >= 2) {
          songs.push({
            title: parts[0].trim(),
            artist: parts.slice(1).join(' - ').trim()
          });
        }
      }
      // Format: "Title" followed by "Artist" on next line
      else if (!line.includes(' - ') && currentTitle === null) {
        currentTitle = line;
      }
      else if (currentTitle !== null && currentArtist === null) {
        currentArtist = line;
        songs.push({
          title: currentTitle,
          artist: currentArtist
        });
        currentTitle = null;
        currentArtist = null;
      }
      // Single line without separator - treat as title only
      else if (!line.includes(' - ') && currentTitle === null) {
        songs.push({
          title: line,
          artist: ''
        });
      }
    }
    
    return songs;
  }

  async function importSongList() {
    const textarea = dom['song-list-textarea'];
    if (!textarea) return;
    
    const text = textarea.value.trim();
    if (!text) {
      alert('Please paste your song list first.');
      return;
    }
    
    const songs = parseSongList(text);
    
    if (songs.length === 0) {
      alert('Could not parse any songs from the text. Please check the format.');
      return;
    }
    
    const importBtn = dom['import-song-list-btn'];
    if (importBtn) {
      importBtn.disabled = true;
      importBtn.textContent = `Processing 0/${songs.length}...`;
    }
    
    try {
      const response = await fetch('/api/import-song-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songs }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to import song list');
      }
      
      // Add successful matches to playlist
      let addedCount = 0;
      data.results.forEach(result => {
        if (result.success) {
          state.playlist.push({
            id: generateId(),
            type: 'youtube',
            title: result.title,
            artist: result.artist,
            duration: '--:--',
            thumbnail: result.thumbnail,
            videoId: result.videoId,
            audioUrl: null,
          });
          addedCount++;
        }
      });
      
      console.log('[VibeCraft] Added', addedCount, 'songs to playlist. Total playlist length:', state.playlist.length);
      
      renderPlaylist();
      saveState();
      openPanel('songs-panel');
      dom['music-player'].classList.remove('player-hidden');
      
      console.log('[VibeCraft] Playlist rendered and panel opened');
      
      // Show results
      let message = `✓ ${data.summary.successful} songs added successfully`;
      if (data.summary.failed > 0) {
        message += `\n⚠ ${data.summary.failed} songs could not be found`;
        message += '\n\nFailed songs:';
        data.results.filter(r => !r.success).forEach(r => {
          message += `\n- ${r.title} - ${r.artist}`;
        });
      }
      alert(message);
      
      // Clear textarea
      textarea.value = '';
      
    } catch (error) {
      console.error('Error importing song list:', error);
      alert('Error importing song list: ' + error.message);
    } finally {
      if (importBtn) {
        importBtn.disabled = false;
        importBtn.textContent = 'Import Songs';
      }
    }
  }

  function showExtensionInstructions() {
    const instructions = `
VibeCraft Browser Extension - Installation Instructions

This is the RECOMMENDED method for importing Spotify playlists. The direct URL import is currently unavailable due to Spotify page structure changes.

INSTALLATION STEPS:

1. Make sure VibeCraft is running on http://localhost:3000

2. Open Chrome and go to: chrome://extensions/

3. Enable "Developer mode" (toggle in top right)

4. Click "Load unpacked"

5. Navigate to the vibecraft-extension folder in your music-app directory:
   C:\\Users\\Admin\\Desktop\\music-app\\vibecraft-extension

6. Select the folder and click "Select Folder"

7. The extension will now appear in your extensions list

HOW TO USE:

1. Open Spotify Web Player (open.spotify.com)
2. Navigate to your playlist
3. Click the VibeCraft extension icon in your browser toolbar
4. Click "Import to VibeCraft"
5. Songs will be automatically added to your VibeCraft playlist

WHY THIS METHOD WORKS:
- Direct DOM access to Spotify
- No reliance on Spotify page structure
- Works with public playlists
- No Spotify API or Premium required
- Successfully tested with your 47-song playlist

Note: The extension works with locally running VibeCraft on port 3000.
    `;
    
    alert(instructions);
  }

  // ==========================================
  // 9. AUDIO FILE UPLOAD
  // ==========================================
  function handleAudioFiles(files) {
    if (!files || files.length === 0) return;
    
    Array.from(files).forEach(file => {
      if (!file.type.startsWith('audio/') && !file.type.startsWith('video/')) return;
      
      const url = URL.createObjectURL(file);
      const tempAudio = new Audio(url);
      
      tempAudio.addEventListener('loadedmetadata', () => {
        const duration = formatTime(tempAudio.duration);
        const track = {
          id: generateId(),
          type: 'upload',
          title: file.name.replace(/\.[^.]+$/, ''),
          artist: 'Local File',
          duration: duration,
          thumbnail: null,
          videoId: null,
          audioUrl: url
        };
        
        state.playlist.push(track);
        renderPlaylist();
        saveState();
        openPanel('songs-panel');
        
        if (state.playlist.length === 1) {
          dom['music-player'].classList.remove('player-hidden');
        }
      });
      
      tempAudio.addEventListener('error', () => {
        alert(`Error loading file: ${file.name}`);
      });
    });
  }

  // ==========================================
  // 10. VOICE RECORDER
  // ==========================================
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      state.recordingStream = stream;
      state.recordingChunks = [];
      
      // Setup audio context for waveform visualization
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      state.audioContext = new AudioContext();
      state.analyser = state.audioContext.createAnalyser();
      state.analyser.fftSize = 2048;
      const source = state.audioContext.createMediaStreamSource(stream);
      source.connect(state.analyser);
      
      // Setup MediaRecorder
      state.mediaRecorder = new MediaRecorder(stream);
      state.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) state.recordingChunks.push(e.data);
      };
      state.mediaRecorder.onstop = onRecordingStop;
      state.mediaRecorder.start();
      
      state.isRecording = true;
      state.recordingStartTime = Date.now();
      
      // Update UI
      dom['record-btn'].classList.add('recording');
      dom['recorder-dot'].classList.remove('hidden');
      dom['recorder-status'].textContent = 'Recording...';
      dom['save-recording-form'].classList.add('hidden');
      
      drawWaveform();
      state.timerInterval = setInterval(updateRecorderTimer, 1000);
      updateRecorderTimer();
      
    } catch (err) {
      console.error(err);
      alert('Microphone access denied. Please allow microphone access to record.');
    }
  }

  function stopRecording() {
    if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
      state.mediaRecorder.stop();
    }
    if (state.recordingStream) {
      state.recordingStream.getTracks().forEach(t => t.stop());
    }
    state.isRecording = false;
    
    clearInterval(state.timerInterval);
    cancelAnimationFrame(state.animationFrameId);
    
    if (state.audioContext && state.audioContext.state !== 'closed') {
      state.audioContext.close();
    }
    
    dom['record-btn'].classList.remove('recording');
    dom['recorder-dot'].classList.add('hidden');
    dom['recorder-status'].textContent = 'Recording complete!';
    
    // Draw flat line
    drawFlatWaveform();
  }

  function onRecordingStop() {
    state.recordingBlob = new Blob(state.recordingChunks, { type: 'audio/webm' });
    state.recordingChunks = [];
    
    dom['save-recording-form'].classList.remove('hidden');
    dom['recording-name-input'].value = '';
    dom['recording-name-input'].focus();
  }

  function resizeWaveformCanvas() {
    const canvas = dom['waveform-canvas'];
    if (canvas && canvas.parentElement) {
      canvas.width = canvas.parentElement.offsetWidth;
      canvas.height = canvas.parentElement.offsetHeight || 60;
      if (!state.isRecording) drawFlatWaveform();
    }
  }

  function drawWaveform() {
    if (!state.isRecording) return;
    
    state.animationFrameId = requestAnimationFrame(drawWaveform);
    
    const canvas = dom['waveform-canvas'];
    const canvasCtx = canvas.getContext('2d');
    const bufferLength = state.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    state.analyser.getByteTimeDomainData(dataArray);
    
    canvasCtx.fillStyle = 'transparent';
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
    
    canvasCtx.lineWidth = 2;
    canvasCtx.strokeStyle = '#d97706'; // Accent color
    canvasCtx.beginPath();
    
    const sliceWidth = canvas.width * 1.0 / bufferLength;
    let x = 0;
    
    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i] / 128.0;
      const y = v * canvas.height / 2;
      
      if (i === 0) {
        canvasCtx.moveTo(x, y);
      } else {
        canvasCtx.lineTo(x, y);
      }
      x += sliceWidth;
    }
    
    canvasCtx.lineTo(canvas.width, canvas.height / 2);
    canvasCtx.stroke();
  }

  function drawFlatWaveform() {
    const canvas = dom['waveform-canvas'];
    if (!canvas) return;
    const canvasCtx = canvas.getContext('2d');
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
    canvasCtx.lineWidth = 2;
    canvasCtx.strokeStyle = '#d97706';
    canvasCtx.beginPath();
    canvasCtx.moveTo(0, canvas.height / 2);
    canvasCtx.lineTo(canvas.width, canvas.height / 2);
    canvasCtx.stroke();
  }

  function updateRecorderTimer() {
    if (!state.recordingStartTime) return;
    const elapsed = Math.floor((Date.now() - state.recordingStartTime) / 1000);
    dom['recorder-timer'].textContent = formatTime(elapsed);
  }

  function saveRecording() {
    if (!state.recordingBlob) return;
    
    let name = dom['recording-name-input'].value.trim();
    if (!name) name = 'Voice Recording ' + new Date().toLocaleTimeString();
    
    const url = URL.createObjectURL(state.recordingBlob);
    const track = {
      id: generateId(),
      type: 'recording',
      title: name,
      artist: 'Voice Recording',
      duration: dom['recorder-timer'].textContent,
      thumbnail: null,
      videoId: null,
      audioUrl: url
    };
    
    state.playlist.push(track);
    renderPlaylist();
    saveState();
    openPanel('songs-panel');
    
    dom['save-recording-form'].classList.add('hidden');
    dom['recorder-timer'].textContent = '0:00';
    dom['recorder-status'].textContent = 'Ready to record';
    
    if (state.playlist.length === 1) {
      dom['music-player'].classList.remove('player-hidden');
    }
  }

  function discardRecording() {
    state.recordingBlob = null;
    dom['save-recording-form'].classList.add('hidden');
    dom['recorder-timer'].textContent = '0:00';
    dom['recorder-status'].textContent = 'Ready to record';
  }

  // ==========================================
  // 11. PLAYLIST MANAGEMENT
  // ==========================================
  function renderPlaylist() {
    const trackList = dom['track-list'];
    if (!trackList) {
      console.error('[VibeCraft] track-list element not found');
      return;
    }

    // Remove old track items
    trackList.querySelectorAll('.track-item').forEach(el => el.remove());

    if (state.playlist.length === 0) {
      if (dom['empty-playlist']) dom['empty-playlist'].style.display = '';
      if (dom['track-count']) dom['track-count'].textContent = '0 tracks';
      dom['music-player']?.classList.add('player-hidden');
      return;
    }

    if (dom['empty-playlist']) dom['empty-playlist'].style.display = 'none';
    if (dom['track-count']) {
      const label = `${state.playlist.length} track${state.playlist.length !== 1 ? 's' : ''}`;
      dom['track-count'].textContent = label;
    }
    
    // Don't force the playlist card to be expanded - respect current state
    // The collapse button handles the collapsed state via CSS
    
    // Add collapse button if there are expanded tracks
    addCollapseButtonIfNeeded();

    state.playlist.forEach((track, index) => {
      console.log('[VibeCraft] Rendering track:', index, track.title, 'isPlaylist:', track.isPlaylist);
      const div = document.createElement('div');
      div.className = 'track-item' + (index === state.currentTrackIndex ? ' playing' : '');
      if (track.isPlaylist) div.classList.add('playlist-item');
      div.dataset.trackId = track.id;
      div.dataset.index = index;

      const badgeClass = track.type;
      const badgeLabel = track.type === 'youtube' ? 'YT' : track.type === 'upload' ? 'FILE' : track.type === 'spotify' ? 'SPOT' : 'REC';
      
      // Show Spotify badge for tracks that originated from Spotify (even though they're now youtube type)
      const isFromSpotify = track.originalSpotifyId || track.originalSpotifyUri;
      const isPlaylist = track.isPlaylist;
      let displayBadge = isFromSpotify ? 'SPOT→YT' : badgeLabel;
      if (isPlaylist) displayBadge = 'SPOT→YT▶';

      let thumbContent = '';
      if (track.thumbnail) {
        thumbContent = `<img src="${track.thumbnail}" alt="">`;
      } else {
        if (track.type === 'recording') {
          thumbContent = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>`;
        } else if (track.type === 'spotify') {
          thumbContent = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="rgba(30,215,96,0.5)"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.622.622 0 01-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.622.622 0 11-.277-1.215c3.809-.87 7.076-.496 9.712 1.115a.622.622 0 01.207.857zm1.224-2.719a.78.78 0 01-1.072.257c-2.687-1.652-6.785-2.131-9.965-1.166a.78.78 0 01-.973-.519.781.781 0 01.52-.972c3.632-1.102 8.147-.568 11.234 1.328a.78.78 0 01.256 1.072zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71a.936.936 0 11-.543-1.791c3.532-1.072 9.404-.865 13.115 1.338a.936.936 0 01-.954 1.613z"/></svg>`;
        } else {
          thumbContent = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
        }
      }

      // Different rendering for playlists vs individual tracks
      if (track.isPlaylist) {
        div.innerHTML = `
          <div class="track-thumb">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 22v-8a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v8"/><path d="M15 22v-8a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v8"/></svg>
          </div>
          <div class="track-info">
            <p class="track-name">${track.title}</p>
            <p class="track-artist">
              <span class="track-type-badge ${badgeClass}">${displayBadge}</span>
              ${track.artist}
            </p>
          </div>
          <span class="track-duration">${track.duration}</span>
          <div class="track-actions">
            <button class="track-expand" data-track-id="${track.id}" title="Expand into individual tracks">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 5-7 7 7-7"/><path d="m19 12-7 7 7-7"/></svg>
            </button>
            <button class="track-remove" data-track-id="${track.id}" title="Remove">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>
        `;
        
        // Add expand functionality - convert playlist to individual tracks
        const expandBtn = div.querySelector('.track-expand');
        if (expandBtn) {
          expandBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await expandPlaylist(track, index);
          });
        }
        
        // Prevent regular play on click for playlists
        div.addEventListener('click', (e) => {
          e.stopPropagation();
          // Instead of playing, show info about expanding
          alert('Click the + button to expand this playlist into individual tracks');
        });
      } else {
        div.innerHTML = `
          <div class="track-thumb">${thumbContent}</div>
          <div class="track-info">
            <p class="track-name">${track.title}</p>
            <p class="track-artist">
              <span class="track-type-badge ${badgeClass}">${displayBadge}</span>
              ${track.artist}
            </p>
          </div>
          <span class="track-duration">${track.duration}</span>
          <div class="track-actions">
            <button class="track-remove" data-track-id="${track.id}" title="Remove">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>
        `;

        div.addEventListener('click', () => playTrack(index));
      }

      const removeBtn = div.querySelector('.track-remove');
      if (removeBtn) {
        removeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          removeTrack(track.id);
        });
      }

      trackList.appendChild(div);
    });
    
    // Ensure music player is visible when there are tracks
    if (state.playlist.length > 0 && dom['music-player']) {
      dom['music-player'].classList.remove('player-hidden');
    }
  }

  function removeTrack(id) {
    const index = state.playlist.findIndex(t => t.id === id);
    if (index === -1) return;
    
    if (state.currentTrackIndex === index) {
      stopPlayback();
      state.currentTrackIndex = -1;
    } else if (state.currentTrackIndex > index) {
      state.currentTrackIndex--;
    }
    
    state.playlist.splice(index, 1);
    renderPlaylist();
    saveState();
  }

  function addCollapseButtonIfNeeded() {
    // Check if we have expanded tracks (tracks with parentPlaylistId)
    const hasExpandedTracks = state.playlist.some(t => t.parentPlaylistId);
    console.log('[VibeCraft] Checking for collapse button. Has expanded tracks:', hasExpandedTracks);
    
    let collapseContainer = document.getElementById('collapse-all-container');
    
    if (hasExpandedTracks && !collapseContainer) {
      console.log('[VibeCraft] Adding collapse button');
      // Add collapse button
      collapseContainer = document.createElement('div');
      collapseContainer.id = 'collapse-all-container';
      collapseContainer.className = 'collapse-all-container';
      collapseContainer.innerHTML = `
        <button id="collapse-all-btn" class="collapse-all-btn-inner">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6"/><path d="m6 9 6 6 6"/></svg>
          Collapse Expanded Playlists
        </button>
      `;
      
      const panelBody = dom['songs-panel']?.querySelector('.panel-body');
      if (panelBody) {
        panelBody.insertBefore(collapseContainer, panelBody.firstChild);
      }
      
      const collapseBtn = document.getElementById('collapse-all-btn');
      if (collapseBtn) {
        collapseBtn.addEventListener('click', collapseAllExpandedPlaylists);
        console.log('[VibeCraft] Collapse button click listener attached');
      }
    } else if (!hasExpandedTracks && collapseContainer) {
      console.log('[VibeCraft] Removing collapse button (no expanded tracks)');
      // Remove collapse button if no expanded tracks
      collapseContainer.remove();
    }
  }

  function collapseAllExpandedPlaylists() {
    console.log('[VibeCraft] === COLLAPSE START ===');
    console.log('[VibeCraft] Total playlist length:', state.playlist.length);
    
    // Group tracks by parentPlaylistId
    const playlistGroups = {};
    state.playlist.forEach((track, index) => {
      console.log('[VibeCraft] Track', index, ':', track.title, 'parentPlaylistId:', track.parentPlaylistId);
      if (track.parentPlaylistId) {
        console.log('[VibeCraft] Found expanded track:', track.title, 'from playlist:', track.parentPlaylistId);
        if (!playlistGroups[track.parentPlaylistId]) {
          playlistGroups[track.parentPlaylistId] = {
            originalTrack: track.originalPlaylist,
            tracks: [],
            startIndex: index
          };
        }
        playlistGroups[track.parentPlaylistId].tracks.push({ track, index });
      }
    });
    
    console.log('[VibeCraft] Found', Object.keys(playlistGroups).length, 'playlist groups to collapse');
    console.log('[VibeCraft] Playlist groups:', playlistGroups);
    
    // Replace expanded tracks with original playlist items
    Object.keys(playlistGroups).reverse().forEach(playlistId => {
      const group = playlistGroups[playlistId];
      console.log('[VibeCraft] Collapsing group with', group.tracks.length, 'tracks');
      console.log('[VibeCraft] Original track:', group.originalTrack);
      
      if (group.originalTrack) {
        // Remove expanded tracks (in reverse order to maintain indices)
        const indicesToRemove = group.tracks.map(t => t.index).sort((a, b) => b - a);
        console.log('[VibeCraft] Removing tracks at indices:', indicesToRemove);
        
        indicesToRemove.forEach(index => {
          console.log('[VibeCraft] Removing track at index', index, ':', state.playlist[index]?.title);
          state.playlist.splice(index, 1);
        });
        
        // Re-add original playlist at the original position
        console.log('[VibeCraft] Re-adding original playlist at index:', group.startIndex);
        state.playlist.splice(group.startIndex, 0, group.originalTrack);
      }
    });
    
    console.log('[VibeCraft] Collapse complete. New playlist length:', state.playlist.length);
    console.log('[VibeCraft] === COLLAPSE END ===');
    renderPlaylist();
    saveState();
  }

  async function expandPlaylist(track, index) {
    console.log('[VibeCraft] Expanding playlist:', track.title, 'at index:', index);
    
    // Store the playlist ID before removing the track
    const playlistId = track.id;
    
    // Store original playlist data for potential collapse
    const originalPlaylist = { ...track };
    
    // Remove the playlist item first
    state.playlist.splice(index, 1);
    
    if (track.type === 'youtube' && track.videoId) {
      // Expand YouTube playlist into individual tracks
      try {
        if (!state.ytReady || !state.ytPlayer) {
          alert('YouTube player is still loading. Please wait a moment and try again.');
          // Re-add the playlist item
          state.playlist.splice(index, 0, track);
          renderPlaylist();
          return;
        }

        // Load the playlist to get individual video IDs
        state.ytPlayer.cuePlaylist({ list: track.videoId, listType: 'playlist' });

        // Poll for the playlist to become available
        let videoIds = null;
        for (let i = 0; i < 20; i++) {
          await new Promise(r => setTimeout(r, 500));
          try { videoIds = state.ytPlayer.getPlaylist(); } catch(e) {}
          if (videoIds && videoIds.length > 0) break;
        }

        state.ytPlayer.stopVideo();

        if (!videoIds || videoIds.length === 0) {
          alert('Could not expand playlist. The playlist may be private or empty.');
          // Re-add the playlist item
          state.playlist.splice(index, 0, track);
          renderPlaylist();
          return;
        }

        // Cap at 50 tracks
        const ids = videoIds.slice(0, 50);
        
        // Fetch metadata and add individual tracks
        const tracks = await Promise.all(ids.map(async (vid) => {
          let title = 'YouTube Video';
          try {
            const resp = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${vid}`);
            const data = await resp.json();
            if (data && data.title) title = data.title;
          } catch(e) {}
          const expandedTrack = {
            id: generateId(),
            type: 'youtube',
            title,
            artist: 'YouTube',
            duration: '--:--',
            thumbnail: `https://img.youtube.com/vi/${vid}/mqdefault.jpg`,
            videoId: vid,
            audioUrl: null,
            parentPlaylistId: playlistId, // Use stored playlist ID
            originalPlaylist: originalPlaylist // Store original for collapse
          };
          console.log('[VibeCraft] Created expanded track with parentPlaylistId:', expandedTrack.parentPlaylistId);
          return expandedTrack;
        }));

        // Insert tracks at the original playlist position
        state.playlist.splice(index, 0, ...tracks);
        renderPlaylist();
        saveState();
        
        console.log('[VibeCraft] Playlist expanded into', tracks.length, 'individual tracks');
      } catch (error) {
        console.error('Error expanding YouTube playlist:', error);
        alert('Error expanding playlist: ' + error.message);
        // Re-add the playlist item
        state.playlist.splice(index, 0, track);
        renderPlaylist();
      }
    } else {
      // Re-add the playlist item if expansion is not supported
      state.playlist.splice(index, 0, track);
      renderPlaylist();
    }
  }

  function stopPlayback() {
    state.isPlaying = false;
    updatePlayPauseIcon();
    
    if (state.currentPlaybackType === 'youtube' && state.ytPlayer && state.ytReady) {
      try { state.ytPlayer.stopVideo(); } catch(e) {}
    } else if (state.currentPlaybackType === 'spotify') {
      if (state.spotifyController) {
        try { state.spotifyController.destroy(); } catch(e) {}
        state.spotifyController = null;
      }
      const visibleEmbed = document.getElementById('spotify-visible-embed');
      if (visibleEmbed) visibleEmbed.remove();
      const embedEl = dom['spotify-embed'];
      if (embedEl) embedEl.innerHTML = '';
    } else {
      const audioEl = dom['audio-element'];
      audioEl.pause();
      audioEl.currentTime = 0;
    }
    
    clearInterval(state.progressInterval);
    dom['progress-fill'].style.width = '0%';
    dom['current-time'].textContent = '0:00';
  }

  // ==========================================
  // 12. MUSIC PLAYER
  // ==========================================
  function playTrack(index) {
    if (index < 0 || index >= state.playlist.length) return;
    
    state.currentTrackIndex = index;
    const track = state.playlist[index];
    
    // Update now playing display
    if (dom['now-playing-title']) dom['now-playing-title'].textContent = track.title;
    if (dom['now-playing-artist']) dom['now-playing-artist'].textContent = track.artist;
    
    const thumbEl = dom['now-playing-thumb'];
    if (thumbEl) {
      if (track.thumbnail) {
        thumbEl.innerHTML = `<img src="${track.thumbnail}" alt="">`;
      } else {
        thumbEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.3"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
      }
    }
    
    if (dom['music-player']) dom['music-player'].classList.remove('player-hidden');
    const audioEl = dom['audio-element'];
    
    // Stop all other playback sources first
    if (state.currentPlaybackType === 'youtube' && state.ytPlayer && state.ytReady) {
      try { state.ytPlayer.stopVideo(); } catch(e) {}
    }
    if (state.currentPlaybackType === 'spotify') {
      if (state.spotifyController) {
        try { state.spotifyController.destroy(); } catch(e) {}
        state.spotifyController = null;
      }
      const visibleEmbed = document.getElementById('spotify-visible-embed');
      if (visibleEmbed) visibleEmbed.remove();
      const embedEl = dom['spotify-embed'];
      if (embedEl) embedEl.innerHTML = '';
    }
    if (state.currentPlaybackType === 'audio' && audioEl) {
      audioEl.pause();
      audioEl.currentTime = 0;
    }
    
    if (track.type === 'youtube') {
      state.currentPlaybackType = 'youtube';
      if (track.isPlaylist) {
        playYouTubePlaylist(track.videoId, true);
      } else {
        playYouTubeVideo(track.videoId, true);
      }
    } else if (track.type === 'spotify') {
      // Legacy support: if there are old spotify tracks, try to convert them
      state.currentPlaybackType = 'youtube';
      if (track.videoId) {
        if (track.isPlaylist) {
          playYouTubePlaylist(track.videoId, true);
        } else {
          playYouTubeVideo(track.videoId, true);
        }
      } else {
        alert('This Spotify track needs to be re-added to resolve YouTube video ID.');
      }
    } else {
      state.currentPlaybackType = 'audio';
      if (audioEl) {
        audioEl.src = track.audioUrl;
        audioEl.volume = state.volume / 100;
        audioEl.play().then(() => {
          state.isPlaying = true;
          updatePlayPauseIcon();
        }).catch((error) => {
          state.isPlaying = false;
          updatePlayPauseIcon();
          console.error('Audio playback error:', error);
          alert('This audio file could not be played. Please choose a supported audio file.');
        });
      }
    }
    
    updatePlayPauseIcon();
    renderPlaylist();
    startProgressUpdate();
  }

  function playSpotifyTrack(track) {
    const spotifyId = track.spotifyTrackId || (track.spotifyUri && track.spotifyUri.split(':').pop());
    if (!spotifyId) return;

    if (state.spotifyController) {
      try { state.spotifyController.destroy(); } catch(e) {}
      state.spotifyController = null;
    }

    const existing = document.getElementById('spotify-visible-embed');
    if (existing) existing.remove();

    const embedEl = dom['spotify-embed'];
    if (embedEl) embedEl.innerHTML = '';

    const embedType = track.spotifyType === 'playlist' || track.spotifyType === 'album' ? track.spotifyType : 'track';
    const uri = track.spotifyUri || `spotify:${embedType}:${spotifyId}`;
    const embedHeight = embedType === 'track' ? 152 : 352;

    const container = document.createElement('div');
    container.id = 'spotify-visible-embed';
    container.style.cssText = 'position:fixed;bottom:80px;left:0;right:0;z-index:51;background:rgba(0,0,0,0.95);border-top:1px solid rgba(255,255,255,0.08);display:flex;justify-content:center;padding:8px;max-width:100%;';

    const host = document.createElement('div');
    host.style.width = '100%';
    host.style.maxWidth = '660px';
    container.appendChild(host);
    document.body.appendChild(container);

    if (state.spotifyReady && state.spotifyAPI) {
      state.spotifyAPI.createController(host, {
        uri,
        width: '100%',
        height: embedHeight,
      }, (controller) => {
        state.spotifyController = controller;
        controller.addListener('ready', () => {
          controller.play();
        });
        controller.addListener('playback_update', (e) => {
          const { isPaused, position, duration } = e.data;
          state.isPlaying = !isPaused;
          updatePlayPauseIcon();
          if (duration > 0) {
            dom['progress-fill'].style.width = ((position / duration) * 100) + '%';
            dom['current-time'].textContent = formatTime(position / 1000);
            dom['total-time'].textContent = formatTime(duration / 1000);
          }
        });
      });
    } else {
      createSpotifyFallbackEmbed(spotifyId, embedType, host);
    }

    state.isPlaying = false;
    updatePlayPauseIcon();
  }

  function createSpotifyFallbackEmbed(spotifyId, spotifyType, parentEl) {
    const embedType = spotifyType || 'track';
    const embedHeight = embedType === 'track' ? 152 : 352;
    const target = parentEl || document.body;

    if (!parentEl) {
      const existing = document.getElementById('spotify-visible-embed');
      if (existing) existing.remove();

      const container = document.createElement('div');
      container.id = 'spotify-visible-embed';
      container.style.cssText = 'position:fixed;bottom:80px;left:0;right:0;z-index:51;background:rgba(0,0,0,0.95);border-top:1px solid rgba(255,255,255,0.08);display:flex;justify-content:center;padding:8px;';
      container.innerHTML = `<iframe 
        style="border-radius:12px;" 
        src="https://open.spotify.com/embed/${embedType}/${encodeURIComponent(spotifyId)}?utm_source=generator&theme=0" 
        width="100%" height="${embedHeight}" frameBorder="0" 
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="lazy"></iframe>`;
      document.body.appendChild(container);
      return;
    }

    target.innerHTML = `<iframe 
      style="border-radius:12px;" 
      src="https://open.spotify.com/embed/${embedType}/${encodeURIComponent(spotifyId)}?utm_source=generator&theme=0" 
      width="100%" height="${embedHeight}" frameBorder="0" 
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      loading="lazy"></iframe>`;
  }

  function togglePlayPause() {
    if (state.currentTrackIndex === -1) {
      if (state.playlist.length > 0) playTrack(0);
      return;
    }
    
    const audioEl = dom['audio-element'];
    
    if (state.isPlaying) {
      if (state.currentPlaybackType === 'youtube' && state.ytPlayer) {
        state.ytPlayer.pauseVideo();
      } else if (state.currentPlaybackType === 'spotify' && state.spotifyController) {
        try { state.spotifyController.togglePlay(); } catch(e) {}
      } else if (state.currentPlaybackType === 'spotify') {
        return;
      } else {
        audioEl.pause();
      }
      state.isPlaying = false;
    } else {
      if (state.currentPlaybackType === 'youtube' && state.ytPlayer) {
        state.ytPlayer.playVideo();
      } else if (state.currentPlaybackType === 'spotify' && state.spotifyController) {
        try { state.spotifyController.togglePlay(); } catch(e) {}
      } else if (state.currentPlaybackType === 'spotify') {
        return;
      } else {
        audioEl.play().catch(() => {});
      }
      state.isPlaying = true;
    }
    updatePlayPauseIcon();
  }

  function updatePlayPauseIcon() {
    if (state.isPlaying) {
      dom['play-icon'].classList.add('hidden');
      dom['pause-icon'].classList.remove('hidden');
    } else {
      dom['play-icon'].classList.remove('hidden');
      dom['pause-icon'].classList.add('hidden');
    }
  }

  function playNext() {
    if (state.playlist.length === 0) return;
    
    let nextIndex;
    if (state.repeatMode === 'one') {
      nextIndex = state.currentTrackIndex;
    } else if (state.isShuffle) {
      nextIndex = Math.floor(Math.random() * state.playlist.length);
    } else {
      nextIndex = state.currentTrackIndex + 1;
      if (nextIndex >= state.playlist.length) {
        if (state.repeatMode === 'all') {
          nextIndex = 0;
        } else {
          stopPlayback();
          return;
        }
      }
    }
    playTrack(nextIndex);
  }

  function playPrev() {
    if (state.playlist.length === 0) return;
    
    let prevIndex;
    if (state.repeatMode === 'one') {
      prevIndex = state.currentTrackIndex;
    } else if (state.isShuffle) {
      prevIndex = Math.floor(Math.random() * state.playlist.length);
    } else {
      prevIndex = state.currentTrackIndex - 1;
      if (prevIndex < 0) {
        if (state.repeatMode === 'all') {
          prevIndex = state.playlist.length - 1;
        } else {
          prevIndex = 0;
        }
      }
    }
    playTrack(prevIndex);
  }

  function toggleShuffle() {
    state.isShuffle = !state.isShuffle;
    dom['shuffle-btn'].classList.toggle('active', state.isShuffle);
    saveState();
  }

  function toggleRepeat() {
    const btn = dom['repeat-btn'];
    if (state.repeatMode === 'none') {
      state.repeatMode = 'all';
      btn.classList.add('active');
      btn.title = 'Repeat All';
    } else if (state.repeatMode === 'all') {
      state.repeatMode = 'one';
      btn.classList.add('active');
      btn.title = 'Repeat One';
    } else {
      state.repeatMode = 'none';
      btn.classList.remove('active');
      btn.title = 'Repeat';
    }
    saveState();
  }

  function startProgressUpdate() {
    clearInterval(state.progressInterval);
    state.progressInterval = setInterval(updateProgress, 250);
  }

  function updateProgress() {
    // Spotify progress is handled by its own playback_update listener
    if (state.currentPlaybackType === 'spotify') return;

    let currentTime = 0;
    let duration = 0;
    
    if (state.currentPlaybackType === 'youtube' && state.ytPlayer && state.ytReady) {
      try {
        currentTime = state.ytPlayer.getCurrentTime() || 0;
        duration = state.ytPlayer.getDuration() || 0;
      } catch(e) {}
    } else {
      const audioEl = dom['audio-element'];
      currentTime = audioEl.currentTime || 0;
      duration = audioEl.duration || 0;
      if (isNaN(duration)) duration = 0;
    }
    
    const pct = duration > 0 ? (currentTime / duration) * 100 : 0;
    dom['progress-fill'].style.width = pct + '%';
    
    dom['current-time'].textContent = formatTime(currentTime);
    dom['total-time'].textContent = formatTime(duration);
    
    if (duration > 0 && state.currentTrackIndex >= 0) {
      const track = state.playlist[state.currentTrackIndex];
      if (track && track.duration === '--:--') {
        track.duration = formatTime(duration);
        renderPlaylist();
      }
    }
  }

  function handleVolumeChange(e) {
    state.volume = e.target.value;
    applyVolume();
    saveState();
  }

  function toggleMute() {
    if (state.volume > 0) {
      dom['volume-slider'].dataset.prevVol = state.volume;
      state.volume = 0;
    } else {
      state.volume = dom['volume-slider'].dataset.prevVol || 80;
    }
    dom['volume-slider'].value = state.volume;
    applyVolume();
    saveState();
  }

  function applyVolume() {
    if (state.volume === 0) {
      dom['volume-icon'].classList.add('hidden');
      dom['volume-mute-icon'].classList.remove('hidden');
    } else {
      dom['volume-icon'].classList.remove('hidden');
      dom['volume-mute-icon'].classList.add('hidden');
    }
    
    if (state.currentPlaybackType === 'youtube' && state.ytPlayer && state.ytReady) {
      state.ytPlayer.setVolume(state.volume);
    } else {
      dom['audio-element'].volume = state.volume / 100;
    }
  }

  // ==========================================
  // 13. DRAGGABLE WIDGETS
  // ==========================================
  function initDrag() {
    document.querySelectorAll('.widget').forEach(widget => {
      let isDragging = false;
      let startX, startY, offsetX, offsetY;
      
      widget.addEventListener('mousedown', (e) => {
        if (e.target.closest('[contenteditable]') || e.target.closest('a')) return;
        
        isDragging = true;
        widget.classList.add('dragging');
        
        const rect = widget.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
        
        widget.style.transform = 'none';
        e.preventDefault();
      });
      
      document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        
        const canvas = dom['editor-canvas'];
        const canvasRect = canvas.getBoundingClientRect();
        
        let x = e.clientX - canvasRect.left - offsetX;
        let y = e.clientY - canvasRect.top - offsetY;
        
        x = Math.max(0, Math.min(x, canvasRect.width - widget.offsetWidth));
        y = Math.max(0, Math.min(y, canvasRect.height - widget.offsetHeight));
        
        widget.style.left = x + 'px';
        widget.style.top = y + 'px';
      });
      
      document.addEventListener('mouseup', () => {
        if (isDragging) {
          isDragging = false;
          widget.classList.remove('dragging');
          saveWidgetPositions();
        }
      });
      
      widget.addEventListener('touchstart', (e) => {
        if (e.target.closest('[contenteditable]') || e.target.closest('a')) return;
        
        isDragging = true;
        widget.classList.add('dragging');
        
        const touch = e.touches[0];
        const rect = widget.getBoundingClientRect();
        offsetX = touch.clientX - rect.left;
        offsetY = touch.clientY - rect.top;
        
        widget.style.transform = 'none';
      }, { passive: true });
      
      document.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        
        const touch = e.touches[0];
        const canvas = dom['editor-canvas'];
        const canvasRect = canvas.getBoundingClientRect();
        
        let x = touch.clientX - canvasRect.left - offsetX;
        let y = touch.clientY - canvasRect.top - offsetY;
        
        x = Math.max(0, Math.min(x, canvasRect.width - widget.offsetWidth));
        y = Math.max(0, Math.min(y, canvasRect.height - widget.offsetHeight));
        
        widget.style.left = x + 'px';
        widget.style.top = y + 'px';
      }, { passive: true });
      
      document.addEventListener('touchend', () => {
        if (isDragging) {
          isDragging = false;
          widget.classList.remove('dragging');
          saveWidgetPositions();
        }
      });
    });
  }

  // ==========================================
  // 14. CLOCK WIDGET
  // ==========================================
  function updateClock() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    if (dom['clock-display']) {
      dom['clock-display'].textContent = `${h}:${m}`;
    }
  }

  function startClock() {
    setInterval(updateClock, 1000);
    updateClock();
  }

  // ==========================================
  // 15. LOCALSTORAGE
  // ==========================================
  function saveState() {
    try {
      const data = {
        playlist: state.playlist.map(t => ({
          ...t,
          audioUrl: (t.type === 'youtube' || t.type === 'spotify') ? null : t.audioUrl,
          // Ensure YouTube video IDs are preserved for Spotify-originated tracks
          videoId: t.videoId,
          originalSpotifyId: t.originalSpotifyId,
          originalSpotifyUri: t.originalSpotifyUri,
          originalSpotifyTitle: t.originalSpotifyTitle,
          isPlaylist: t.isPlaylist,
        })),
        volume: state.volume,
        isShuffle: state.isShuffle,
        repeatMode: state.repeatMode,
        background: dom['editor-canvas'].style.backgroundImage,
      };
      localStorage.setItem('vibecraft-state', JSON.stringify(data));
    } catch(e) {}
  }

  function loadState() {
    try {
      const raw = localStorage.getItem('vibecraft-state');
      if (!raw) return;
      const data = JSON.parse(raw);
      
      if (data.playlist) {
        // Restore YouTube tracks (including Spotify-originated tracks with resolved YouTube IDs)
        // Uploads/recordings use Blob URLs which don't persist across sessions
        state.playlist = data.playlist.filter(t => t.type === 'youtube' || t.type === 'spotify');
        
        // Convert any legacy spotify tracks to youtube type if they have videoId
        state.playlist = state.playlist.map(t => {
          if (t.type === 'spotify' && t.videoId) {
            return { ...t, type: 'youtube' };
          }
          return t;
        });
      }
      if (data.volume !== undefined) {
        state.volume = data.volume;
        if (dom['volume-slider']) dom['volume-slider'].value = data.volume;
        applyVolume();
      }
      if (data.isShuffle) {
        state.isShuffle = data.isShuffle;
        if (dom['shuffle-btn']) dom['shuffle-btn'].classList.toggle('active', data.isShuffle);
      }
      if (data.repeatMode) {
        state.repeatMode = data.repeatMode;
        const btn = dom['repeat-btn'];
        if (btn && data.repeatMode !== 'none') {
          btn.classList.add('active');
          btn.title = data.repeatMode === 'all' ? 'Repeat All' : 'Repeat One';
        }
      }
      if (data.background && dom['editor-canvas']) {
        dom['editor-canvas'].style.backgroundImage = data.background;
        document.querySelectorAll('.bg-option').forEach(el => el.classList.remove('selected'));
      }
      
      renderPlaylist();
    } catch(e) {}
  }

  function saveWidgetPositions() {
    try {
      const positions = {};
      document.querySelectorAll('.widget').forEach(w => {
        positions[w.id] = { left: w.style.left, top: w.style.top };
      });
      localStorage.setItem('vibecraft-widgets', JSON.stringify(positions));
    } catch(e) {}
  }

  function loadWidgetPositions() {
    try {
      const raw = localStorage.getItem('vibecraft-widgets');
      if (!raw) return;
      const positions = JSON.parse(raw);
      Object.entries(positions).forEach(([id, pos]) => {
        const el = document.getElementById(id);
        if (el && pos.left && pos.top) {
          el.style.left = pos.left;
          el.style.top = pos.top;
          el.style.transform = 'none';
        }
      });
    } catch(e) {}
  }

  // ==========================================
  // 16. UTILITY FUNCTIONS
  // ==========================================
  function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }

  // ==========================================
  // 17. EVENT LISTENERS SETUP
  // ==========================================
  function setupEventListeners() {
    // Navigation
    dom['start-creating-nav']?.addEventListener('click', showEditor);
    dom['start-creating-hero']?.addEventListener('click', showEditor);
    dom['back-btn']?.addEventListener('click', showLanding);

    // Panels
    dom['bg-panel-toggle']?.addEventListener('click', () => togglePanel('bg-panel'));
    dom['songs-panel-toggle']?.addEventListener('click', () => togglePanel('songs-panel'));
    dom['songs-panel-close']?.addEventListener('click', closeAllPanels);
    dom['panel-overlay']?.addEventListener('click', closeAllPanels);

    document.querySelectorAll('.panel-close').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeAllPanels();
      });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeAllPanels();
    });

    const playlistCard = document.querySelector('.playlist-card');
    dom['playlist-collapse-btn']?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!playlistCard) return;
      const collapsed = playlistCard.classList.toggle('collapsed');
      dom['playlist-collapse-btn'].setAttribute('aria-expanded', String(!collapsed));
      dom['playlist-collapse-btn'].title = collapsed ? 'Expand playlist' : 'Collapse playlist';
      
      // Ensure the playlist card body is visible when not collapsed
      const playlistCardBody = dom['playlist-card-body'];
      if (playlistCardBody) {
        if (collapsed) {
          playlistCardBody.style.display = 'none';
        } else {
          playlistCardBody.style.display = 'block';
        }
      }
      
      // Scroll to top when collapsed to show Add Music section
      if (collapsed) {
        const panelBody = dom['songs-panel']?.querySelector('.panel-body');
        if (panelBody) {
          panelBody.scrollTop = 0;
          console.log('[VibeCraft] Scrolled to top of panel');
          
          // Ensure the Add Music section is visible
          setTimeout(() => {
            const addMusicSection = document.querySelector('.add-music-heading');
            if (addMusicSection) {
              addMusicSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
              console.log('[VibeCraft] Scrolled to Add Music section');
            }
          }, 100);
        }
      }
    });

    // Check if Spotify is connected
    checkSpotifyAuthStatus();
    
    // Song list import
    dom['import-song-list-btn']?.addEventListener('click', importSongList);
    
    // Install extension button
    dom['install-extension-btn']?.addEventListener('click', showExtensionInstructions);
    
    dom['bg-upload-input']?.addEventListener('change', handleBgUpload);

    // Audio Upload
    const dropZone = dom['audio-upload-zone'];
    const fileInput = dom['audio-upload-input'];
    
    dropZone?.addEventListener('click', () => fileInput?.click());
    
    dropZone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });
    
    dropZone?.addEventListener('dragleave', () => {
      dropZone.classList.remove('dragover');
    });
    
    dropZone?.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      if (e.dataTransfer.files) handleAudioFiles(e.dataTransfer.files);
    });
    
    fileInput?.addEventListener('change', (e) => {
      handleAudioFiles(e.target.files);
      e.target.value = ''; // Reset
    });

    // Voice Recorder
    dom['record-btn']?.addEventListener('click', () => {
      if (state.isRecording) {
        stopRecording();
      } else {
        startRecording();
      }
    });
    
    dom['save-recording-btn']?.addEventListener('click', saveRecording);
    dom['discard-recording-btn']?.addEventListener('click', discardRecording);

    // Player controls
    dom['play-pause-btn']?.addEventListener('click', togglePlayPause);
    dom['prev-btn']?.addEventListener('click', playPrev);
    dom['next-btn']?.addEventListener('click', playNext);
    dom['shuffle-btn']?.addEventListener('click', toggleShuffle);
    dom['repeat-btn']?.addEventListener('click', toggleRepeat);
    
    dom['volume-slider']?.addEventListener('input', handleVolumeChange);
    dom['volume-btn']?.addEventListener('click', toggleMute);

    // Share button
    dom['share-btn']?.addEventListener('click', openShareModal);
    dom['modal-close']?.addEventListener('click', closeShareModal);
    dom['create-share-btn']?.addEventListener('click', createShareLink);
    dom['copy-link-btn']?.addEventListener('click', copyShareLink);
    
    document.addEventListener('click', (e) => {
      if (e.target === dom['share-modal']) {
        closeShareModal();
      }
    });

    // Progress bar seeking
    dom['player-progress-bar']?.addEventListener('click', (e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      
      if (state.currentPlaybackType === 'youtube' && state.ytPlayer && state.ytReady) {
        const duration = state.ytPlayer.getDuration();
        if (duration) state.ytPlayer.seekTo(pct * duration, true);
      } else {
        const audioEl = dom['audio-element'];
        if (audioEl.duration) {
          audioEl.currentTime = pct * audioEl.duration;
        }
      }
    });

    // Audio element events
    const audioEl = dom['audio-element'];
    if (audioEl) {
      audioEl.addEventListener('ended', () => {
        if (state.currentPlaybackType === 'audio') playNext();
      });
      audioEl.addEventListener('loadedmetadata', () => {
        dom['total-time'].textContent = formatTime(audioEl.duration);
      });
    }
  }

  // ==========================================
  // 18. SHARING FUNCTIONALITY
  // ==========================================
  function openShareModal() {
    if (state.playlist.length === 0) {
      alert('Add some songs to your playlist before sharing!');
      return;
    }

    dom['share-title-input'].value = dom['widget-title']?.textContent || 'My Music Page';
    dom['share-desc-input'].value = 'A music page created with VibeCraft';
    dom['share-track-count'].textContent = state.playlist.length;
    dom['share-result'].style.display = 'none';
    dom['share-modal'].classList.remove('hidden');
  }

  function closeShareModal() {
    dom['share-modal'].classList.add('hidden');
  }

  async function createShareLink() {
    const title = dom['share-title-input'].value.trim() || 'My Music Page';
    const description = dom['share-desc-input'].value.trim() || 'A music page created with VibeCraft';
    const background = dom['editor-canvas'].style.backgroundImage || '';

    dom['create-share-btn'].disabled = true;
    dom['create-share-btn'].textContent = 'Creating link...';

    try {
      const response = await fetch('/api/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          background: background.replace(/url\(['"]?/, '').replace(/['"]?\)/, ''),
          playlist: state.playlist
        }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error);

      dom['share-link-input'].value = result.url;
      dom['share-result'].style.display = 'block';
    } catch (error) {
      console.error('Share error:', error);
      alert('Failed to create share link: ' + error.message);
    } finally {
      dom['create-share-btn'].disabled = false;
      dom['create-share-btn'].textContent = 'Create Shareable Link';
    }
  }

  function copyShareLink() {
    const link = dom['share-link-input'].value;
    if (!link) return;

    navigator.clipboard.writeText(link).then(() => {
      const btn = dom['copy-link-btn'];
      const originalText = btn.textContent;
      btn.textContent = '✓ Copied!';
      setTimeout(() => {
        btn.textContent = originalText;
      }, 2000);
    }).catch(err => {
      console.error('Copy failed:', err);
      alert('Failed to copy link');
    });
  }

})();
