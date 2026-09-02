// VibeCraft Background Service Worker
// Handles extension lifecycle and background tasks

chrome.runtime.onInstalled.addListener(() => {
  console.log('VibeCraft Spotify Import extension installed');
});

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
  // Open popup (default behavior)
  chrome.action.openPopup();
});
