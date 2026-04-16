(function() {
  'use strict';

  let isSelecting = false;
  let startX = 0, startY = 0;
  let currentX = 0, currentY = 0;
  let overlay = null;
  let selectionBox = null;
  let dimensions = null;
  let captureBar = null;
  let isLocked = false;
  let backgroundPort = null;
  let portReady = false;
  let currentTabId = null;

  function connectToBackground() {
    return new Promise((resolve) => {
      try {
        backgroundPort = chrome.runtime.connect({ name: 'selection-port' });

        backgroundPort.onMessage.addListener((message) => {
          console.log('Received from background:', message);

          if (message.action === 'CAPTURE_SELECTION_RESPONSE') {
            handleCaptureResponse(message.response);
          }
        });

        backgroundPort.onDisconnect.addListener(() => {
          console.log('Background port disconnected');
          backgroundPort = null;
          portReady = false;
        });

        // Port is ready immediately on successful connect()
        portReady = true;
        resolve(true);

      } catch (e) {
        console.error('Failed to connect to background:', e.message);
        resolve(false);
      }
    });
  }

  async function ensurePortConnection() {
    if (backgroundPort && portReady) {
      return true;
    }
    
    console.log('Ensuring port connection...');
    return await connectToBackground();
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'INIT_SELECTION') {
      currentTabId = request.tabId;
      console.log('Stored tab ID:', currentTabId);
      ensurePortConnection().then(() => {
        init();
        sendResponse({ success: true });
      });
      return true;
    }
  });

  function init() {
    cleanup();

    overlay = document.createElement('div');
    overlay.id = 'bundle-selection-overlay';
    document.body.appendChild(overlay);

    selectionBox = document.createElement('div');
    selectionBox.id = 'bundle-selection-box';
    document.body.appendChild(selectionBox);

    dimensions = document.createElement('div');
    dimensions.id = 'bundle-selection-dimensions';
    dimensions.style.display = 'none';
    document.body.appendChild(dimensions);

    overlay.addEventListener('mousedown', onMouseDown);
    overlay.addEventListener('mousemove', onMouseMove);
    overlay.addEventListener('mouseup', onMouseUp);
    document.addEventListener('keydown', onKeyDown);

    drawOverlay();
  }

  function drawOverlay() {
    overlay.style.background = 'rgba(0, 0, 0, 0.5)';

    if (isSelecting || isLocked) {
      const rect = getSelectionRect();

      const x = Math.min(startX, currentX);
      const y = Math.min(startY, currentY);
      const w = Math.abs(currentX - startX);
      const h = Math.abs(currentY - startY);

      selectionBox.style.left = x + 'px';
      selectionBox.style.top = y + 'px';
      selectionBox.style.width = w + 'px';
      selectionBox.style.height = h + 'px';
      selectionBox.style.display = w > 0 && h > 0 ? 'block' : 'none';

      if (w > 10 && h > 10) {
        dimensions.textContent = `${Math.round(w)} × ${Math.round(h)}`;
        dimensions.style.display = 'block';
        dimensions.style.left = (x + w / 2 - dimensions.offsetWidth / 2) + 'px';
        dimensions.style.top = (y - dimensions.offsetHeight - 8) + 'px';
      } else {
        dimensions.style.display = 'none';
      }

      if (isLocked && w > 10 && h > 10) {
        showCaptureBar(rect);
      }
    } else {
      selectionBox.style.display = 'none';
      dimensions.style.display = 'none';
    }
  }

  function getSelectionRect() {
    return {
      startX: Math.min(startX, currentX),
      startY: Math.min(startY, currentY),
      endX: Math.max(startX, currentX),
      endY: Math.max(startY, currentY),
      width: Math.abs(currentX - startX),
      height: Math.abs(currentY - startY)
    };
  }

  function onMouseDown(e) {
    if (isLocked) return;

    isSelecting = true;
    startX = e.clientX;
    startY = e.clientY;
    currentX = startX;
    currentY = startY;

    hideCaptureBar();
    drawOverlay();
  }

  function onMouseMove(e) {
    if (!isSelecting) return;

    currentX = e.clientX;
    currentY = e.clientY;
    drawOverlay();
  }

  function onMouseUp(e) {
    if (!isSelecting) return;

    isSelecting = false;
    isLocked = true;

    const rect = getSelectionRect();
    if (rect.width < 10 || rect.height < 10) {
      cleanup();
      return;
    }

    drawOverlay();
  }

  function showCaptureBar(rect) {
    hideCaptureBar();

    captureBar = document.createElement('div');
    captureBar.id = 'bundle-capture-bar';

    const captureBtn = document.createElement('button');
    captureBtn.className = 'bundle-btn';
    captureBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="5" width="18" height="14" rx="2"/>
        <circle cx="12" cy="12" r="3"/>
      </svg>
      Capture
    `;
    captureBtn.onclick = async (e) => {
      e.stopPropagation();
      captureBtn.innerHTML = 'Capturing...';
      captureBtn.disabled = true;
      await captureSelection();
    };

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'bundle-btn bundle-btn-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = (e) => {
      e.stopPropagation();
      cleanup();
    };

    captureBar.appendChild(captureBtn);
    captureBar.appendChild(cancelBtn);
    document.body.appendChild(captureBar);

    const barX = rect.startX + rect.width / 2 - 75;
    const barY = rect.endY + 12;
    captureBar.style.left = Math.max(10, barX) + 'px';
    captureBar.style.top = Math.min(barY, window.innerHeight - 60) + 'px';
  }

  function hideCaptureBar() {
    if (captureBar) {
      captureBar.remove();
      captureBar = null;
    }
  }

async function captureSelection() {
  const rect = getSelectionRect();
  const dpr = window.devicePixelRatio || 1;

  const cropArea = {
    x: rect.startX * dpr,
    y: rect.startY * dpr,
    w: rect.width * dpr,
    h: rect.height * dpr
  };

  console.log('Attempting to capture with coords:', cropArea);

  hideOverlayForCapture();

  // Try multiple times with delays to wake up service worker
  const maxRetries = 3;
    let success = false;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      console.log(`Capture attempt ${attempt} of ${maxRetries}`);
      
      // Try to ensure connection
      await ensurePortConnection();
      
      // Wait for service worker to potentially wake up
      await new Promise(resolve => setTimeout(resolve, 300 * attempt));

      if (backgroundPort && portReady) {
        try {
          backgroundPort.postMessage({
            action: 'CAPTURE_SELECTION',
            coords: cropArea,
            tabId: currentTabId
          });
          success = true;
          break;
        } catch (e) {
          console.error('Port post error:', e.message);
        }
      } else {
        // Try sendMessage as fallback
        console.log('Port not ready, trying sendMessage fallback');
        await sendMessageFallback(cropArea);
        success = true;
        break;
      }
    }

    if (!success) {
      console.error('All capture attempts failed');
      resetCaptureButton();
    }
  }

  async function sendMessageFallback(coords) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        action: 'CAPTURE_SELECTION',
        coords: coords,
        tabId: currentTabId
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('sendMessage fallback failed:', chrome.runtime.lastError.message);
          handleCaptureResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
          handleCaptureResponse(response);
        }
        resolve();
      });
    });
  }

  function handleCaptureResponse(response) {
    console.log('Capture response:', response);
    
    if (response?.success) {
      cleanup();
    } else {
      console.error('Capture failed:', response?.error);
      resetCaptureButton();
    }
  }

  function resetCaptureButton() {
    const btn = captureBar?.querySelector('.bundle-btn');
    if (btn) {
      btn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="5" width="18" height="14" rx="2"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
        Capture
      `;
      btn.disabled = false;
    }
  }

  function hideOverlayForCapture() {
    if (overlay) {
      overlay.style.display = 'none';
    }
    if (selectionBox) {
      selectionBox.style.display = 'none';
    }
    if (dimensions) {
      dimensions.style.display = 'none';
    }
    hideCaptureBar();
  }

  function cleanup() {
    if (overlay) {
      overlay.remove();
      overlay = null;
    }
    if (selectionBox) {
      selectionBox.remove();
      selectionBox = null;
    }
    if (dimensions) {
      dimensions.remove();
      dimensions = null;
    }
    hideCaptureBar();
    isSelecting = false;
    isLocked = false;
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      cleanup();
    }
  }
})();