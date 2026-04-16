// Active port connections to keep service worker alive
const activePorts = new Map();

chrome.runtime.onConnect.addListener((port) => {
  console.log('[Background] Port connected:', port.name);

  activePorts.set(port.name, port);

  port.onMessage.addListener((message) => {
    console.log('[Background] Port received:', message.action);

    if (message.action === 'CAPTURE_SELECTION') {
      captureAndCrop(message.coords, message.tabId)
        .then((result) => {
          port.postMessage({ action: 'CAPTURE_SELECTION_RESPONSE', response: result });
        })
        .catch((error) => {
          port.postMessage({ action: 'CAPTURE_SELECTION_RESPONSE', response: { success: false, error: error.message } });
        });
    }

    if (message.action === 'FULLPAGE_READY') {
      console.log('[Background] Fullpage capture ready');
      port.postMessage({ action: 'BACKGROUND_READY' });
    }
  });

  port.onDisconnect.addListener(() => {
    console.log('[Background] Port disconnected:', port.name);
    activePorts.delete(port.name);
  });
});

// Keep service worker alive with a simple alarm
chrome.alarms.create('keep-alive', { periodInMinutes: 0.5 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keep-alive') {
    console.log('[Background] Keep-alive');
  }
});

// Offscreen document management
let offscreenDocument = null;

async function ensureOffscreenDocument() {
  console.log('[Background] Checking for existing offscreen document');

  try {
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [chrome.runtime.getURL('offscreen.html')]
    });

    if (existingContexts.length > 0) {
      console.log('[Background] Existing offscreen document found');
      offscreenDocument = existingContexts[0];
      return offscreenDocument;
    }

    console.log('[Background] Creating new offscreen document');

    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['DOM_PARSER'],
      justification: 'Full-page screenshot stitching requires DOM canvas support'
    });

    // Wait for offscreen to initialize
    await new Promise(resolve => setTimeout(resolve, 200));

    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [chrome.runtime.getURL('offscreen.html')]
    });

    offscreenDocument = contexts[0] || true;
    console.log('[Background] Offscreen document created successfully');
    return offscreenDocument;
  } catch (error) {
    console.error('[Background] Failed to create offscreen document:', error);
    throw error;
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[Background] Message received:', request.action);

  if (request.action === 'COLOR_PICKED') {
    console.log('[Background] Color picked:', request.value);
    return;
  }

  if (request.action === 'CAPTURE_SELECTION') {
    captureAndCrop(request.coords, request.tabId)
      .then((result) => {
        console.log('[Background] Capture result:', result);
        sendResponse(result);
      })
      .catch((error) => {
        console.error('[Background] Capture error:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (request.action === 'CAPTURE_CHUNK') {
    captureChunk()
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'STITCH_FULL_PAGE') {
    console.log('[Background] Received STITCH_FULL_PAGE request');
    stitchFullPageViaOffscreen(request.chunks, request.dimensions)
      .then((result) => {
        console.log('[Background] Stitch result:', result);
        sendResponse(result);
      })
      .catch((error) => {
        console.error('[Background] Stitch error:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (request.action === 'START_FULLPAGE_CAPTURE') {
    ensureOffscreenDocument()
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'STITCH_DONE') {
    console.log('[Background] Download started:', request.filename, 'ID:', request.downloadId);
    return true;
  }

  if (request.action === 'STITCH_MEMORY_ERROR') {
    console.error('[Background] Memory error:', request.error);
    return true;
  }

  if (request.action === 'DOWNLOAD_BLOB') {
    console.log('[Background] Downloading blob:', request.filename);

    try {
      chrome.downloads.download({
        url: request.url,
        filename: request.filename,
        saveAs: true
      }, (id) => {
        if (chrome.runtime.lastError) {
          console.error('[Background] DOWNLOAD ERROR:', chrome.runtime.lastError.message);
        } else {
          console.log('[Background] Download started, ID:', id);
        }

        // Close offscreen document after short delay
        setTimeout(() => {
          console.log('[Background] Closing offscreen document');
          chrome.offscreen.closeDocument().catch(() => {
            // Ignore errors if already closed
          });
        }, 1000);
      });
    } catch (error) {
      console.error('[Background] Download system error:', error);
    }

    return true;
  }
});

// Area selection screenshot - uses OffscreenCanvas (small images work fine here)
async function captureAndCrop(coords, tabId) {
  console.log('[Background] Starting capture with coords:', coords, 'tabId:', tabId);

  try {
    let targetTabId = tabId;

    if (targetTabId) {
      try {
        const tab = await chrome.tabs.get(targetTabId);
        console.log('[Background] Tab validated:', tab.id, tab.title);
      } catch (e) {
        console.log('[Background] Tab no longer exists, finding current active tab');
        targetTabId = null;
      }
    }

    if (!targetTabId) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        throw new Error('No active tab found');
      }
      targetTabId = tab.id;
      console.log('[Background] Using current active tab:', targetTabId);
    }

    await new Promise(resolve => setTimeout(resolve, 100));

    console.log('[Background] Capturing tab:', targetTabId);

    const tab = await chrome.tabs.get(targetTabId);
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: 'png',
      quality: 100
    });

    if (chrome.runtime.lastError) {
      console.error('[Background] CaptureVisibleTab error:', chrome.runtime.lastError.message);
      throw new Error(chrome.runtime.lastError.message);
    }

    if (!dataUrl) {
      throw new Error('Unable to capture - tab may be restricted or not loaded');
    }

    console.log('[Background] Screenshot captured, size:', dataUrl.length);

    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const img = await createImageBitmap(blob);

    const canvas = new OffscreenCanvas(coords.w, coords.h);
    const ctx = canvas.getContext('2d');

    ctx.drawImage(
      img,
      coords.x, coords.y, coords.w, coords.h,
      0, 0, coords.w, coords.h
    );

    const croppedBlob = await canvas.convertToBlob({
      type: 'image/png'
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `screenshot-${timestamp}.png`;

    console.log('[Background] Starting download:', filename);

    const blobUrl = URL.createObjectURL(croppedBlob);

    chrome.downloads.download({
      url: blobUrl,
      filename: filename,
      saveAs: true
    }, (id) => {
      if (chrome.runtime.lastError) {
        console.error('[Background] DOWNLOAD ERROR:', chrome.runtime.lastError.message);
      } else {
        console.log('[Background] Download started, ID:', id);
      }
    });

    setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);

    console.log('[Background] Download initiated successfully');
    return { success: true };
  } catch (error) {
    console.error('[Background] CaptureAndCrop error:', error.message);
    return { success: false, error: error.message };
  }
}

// Capture a single viewport chunk for full-page capture
async function captureChunk() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      throw new Error('No active tab found');
    }

    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: 'png',
      quality: 100
    });

    if (chrome.runtime.lastError) {
      throw new Error(chrome.runtime.lastError.message);
    }

    return { success: true, dataUrl };
  } catch (error) {
    console.error('[Background] Capture chunk error:', error.message);
    return { success: false, error: error.message };
  }
}

// Orchestrator - sends chunks to offscreen for stitching and download
async function stitchFullPageViaOffscreen(chunks, dimensions) {
  console.log('[Background] Starting offscreen stitch');
  console.log('[Background] Chunks:', chunks.length);
  console.log('[Background] Dimensions:', dimensions);

  // Height validation
  const MAX_HEIGHT = 16000;
  if (dimensions.height > MAX_HEIGHT) {
    console.error('[Background] Image too tall:', dimensions.height);
    return { success: false, error: `Image too tall (${dimensions.height}px). Maximum is ${MAX_HEIGHT}px.` };
  }

  try {
    // Ensure offscreen document exists
    await ensureOffscreenDocument();
    console.log('[Background] Offscreen document ready');

    console.log('[Background] Sending chunks to offscreen for stitching');

    // Send chunks to offscreen - offscreen.js handles the stitching and download
    const response = await chrome.runtime.sendMessage({
      action: 'STITCH_CHUNKS',
      chunks: chunks,
      dimensions: dimensions
    });

    console.log('[Background] Offscreen response:', response);

    if (!response || !response.success) {
      throw new Error(response?.error || 'Stitching failed in offscreen');
    }

    console.log('[Background] Stitch initiated - offscreen will handle download');
    return { success: true, stitchingComplete: true };

  } catch (error) {
    console.error('[Background] Error:', error.message);
    return { success: false, error: error.message };
    // No fallback - offscreen.js is the only stitcher
  }
}
