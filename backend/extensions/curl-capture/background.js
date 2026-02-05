/**
 * Background Service Worker for cURL Capture Extension
 * Captures network requests and generates cURL commands
 */

// Store captured requests
const capturedRequests = new Map();

// Listen for web requests
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.url.includes('line-chrome-gw.line-apps.com') && 
        details.url.includes('getRecentMessagesV2')) {
      
      const requestData = {
        url: details.url,
        method: details.method,
        requestBody: details.requestBody,
        timestamp: Date.now()
      };
      
      capturedRequests.set(details.requestId, requestData);
      console.log('[cURL Capture] Request captured:', details.url);
    }
  },
  { urls: ['https://line-chrome-gw.line-apps.com/*'] },
  ['requestBody']
);

// Listen for request headers
chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    if (capturedRequests.has(details.requestId)) {
      const requestData = capturedRequests.get(details.requestId);
      requestData.headers = details.requestHeaders;
      
      // Generate cURL command
      const curlCommand = generateCurlCommand(requestData);
      requestData.curlCommand = curlCommand;
      
      // Store in chrome.storage for access by devtools panel
      chrome.storage.local.set({
        lastCurlCapture: {
          url: requestData.url,
          curlCommand: curlCommand,
          timestamp: requestData.timestamp
        }
      });
      
      // Send message to devtools panel
      chrome.runtime.sendMessage({
        type: 'CURL_CAPTURED',
        data: {
          url: requestData.url,
          curlCommand: curlCommand
        }
      }).catch(() => {
        // DevTools panel might not be open
      });
      
      console.log('[cURL Capture] cURL generated:', curlCommand.substring(0, 100) + '...');
    }
  },
  { urls: ['https://line-chrome-gw.line-apps.com/*'] },
  ['requestHeaders', 'extraHeaders']
);

/**
 * Generate cURL command from request data (Chrome DevTools style)
 */
function generateCurlCommand(requestData) {
  let curl = `curl '${requestData.url}'`;
  
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
  if (requestData.headers) {
    for (const header of requestData.headers) {
      headerMap.set(header.name.toLowerCase(), { name: header.name, value: header.value });
    }
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
  if (requestData.requestBody) {
    let bodyData = '';
    if (requestData.requestBody.raw) {
      // Decode raw body
      const decoder = new TextDecoder();
      for (const part of requestData.requestBody.raw) {
        if (part.bytes) {
          bodyData += decoder.decode(part.bytes);
        }
      }
    } else if (requestData.requestBody.formData) {
      bodyData = JSON.stringify(requestData.requestBody.formData);
    }
    
    if (bodyData) {
      const escapedData = bodyData.replace(/'/g, "'\\''");
      curl += ` \\\n  --data-raw '${escapedData}'`;
    }
  }
  
  return curl;
}

// Listen for messages from devtools panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_LAST_CURL') {
    chrome.storage.local.get('lastCurlCapture', (result) => {
      sendResponse(result.lastCurlCapture || null);
    });
    return true; // Keep channel open for async response
  }
  
  if (message.type === 'CLEAR_CAPTURES') {
    capturedRequests.clear();
    chrome.storage.local.remove('lastCurlCapture');
    sendResponse({ success: true });
  }
});

console.log('[cURL Capture] Background service worker started');
