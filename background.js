(function() {
  'use strict';

  self.addEventListener('error', (event) => {
    event.preventDefault();
  });

  self.addEventListener('unhandledrejection', (event) => {
    event.preventDefault();
  });

  const activePorts = new Map();

  chrome.runtime.onConnect.addListener((port) => {
    activePorts.set(port.name, port);

    port.onMessage.addListener((message) => {
      if (message.action === 'CAPTURE_SELECTION') {
        captureViaOffscreen(message.coords, message.tabId, port)
          .then((result) => {
            port.postMessage({ action: 'CAPTURE_SELECTION_RESPONSE', response: result });
          })
          .catch((error) => {
            port.postMessage({ action: 'CAPTURE_SELECTION_RESPONSE', response: { success: false, error: error.message } });
          });
      }

      if (message.action === 'FULLPAGE_READY') {
        port.postMessage({ action: 'BACKGROUND_READY' });
      }
    });

    port.onDisconnect.addListener(() => {
      activePorts.delete(port.name);
    });
  });

  chrome.alarms.create('keep-alive', { periodInMinutes: 0.5 });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'keep-alive') {}
  });

  let offscreenDocument = null;

  async function ensureOffscreenDocument() {
    try {
      const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [chrome.runtime.getURL('offscreen.html')]
      });

      if (existingContexts.length > 0) {
        offscreenDocument = existingContexts[0];
        return offscreenDocument;
      }

      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['DOM_PARSER'],
        justification: 'Full-page screenshot stitching and area cropping require DOM canvas support'
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      const contexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [chrome.runtime.getURL('offscreen.html')]
      });

      offscreenDocument = contexts[0] || true;
      return offscreenDocument;
    } catch (error) {
      throw error;
    }
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'COLOR_PICKED') {
      return true;
    }

    if (request.action === 'CAPTURE_SELECTION') {
      captureViaOffscreen(request.coords, request.tabId)
        .then((result) => {
          sendResponse(result);
        })
        .catch((error) => {
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
      stitchFullPageViaOffscreen(request.chunks, request.dimensions)
        .then((result) => {
          sendResponse(result);
        })
        .catch((error) => {
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

    if (request.action === 'DOWNLOAD_BLOB') {
      try {
        chrome.downloads.download({
          url: request.url,
          filename: request.filename,
          saveAs: true
        }, (id) => {
          if (chrome.runtime.lastError) {}
          setTimeout(() => {
            chrome.offscreen.closeDocument().catch(() => {});
          }, 1000);
        });
      } catch (error) {}
      return true;
    }

    if (request.action === 'STITCH_DONE') {
      return true;
    }

    if (request.action === 'STITCH_MEMORY_ERROR') {
      return true;
    }
  });

  async function captureViaOffscreen(coords, tabId, port) {
    try {
      let targetTabId = tabId;

      if (targetTabId) {
        try {
          const tab = await chrome.tabs.get(targetTabId);
        } catch (e) {
          targetTabId = null;
        }
      }

      if (!targetTabId) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) {
          throw new Error('No active tab found');
        }
        targetTabId = tab.id;
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      const tab = await chrome.tabs.get(targetTabId);
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
        format: 'png',
        quality: 100
      });

      if (chrome.runtime.lastError) {
        throw new Error(chrome.runtime.lastError.message);
      }

      if (!dataUrl) {
        throw new Error('Unable to capture - tab may be restricted or not loaded');
      }

      await ensureOffscreenDocument();

      let response;
      try {
        response = await chrome.runtime.sendMessage({
          action: 'CROP_AND_DOWNLOAD',
          dataUrl: dataUrl,
          coords: coords
        });
      } catch (error) {
        if (error.message.includes('Receiving end does not exist')) {
          throw new Error('Processing context lost. Please try again.');
        }
        throw error;
      }

      if (!response || !response.success) {
        throw new Error(response?.error || 'Cropping failed in offscreen');
      }

      return { success: true };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

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
      return { success: false, error: error.message };
    }
  }

  async function stitchFullPageViaOffscreen(chunks, dimensions) {
    const MAX_HEIGHT = 16000;
    if (dimensions.height > MAX_HEIGHT) {
      return { success: false, error: 'Image too tall (' + dimensions.height + 'px). Maximum is ' + MAX_HEIGHT + 'px.' };
    }

    try {
      await ensureOffscreenDocument();

      let response;
      try {
        response = await chrome.runtime.sendMessage({
          action: 'STITCH_AND_DOWNLOAD',
          chunks: chunks,
          dimensions: dimensions
        });
      } catch (error) {
        if (error.message.includes('Receiving end does not exist')) {
          throw new Error('Processing context lost. Please try again.');
        }
        throw error;
      }

      if (!response || !response.success) {
        throw new Error(response?.error || 'Stitching failed in offscreen');
      }

      return { success: true, stitchingComplete: true };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }
})();
