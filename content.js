let canvas = null;
let ctx = null;
let isSelecting = false;
let isLocked = false;
let startX = 0, startY = 0;
let currentX = 0, currentY = 0;
let selection = null;
let captureBar = null;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'OPEN_PICKER') {
    console.log("Picker triggered");
    setTimeout(() => {
      openColorPicker();
    }, 100);
    return { success: true };
  }
  
  if (request.action === 'startSelection') {
    initSelection();
    return { success: true };
  }
});

function initSelection() {
  cleanup();

  canvas = document.createElement('canvas');
  canvas.id = 'bundle-selection-canvas';
  canvas.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    z-index: 2147483647;
    cursor: crosshair;
    user-select: none;
  `;

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  ctx = canvas.getContext('2d');
  document.body.appendChild(canvas);

  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseup', onMouseUp);
  document.addEventListener('keydown', onKeyDown);

  drawOverlay();
}

function drawOverlay() {
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (isSelecting || isLocked) {
    const rect = getSelectionRect();

    ctx.clearRect(rect.x, rect.y, rect.w, rect.h);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

    ctx.strokeStyle = '#10B981';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 4]);
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);

    ctx.setLineDash([]);
    drawGrid(rect);

    drawDimensions(rect);

    if (isLocked) {
      showCaptureBar(rect);
    }
  }
}

function drawGrid(rect) {
  ctx.strokeStyle = 'rgba(16, 185, 129, 0.15)';
  ctx.lineWidth = 1;

  const gridSize = 20;
  
  for (let x = rect.x + gridSize; x < rect.x + rect.w; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, rect.y);
    ctx.lineTo(x, rect.y + rect.h);
    ctx.stroke();
  }

  for (let y = rect.y + gridSize; y < rect.y + rect.h; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(rect.x, y);
    ctx.lineTo(rect.x + rect.w, y);
    ctx.stroke();
  }
}

function drawDimensions(rect) {
  const text = `${Math.round(rect.w)} × ${Math.round(rect.h)}`;
  const padding = 8;
  const fontSize = 13;

  ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
  const metrics = ctx.measureText(text);
  const textWidth = metrics.width + padding * 2;
  const textHeight = fontSize + padding * 2;

  const labelX = rect.x + rect.w / 2 - textWidth / 2;
  const labelY = rect.y - textHeight - 8;

  if (labelY > 10) {
    ctx.fillStyle = '#0F0F0F';
    ctx.beginPath();
    ctx.roundRect(labelX, labelY, textWidth, textHeight, 4);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, rect.x + rect.w / 2, labelY + textHeight / 2);
  }
}

function getSelectionRect() {
  const x = Math.min(startX, currentX);
  const y = Math.min(startY, currentY);
  const w = Math.abs(currentX - startX);
  const h = Math.abs(currentY - startY);
  return { x, y, w, h };
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
  if (rect.w < 10 || rect.h < 10) {
    cleanup();
    return;
  }

  drawOverlay();
}

function showCaptureBar(rect) {
  hideCaptureBar();

  captureBar = document.createElement('div');
  captureBar.id = 'bundle-capture-bar';
  captureBar.style.cssText = `
    position: fixed;
    z-index: 2147483648;
    display: flex;
    gap: 8px;
    padding: 8px;
    background: #1A1A1A;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
  `;

  const captureBtn = document.createElement('button');
  captureBtn.id = 'bundle-capture-btn';
  captureBtn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="3" y="5" width="18" height="14" rx="2"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
    Capture
  `;
  captureBtn.style.cssText = `
    background: #10B981;
    color: white;
    border: none;
    padding: 8px 14px;
    border-radius: 6px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: background 150ms;
  `;
  captureBtn.onmouseenter = () => captureBtn.style.background = '#059669';
  captureBtn.onmouseleave = () => captureBtn.style.background = '#10B981';

  const cancelBtn = document.createElement('button');
  cancelBtn.id = 'bundle-capture-cancel';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.cssText = `
    background: #333;
    color: white;
    border: none;
    padding: 8px 14px;
    border-radius: 6px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background 150ms;
  `;
  cancelBtn.onmouseenter = () => cancelBtn.style.background = '#444';
  cancelBtn.onmouseleave = () => cancelBtn.style.background = '#333';

  captureBtn.onclick = async (e) => {
    e.stopPropagation();
    captureBtn.innerHTML = 'Capturing...';
    captureBtn.disabled = true;
    await captureSelection();
  };

  cancelBtn.onclick = (e) => {
    e.stopPropagation();
    cleanup();
  };

  captureBar.appendChild(captureBtn);
  captureBar.appendChild(cancelBtn);
  document.body.appendChild(captureBar);

  const barX = rect.x + rect.w / 2 - 75;
  const barY = rect.y + rect.h + 12;
  captureBar.style.left = `${Math.max(10, barX)}px`;
  captureBar.style.top = `${Math.min(barY, window.innerHeight - 60)}px`;
}

function hideCaptureBar() {
  if (captureBar) {
    captureBar.remove();
    captureBar = null;
  }
}

async function captureSelection() {
  try {
    const rect = getSelectionRect();
    const dpr = window.devicePixelRatio || 1;

    const coords = {
      x: rect.x * dpr,
      y: rect.y * dpr,
      w: rect.w * dpr,
      h: rect.h * dpr,
      dpr: dpr
    };

    const response = await chrome.runtime.sendMessage({
      action: 'cropAndDownload',
      coords: coords
    });

    if (response?.success) {
      cleanup();
    } else {
      console.error('Capture failed:', response?.error);
      const btn = document.getElementById('bundle-capture-btn');
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
  } catch (error) {
    console.error('Capture error:', error);
  }
}

function cleanup() {
  if (canvas) {
    canvas.remove();
    canvas = null;
    ctx = null;
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

function openColorPicker() {
  if (!window.EyeDropper) {
    showColorError('EyeDropper not supported');
    return;
  }
  
  const picker = new EyeDropper();
  picker.open().then(result => {
    const hex = result.sRGBHex;
    showColorNotification(hex);
    chrome.runtime.sendMessage({ action: 'COLOR_PICKED', value: hex });
  }).catch(e => {
    if (e.name !== 'AbortError') {
      console.error('Color picker error:', e);
    }
  });
}

function showColorNotification(hex) {
  const notif = document.createElement('div');
  notif.id = 'bundle-color-notification';
  notif.innerHTML = `
    <div style="position:fixed;bottom:24px;right:24px;z-index:2147483647;display:flex;align-items:center;gap:12px;padding:12px 16px;background:#1A1A1A;border:1px solid #2A2A2A;border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,0.4);font-family:-apple-system,BlinkMacSystemFont,sans-serif;">
      <div style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;background:rgba(16,185,129,0.15);border-radius:6px;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </div>
      <div style="display:flex;flex-direction:column;gap:2px;">
        <span class="bundle-color-hex" style="font-size:14px;font-weight:600;color:#FFF;cursor:pointer;padding:2px 6px;border-radius:4px;background:rgba(255,255,255,0.1);">${hex}</span>
        <span class="bundle-color-label" style="font-size:11px;color:#A0A0A0;">Click to copy</span>
      </div>
    </div>
  `;
  notif.querySelector('.bundle-color-hex').onclick = () => {
    navigator.clipboard.writeText(hex);
    notif.querySelector('.bundle-color-label').textContent = 'Copied!';
    notif.querySelector('.bundle-color-label').style.color = '#10B981';
  };
  document.body.appendChild(notif);
  setTimeout(() => notif.remove(), 5000);
}

function showColorError(msg) {
  const err = document.createElement('div');
  err.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:2147483647;padding:12px 16px;background:#EF4444;color:white;border-radius:8px;font-family:sans-serif;font-size:13px;';
  err.textContent = msg;
  document.body.appendChild(err);
  setTimeout(() => err.remove(), 3000);
}