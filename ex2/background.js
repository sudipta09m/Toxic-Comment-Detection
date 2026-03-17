// background.js (MV3-safe)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.action === 'download') {
    try {
      const filename = msg.filename || 'download.json';
      const content = msg.content || '';
      // Create a data URL (works in service worker)
      const url = 'data:application/json;charset=utf-8,' + encodeURIComponent(content);
      chrome.downloads.download({
        url,
        filename,
        saveAs: true
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          console.error('download error', chrome.runtime.lastError);
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ success: true, downloadId });
        }
      });
    } catch (err) {
      console.error('background download failed', err);
      sendResponse({ success: false, error: err.message });
    }
    return true; // will respond asynchronously
  }
});
