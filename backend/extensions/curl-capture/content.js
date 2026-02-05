/**
 * Content script for cURL Capture Extension
 * Injects into pages to communicate with background script
 */

// Listen for messages from the page
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  
  if (event.data.type === 'CURL_CAPTURE_REQUEST') {
    // Forward to background script
    chrome.runtime.sendMessage({
      type: 'PAGE_REQUEST',
      data: event.data.data
    });
  }
});

// Notify page that extension is loaded
window.postMessage({ type: 'CURL_CAPTURE_READY' }, '*');

console.log('[cURL Capture] Content script loaded');
