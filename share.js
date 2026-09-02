(function() {
  'use strict';

  const state = {
    playlist: [],
    currentTrackIndex: -1,
    isPlaying: false,
    isShuffle: false,
    repeatMode: 'none',
    volume: 80,
    currentPlaybackType: null,
    ytPlayer: null,
    ytReady: false,
    pendingYouTubeVideoId: null,
    progressInterval: null,
  };

  const $el = (id) => document.getElementById(id);
  const dom = {};

  function cacheDOM() {
    const ids = [
      'now-playing-thumb', 'now-playing-title', 'now-playing-artist',
      'play-pause-btn', 'play-icon', 'pause-icon',
      'prev-btn', 'next-btn', 'shuffle-btn', 'repeat-btn',
      'current-time', 'total-time',
      'volume-btn', 'volume-icon', 'volume-mute-icon', 'volume-slider', 'audio-element',
      'music-player', 'player-progress-bar', 'progress-fill', 'progress-thumb',
      'track-list', 'track-count', 'empty-playlist',
      'share-header', 'share-title', 'share-desc', 'share-content',
    ];
    ids.forEach(id => {
      dom[id] = $el(id);
    });
  }

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    cacheDOM();
    setupEventListeners();
    loadSharedPage();
  }

  // Get page ID from URL
  function getPageIdFromUrl() {
    const path = window.location.pathname;
    const match = path.match(/\/share\/([a-f0-9]+)/);
    return match ? match[1] : null;
  }

  // Load shared page data
  async function loadSharedPage() {
    const pageId = getPageIdFromUrl();
    if (!pageId) {
      showError('Invalid page ID');
      return;
    }

    try {
      const response = await fetch(`/api/pages/${pageId}`);
      if (!response.ok) throw new Error('Page not found');

      const pageData = await response.json();
      
      // Set page info
      dom['share-title'].textContent = pageData.title;
      dom['share-desc'].textContent = pageData.description;
      dom['share-header'].style.display = 'block';

      // Set background
      const sharePage = document.querySelector('.share-page');
      if (pageData.background) {
        sharePage.style.backgroundImage = `url('${pageData.background}')`;
        sharePage.style.backgroundSize = 'cover';
        sharePage.style.backgroundAttachment = 'fixed';
      }

      // Load playlist
      state.playlist = pageData.playlist || [];
      dom['share-content'].innerHTML = '';
      renderPlaylist();

      document.title = `${pageData.title} — VibeCraft`;
    } catch (error) {
      console.error('Error loading page:', error);
      showError('Failed to load music page');
    }
  }

  function showError(message) {
    dom['share-content'].innerHTML = `
      <div style="text-align: center; padding: 2rem; color: var(--color-muted-foreground);">
        <p>${message}</p>
        <a href="/" style="display: inline-block; margin-top: 1rem; color: var(--color-accent); text-decoration: none;">← Back to VibeCraft</a>
      </div>
    `;
  }

  function renderPlaylist() {
    const trackList = dom['track-list'];
    trackList.innerHTML = '';

    if (state.playlist.length === 0) {
      dom['empty-playlist'].style.display = '';
      dom['track-count'].textContent = '0 tracks';
      dom['music-player'].classList.add('player-hidden');
      return;
    }

    dom['track-count'].textContent = `${state.playlist.length} track${state.playlist.length !== 1 ? 's' : ''}`;

    state.playlist.forEach((track, index) => {
      const div = document.createElement('div');
      div.className = 'track-item' + (index === state.currentTrackIndex ? ' playing' : '');
      div.dataset.index = index;

      const badgeClass = track.type;
      const badgeLabel = track.type === 'youtube' ? 'YT' : track.type === 'upload' ? 'FILE' : track.type === 'spotify' ? 'SPOT' : 'REC';
      
      // Show Spotify badge for tracks that originated from Spotify
      const isFromSpotify = track.originalSpotifyId || track.originalSpotifyUri;
      const isPlaylist = track.isPlaylist;
      let displayBadge = isFromSpotify ? 'SPOT→YT' : badgeLabel;
      if (isPlaylist) displayBadge = 'SPOT→YT▶';

      let thumbContent = '';
      if (track.thumbnail) {
        thumbContent = `<img src="${track.thumbnail}" alt="">`;
      } else {
        thumbContent = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
      }

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
      `;

      div.addEventListener('click', () => playTrack(index));
      trackList.appendChild(div);
    });

    dom['music-player'].classList.remove('player-hidden');
  }

  function playTrack(index) {
    if (index < 0 || index >= state.playlist.length) return;

    state.currentTrackIndex = index;
    const track = state.playlist[index];

    dom['now-playing-title'].textContent = track.title;
    dom['now-playing-artist'].textContent = track.artist;

    const thumbEl = dom['now-playing-thumb'];
    if (track.thumbnail) {
      thumbEl.innerHTML = `<img src="${track.thumbnail}" alt="">`;
    } else {
      thumbEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.3"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
    }

    const audioEl = dom['audio-element'];

    if (track.type === 'youtube') {
      state.currentPlaybackType = 'youtube';
      if (track.isPlaylist) {
        playYouTubePlaylist(track.videoId, true);
      } else {
        playYouTubeVideo(track.videoId, true);
      }
    } else if (track.type === 'spotify') {
      // Legacy support: handle old spotify tracks
      if (track.videoId) {
        // If it has a resolved YouTube ID, use YouTube playback
        state.currentPlaybackType = 'youtube';
        if (track.isPlaylist) {
          playYouTubePlaylist(track.videoId, true);
        } else {
          playYouTubeVideo(track.videoId, true);
        }
      } else {
        // Fallback to Spotify embed for legacy tracks without YouTube resolution
        state.currentPlaybackType = 'spotify';
        const spotifyId = track.spotifyTrackId || (track.spotifyUri && track.spotifyUri.split(':').pop());
        createSpotifyFallbackEmbed(spotifyId, track.spotifyType === 'playlist' || track.spotifyType === 'album' ? track.spotifyType : 'track');
        state.isPlaying = false;
      }
    } else {
      state.currentPlaybackType = 'audio';
      audioEl.src = track.audioUrl;
      audioEl.volume = state.volume / 100;
      audioEl.play().catch(() => {});
      state.isPlaying = true;
    }

    updatePlayPauseIcon();
    renderPlaylist();
    startProgressUpdate();
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
      } else if (state.currentPlaybackType === 'spotify') {
        // Spotify embeds handle their own playback, can't control via API
        return;
      } else {
        audioEl.pause();
      }
      state.isPlaying = false;
    } else {
      if (state.currentPlaybackType === 'youtube' && state.ytPlayer) {
        state.ytPlayer.playVideo();
      } else if (state.currentPlaybackType === 'spotify') {
        // Spotify embeds handle their own playback, can't control via API
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
  }

  function toggleRepeat() {
    const btn = dom['repeat-btn'];
    if (state.repeatMode === 'none') {
      state.repeatMode = 'all';
      btn.classList.add('active');
    } else if (state.repeatMode === 'all') {
      state.repeatMode = 'one';
      btn.classList.add('active');
    } else {
      state.repeatMode = 'none';
      btn.classList.remove('active');
    }
  }

  function startProgressUpdate() {
    clearInterval(state.progressInterval);
    state.progressInterval = setInterval(updateProgress, 250);
  }

  function updateProgress() {
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
  }

  function handleVolumeChange(e) {
    state.volume = e.target.value;
    applyVolume();
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

  function createSpotifyFallbackEmbed(spotifyId, spotifyType) {
    if (!spotifyId) return;
    const existing = document.getElementById('spotify-visible-embed');
    if (existing) existing.remove();

    const embedType = spotifyType || 'track';
    const embedHeight = embedType === 'track' ? 152 : 352;
    const container = document.createElement('div');
    container.id = 'spotify-visible-embed';
    container.style.cssText = 'position:fixed;bottom:80px;left:0;right:0;z-index:51;background:rgba(0,0,0,0.95);border-top:1px solid rgba(255,255,255,0.08);display:flex;justify-content:center;padding:8px;';
    container.innerHTML = `<iframe style="border-radius:12px;" src="https://open.spotify.com/embed/${embedType}/${encodeURIComponent(spotifyId)}?utm_source=generator&theme=0" width="100%" height="${embedHeight}" frameBorder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="eager"></iframe>`;
    document.body.appendChild(container);
  }

  function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  window.onYouTubeIframeAPIReady = function() {
    const ytEl = $el('yt-player');
    if (!ytEl) return;
    state.ytPlayer = new YT.Player('yt-player', {
      height: '1',
      width: '1',
      playerVars: { autoplay: 0, controls: 0, disablekb: 1, fs: 0, modestbranding: 1 },
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
        onStateChange: (event) => {
          if (event.data === 0) playNext();
          else if (event.data === 1) {
            state.isPlaying = true;
            updatePlayPauseIcon();
          } else if (event.data === 2) {
            state.isPlaying = false;
            updatePlayPauseIcon();
          }
        },
      },
    });
  };

  function setupEventListeners() {
    dom['play-pause-btn']?.addEventListener('click', togglePlayPause);
    dom['prev-btn']?.addEventListener('click', playPrev);
    dom['next-btn']?.addEventListener('click', playNext);
    dom['shuffle-btn']?.addEventListener('click', toggleShuffle);
    dom['repeat-btn']?.addEventListener('click', toggleRepeat);

    dom['volume-slider']?.addEventListener('input', handleVolumeChange);
    dom['volume-btn']?.addEventListener('click', toggleMute);

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

    const audioEl = dom['audio-element'];
    if (audioEl) {
      audioEl.addEventListener('ended', playNext);
      audioEl.addEventListener('loadedmetadata', () => {
        dom['total-time'].textContent = formatTime(audioEl.duration);
      });
    }

    const playlistCard = document.getElementById('share-playlist-card');
    document.getElementById('share-playlist-toggle')?.addEventListener('click', () => {
      if (!playlistCard) return;
      const collapsed = playlistCard.classList.toggle('collapsed');
      const btn = document.getElementById('share-playlist-toggle');
      if (btn) {
        btn.setAttribute('aria-expanded', String(!collapsed));
        btn.title = collapsed ? 'Show playlist' : 'Hide playlist';
      }
    });
  }

})();
