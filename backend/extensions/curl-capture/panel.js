/**
 * Panel script for cURL Capture DevTools panel
 */

let currentCurl = null;

// Load last captured cURL on panel open
function loadLastCapture() {
  chrome.storage.local.get('lastCurlCapture', (result) => {
    if (result.lastCurlCapture) {
      displayCapture(result.lastCurlCapture);
    }
  });
}

// Display captured cURL
function displayCapture(capture) {
  currentCurl = capture.curlCommand;
  
  const content = document.getElementById('content');
  const timestamp = new Date(capture.timestamp).toLocaleString();
  
  content.innerHTML = `
    <div class="curl-container">
      <div class="curl-url">${capture.url}</div>
      <div class="curl-command">${escapeHtml(capture.curlCommand)}</div>
      <div class="timestamp">Captured: ${timestamp}</div>
    </div>
  `;
  
  document.getElementById('copyBtn').style.display = 'inline-block';
}

// Escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Copy to clipboard
function copyToClipboard() {
  if (currentCurl) {
    navigator.clipboard.writeText(currentCurl).then(() => {
      showStatus('✅ Copied to clipboard!');
    }).catch((err) => {
      showStatus('❌ Failed to copy: ' + err);
    });
  }
}

// Show status message
function showStatus(message) {
  const status = document.getElementById('status');
  status.textContent = message;
  setTimeout(() => {
    status.textContent = '';
  }, 3000);
}

// Clear captures
function clearCaptures() {
  chrome.runtime.sendMessage({ type: 'CLEAR_CAPTURES' }, () => {
    currentCurl = null;
    document.getElementById('content').innerHTML = `
      <div class="empty">
        <p>Waiting for LINE API requests...</p>
        <p style="font-size: 11px;">Navigate to LINE Chrome Extension and trigger a message fetch</p>
      </div>
    `;
    document.getElementById('copyBtn').style.display = 'none';
    showStatus('🗑️ Cleared');
  });
}

// Listen for new captures
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'CURL_CAPTURED') {
    displayCapture({
      url: message.data.url,
      curlCommand: message.data.curlCommand,
      timestamp: Date.now()
    });
    showStatus('🔔 New cURL captured!');
  }
});

// Event listeners
document.getElementById('copyBtn').addEventListener('click', copyToClipboard);
document.getElementById('refreshBtn').addEventListener('click', loadLastCapture);
document.getElementById('clearBtn').addEventListener('click', clearCaptures);

// Load on startup
loadLastCapture();

console.log('[cURL Capture] Panel loaded');
