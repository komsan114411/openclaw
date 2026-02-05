/**
 * DevTools Panel for cURL Capture
 * Creates a panel in Chrome DevTools to display captured cURL commands
 */

// Create DevTools panel
chrome.devtools.panels.create(
  'cURL Capture',
  'icon16.png',
  'panel.html',
  (panel) => {
    console.log('[cURL Capture] DevTools panel created');
  }
);

// Also hook into Network panel
chrome.devtools.network.onRequestFinished.addListener((request) => {
  if (request.request.url.includes('line-chrome-gw.line-apps.com') &&
      request.request.url.includes('getRecentMessagesV2')) {
    
    // Get request as HAR entry and convert to cURL
    request.getContent((content, encoding) => {
      const curlCommand = harToCurl(request);
      
      // Store in chrome.storage
      chrome.storage.local.set({
        lastCurlCapture: {
          url: request.request.url,
          curlCommand: curlCommand,
          timestamp: Date.now()
        }
      });
      
      console.log('[cURL Capture] Captured from Network panel:', curlCommand.substring(0, 100) + '...');
    });
  }
});

/**
 * Convert HAR request to cURL command (Chrome DevTools style)
 */
function harToCurl(harEntry) {
  const request = harEntry.request;
  let curl = `curl '${request.url}'`;
  
  // Chrome DevTools header order
  const headerOrder = [
    'accept',
    'accept-encoding',
    'accept-language',
    'content-type',
    'cookie',
    'origin',
    'priority',
    'referer',
    'sec-ch-ua',
    'sec-ch-ua-mobile',
    'sec-ch-ua-platform',
    'sec-fetch-dest',
    'sec-fetch-mode',
    'sec-fetch-site',
    'sec-fetch-storage-access',
    'user-agent',
    'x-hmac',
    'x-lal',
    'x-line-access',
    'x-line-chrome-version'
  ];
  
  // Create header map (case-insensitive)
  const headerMap = new Map();
  for (const header of request.headers) {
    headerMap.set(header.name.toLowerCase(), header);
  }
  
  const addedHeaders = new Set();
  
  // Add headers in Chrome DevTools order
  for (const headerName of headerOrder) {
    const header = headerMap.get(headerName);
    if (header) {
      if (headerName === 'cookie') {
        curl += ` \\\n  -b '${header.value}'`;
      } else {
        curl += ` \\\n  -H '${headerName}: ${header.value}'`;
      }
      addedHeaders.add(headerName);
    }
  }
  
  // Add remaining headers
  for (const [name, header] of headerMap) {
    if (!addedHeaders.has(name) && !name.startsWith(':')) {
      if (name === 'cookie') {
        curl += ` \\\n  -b '${header.value}'`;
      } else {
        curl += ` \\\n  -H '${name}: ${header.value}'`;
      }
    }
  }
  
  // Add request body
  if (request.postData && request.postData.text) {
    const escapedData = request.postData.text.replace(/'/g, "'\\''");
    curl += ` \\\n  --data-raw '${escapedData}'`;
  }
  
  return curl;
}

console.log('[cURL Capture] DevTools script loaded');
