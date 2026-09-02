# VibeCraft Browser Extension - Installation Guide

## Overview

The VibeCraft browser extension allows you to automatically import Spotify playlists to VibeCraft without using Spotify's API or requiring Spotify Premium. It extracts track information directly from the Spotify Web Player that you can view in your browser.

## Features

- ✅ **One-click import** - Click a button to import entire playlists
- ✅ **No Spotify API required** - Works with free Spotify accounts
- ✅ **No Premium needed** - Works with any Spotify account
- ✅ **Automatic track extraction** - Reads song titles and artists from Spotify
- ✅ **Smart scrolling** - Automatically loads more tracks for large playlists
- ✅ **Data cleaning** - Normalizes artist names and removes UI text
- ✅ **Fallback support** - Manual paste importer still available

## Installation Instructions

### Step 1: Start VibeCraft

Make sure VibeCraft is running on your computer:

```bash
cd C:\Users\Admin\Desktop\music-app
npm start
```

VibeCraft should be running at `http://localhost:3000`

### Step 2: Open Chrome Extensions

1. Open Google Chrome
2. In the address bar, type: `chrome://extensions`
3. Press Enter

### Step 3: Enable Developer Mode

1. Look for a toggle switch in the top-right corner labeled "Developer mode"
2. Click it to enable Developer mode

### Step 4: Load the Extension

1. Click the "Load unpacked" button that appears in the top-left
2. Navigate to this folder:
   ```
   C:\Users\Admin\Desktop\music-app\vibecraft-extension
   ```
3. Select the `vibecraft-extension` folder
4. Click "Select Folder"

### Step 5: Verify Installation

The VibeCraft extension should now appear in your extensions list with:
- Name: "VibeCraft Spotify Import"
- Description: "Import Spotify playlists to VibeCraft without using Spotify API"

## How to Use the Extension

### Step 1: Open Spotify Web Player

1. Go to [open.spotify.com](https://open.spotify.com)
2. Log in to your Spotify account (free or Premium)
3. Navigate to the playlist you want to import

### Step 2: Click the Extension Icon

1. Look for the VibeCraft extension icon in your Chrome toolbar
2. Click it to open the extension popup

### Step 3: Import to VibeCraft

1. The extension will show "Spotify playlist detected ✓"
2. It will display the number of songs found
3. Click "Import to VibeCraft"
4. Wait for the import to complete
5. The extension will show: "✓ Successfully imported X songs"

### Step 4: Check VibeCraft

1. Go back to VibeCraft (`http://localhost:3000`)
2. Click "Songs" button to open your playlist
3. The imported songs should appear in your playlist
4. Click any song to play it using the YouTube player

## Import Options

### Option 1: Browser Extension (Automatic)

**Best for:** Large playlists, frequent imports

**Pros:**
- One-click import
- Automatic track extraction
- Handles large playlists
- No manual formatting needed

**Cons:**
- Requires Chrome browser
- Requires extension installation

### Option 2: Manual Paste (Fallback)

**Best for:** Small playlists, occasional imports, other browsers

**Pros:**
- Works in any browser
- No extension needed
- Full control over formatting

**Cons:**
- Manual copy/paste required
- Need to format songs correctly

## How Track Extraction Works

The extension uses these methods to extract track information:

### Method 1: DOM Scraping (Primary)

The extension searches for Spotify's track list elements:
- Looks for `[data-testid="tracklist-row"]` elements
- Extracts title from track name elements
- Extracts artist from artist link elements
- Handles multiple artists and featured artists

### Method 2: Alternative Selectors (Fallback)

If the primary method fails, it tries:
- `.tracklist-row` elements
- `.track-name` elements
- `.artists` elements

### Method 3: Smart Scrolling (Large Playlists)

For playlists with virtual scrolling:
- Automatically scrolls down to load more tracks
- Detects when no new tracks appear
- Collects unique tracks only
- Stops at 100 songs to avoid excessive scrolling

### Data Cleaning

The extension automatically cleans extracted data:

**Artist Name Cleaning:**
- Removes "feat." and "featuring" text
- Removes parenthetical credits
- Normalizes multiple commas
- Trims whitespace

**Title Cleaning:**
- Removes "Single", "Version", "Remastered" suffixes
- Removes parenthetical remaster information
- Trims whitespace

**Duplicate Removal:**
- Uses title + artist combination as unique key
- Ensures no duplicate songs are imported

## Troubleshooting

### Extension doesn't detect Spotify playlist

**Solution:** Make sure you're on a Spotify playlist page:
- URL should be: `open.spotify.com/playlist/...`
- Not on the home page, artist page, or album page

### Extension shows "No songs found"

**Possible causes:**
1. Playlist is empty
2. Spotify hasn't loaded the track list yet
3. Spotify changed their DOM structure

**Solutions:**
1. Refresh the Spotify page
2. Scroll down to load more tracks
3. Use the manual paste importer as fallback

### Import fails with "VibeCraft server not running"

**Solution:** Make sure VibeCraft is running:
```bash
cd C:\Users\Admin\Desktop\music-app
npm start
```

### Import shows "X songs could not be found"

**This is normal:** Some songs may not have good YouTube matches

**Solutions:**
1. Try importing the problematic songs manually via YouTube
2. Check if the song title/artist is correct
3. The manual paste importer will show which songs failed

### Extension icon doesn't appear

**Solution:** 
1. Check chrome://extensions
2. Make sure VibeCraft extension is enabled
3. Pin the extension to your toolbar for easy access

## Security & Privacy

### What the extension does:
- Reads Spotify playlist DOM (song titles and artists only)
- Sends track data to your local VibeCraft server
- No audio is downloaded or extracted
- No Spotify authentication credentials are used

### What the extension does NOT do:
- Does not access your Spotify account
- Does not use Spotify's API
- Does not download or extract audio
- Does not bypass any Spotify restrictions
- Does not send data to external servers (only your local VibeCraft)

### Permissions:
- `activeTab` - Access current tab to read Spotify DOM
- `scripting` - Inject content script into Spotify page
- `https://open.spotify.com/*` - Read Spotify playlist pages
- `http://localhost:3000/*` - Send data to your local VibeCraft server

## Limitations

### Spotify Website Changes

Spotify may change their website structure, which could break the DOM extraction. If this happens:
- The manual paste importer will still work
- The extension will need to be updated

### Virtual Scrolling

Spotify uses virtual scrolling for large playlists, so:
- Only visible tracks are initially extracted
- Extension scrolls to load more tracks
- Limited to 100 songs to avoid excessive scrolling
- Very large playlists (>100 songs) may need manual importing

### Browser Compatibility

Currently only supports Chromium-based browsers:
- Google Chrome
- Microsoft Edge
- Brave
- Opera

Firefox support could be added if needed.

## Fallback to Manual Import

If the automatic import doesn't work, you can always use the manual paste importer:

1. In VibeCraft, click "Paste Spotify song list"
2. Copy songs from Spotify (select text, copy)
3. Paste into the textarea
4. Click "Import Songs"

The manual importer supports these formats:
```
Format 1: Title - Artist
Tum Hi Ho - Arijit Singh
Apna Bana Le - Arijit Singh

Format 2: Title on one line, Artist on next
Tum Hi Ho
Arijit Singh

Format 3: Title only
Tum Hi Ho
Apna Bana Le
```

## Uninstallation

To remove the extension:

1. Go to `chrome://extensions`
2. Find "VibeCraft Spotify Import"
3. Click "Remove"
4. Confirm removal

The manual paste importer in VibeCraft will continue to work.

## Updates

If Spotify changes their website structure, the extension may need updates. The manual paste importer will always work as a fallback.

## Support

For issues or questions:
1. Check this installation guide
2. Try the manual paste importer
3. Verify VibeCraft is running
4. Check browser console for errors

## Technical Details

### Extension Files:
- `manifest.json` - Extension configuration
- `popup.html` - Extension popup UI
- `popup.js` - Popup logic and communication
- `content.js` - Spotify DOM extraction logic
- `background.js` - Background service worker

### Communication Flow:
```
Spotify Page (content.js)
    ↓
Extension Popup (popup.js)
    ↓
VibeCraft Server (localhost:3000)
    ↓
YouTube API Search
    ↓
VibeCraft Playlist
```

### API Endpoint:
- `POST http://localhost:3000/api/import-song-list`
- Accepts: `{ "songs": [{ "title": "...", "artist": "..." }] }`
- Returns: YouTube search results for each song

## Version History

- **v1.0.0** - Initial release
  - Basic DOM extraction
  - Manual paste fallback
  - Large playlist scrolling
  - Data cleaning and deduplication
