(function() {
  'use strict';

  const MAX_HEIGHT = 16000;
  const WAIT_TIME = 600;
  let backgroundPort = null;
  let isCapturing = false;

  async function startFullPageCapture() {
    if (isCapturing) {
      return;
    }

    isCapturing = true;
    const dpr = window.devicePixelRatio || 1;
    const viewportHeight = window.innerHeight;
    const totalScrollHeight = document.documentElement.scrollHeight;
    const totalHeight = totalScrollHeight * dpr;

    if (totalHeight > MAX_HEIGHT) {
      alert('Page is too tall. Maximum capture height is 16,000px.');
      isCapturing = false;
      return;
    }

    const originalScrollY = window.scrollY;
    const hiddenElements = hideFixedElements();
    const originalScrollBehavior = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = 'auto';

    const overlay = document.createElement('div');
    overlay.id = 'bundle-fullpage-overlay';
    overlay.style.cssText = [
      'position: fixed; top: 0; left: 0; width: 100%; height: 100%;',
      'z-index: 2147483646; background: rgba(0,0,0,0.5); cursor: wait;',
      'display: flex; align-items: center; justify-content: center;',
      'font-family: -apple-system, BlinkMacSystemFont, sans-serif;'
    ].join(' ');
    overlay.innerHTML = [
      '<div style="background: #1A1A1A; padding: 20px 32px; border-radius: 12px;',
      'color: white; text-align: center; box-shadow: 0 8px 32px rgba(0,0,0,0.4);">',
      '<div style="font-size: 16px; font-weight: 500; margin-bottom: 8px;">Capturing Full Page</div>',
      '<div id="bundle-capture-progress" style="font-size: 13px; color: #A0A0A0;">Preparing...</div>',
      '</div>'
    ].join('');
    document.body.appendChild(overlay);

    overlay.style.display = 'none';

    document.querySelectorAll('[data-tool]').forEach(function(el) {
      el.style.display = 'none';
    });

    await new Promise(function(resolve) {
      setTimeout(resolve, 150);
    });

    try {
      backgroundPort = chrome.runtime.connect({ name: 'fullpage-keepalive' });

      backgroundPort.onDisconnect.addListener(function() {
        backgroundPort = null;
      });

      await new Promise(function(resolve) {
        setTimeout(resolve, 100);
        resolve();
      });

      const numChunks = Math.ceil(totalScrollHeight / viewportHeight);
      const chunks = [];

      for (var i = 0; i < numChunks; i++) {
        window.scrollTo(0, i * viewportHeight);
        await sleep(WAIT_TIME);

        var progressEl = document.getElementById('bundle-capture-progress');
        if (progressEl) {
          progressEl.textContent = Math.round(((i + 1) / numChunks) * 100) + '%';
        }

        try {
          var chunk = await captureChunk(i);
          if (chunk && chunk.dataUrl) {
            chunks.push({ index: i, dataUrl: chunk.dataUrl });
          }
        } catch (e) {}

        await sleep(100);
      }

      if (chunks.length > 0) {
        overlay.style.display = 'flex';
        var progressEl2 = document.getElementById('bundle-capture-progress');
        if (progressEl2) progressEl2.textContent = 'Processing...';

        await new Promise(function(resolve, reject) {
          chrome.runtime.sendMessage({
            action: 'STITCH_FULL_PAGE',
            chunks: chunks,
            dimensions: {
              width: window.innerWidth * dpr,
              height: totalHeight,
              viewportHeight: viewportHeight * dpr
            }
          }, function(response) {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else if (response && !response.success) {
              reject(new Error(response.error));
            } else {
              resolve(response);
            }
          });
        });
      }

    } catch (error) {}

    finally {
      if (backgroundPort) {
        backgroundPort.disconnect();
        backgroundPort = null;
      }

      window.scrollTo(0, originalScrollY);
      document.documentElement.style.scrollBehavior = originalScrollBehavior;
      restoreFixedElements(hiddenElements);

      if (overlay && overlay.parentNode) {
        overlay.remove();
      }

      document.querySelectorAll('[data-tool]').forEach(function(el) {
        el.style.display = '';
      });

      isCapturing = false;
    }
  }

  function captureChunk(index) {
    return new Promise(function(resolve, reject) {
      chrome.runtime.sendMessage(
        { action: 'CAPTURE_CHUNK', index: index },
        function(response) {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        }
      );
    });
  }

  function hideFixedElements() {
    var hidden = [];
    var elements = document.querySelectorAll('*');
    for (var j = 0; j < elements.length; j++) {
      var el = elements[j];
      var style = window.getComputedStyle(el);
      if (style.position === 'fixed' || style.position === 'sticky') {
        hidden.push({ el: el, display: style.display });
        el.style.display = 'none';
      }
    }
    return hidden;
  }

  function restoreFixedElements(hidden) {
    for (var k = 0; k < hidden.length; k++) {
      hidden[k].el.style.display = hidden[k].display;
    }
  }

  function sleep(ms) {
    return new Promise(function(resolve) {
      setTimeout(resolve, ms);
    });
  }

  if (chrome && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
      if (request.action === 'START_FULL_PAGE_CAPTURE') {
        startFullPageCapture()
          .then(function() {
            sendResponse({ success: true });
          })
          .catch(function(error) {
            sendResponse({ success: false, error: error.message });
          });
        return true;
      }
    });
  }
})();
