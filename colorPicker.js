(function() {
  function showNotification(hexCode) {
    const notification = document.createElement('div');
    notification.id = 'bundle-color-notification';
    notification.innerHTML = `
      <div class="bundle-color-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </div>
      <div class="bundle-color-info">
        <span class="bundle-color-hex" data-hex="${hexCode}">${hexCode}</span>
        <span class="bundle-color-label">Click to copy</span>
      </div>
      <button class="bundle-color-close">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    `;
    
    notification.querySelector('.bundle-color-hex').addEventListener('click', async () => {
      await navigator.clipboard.writeText(hexCode);
      notification.querySelector('.bundle-color-label').textContent = 'Copied!';
      notification.querySelector('.bundle-color-label').style.color = '#10B981';
    });
    
    notification.querySelector('.bundle-color-close').addEventListener('click', () => {
      notification.remove();
    });

    const style = document.createElement('style');
    style.id = 'bundle-color-style';
    style.textContent = `
      #bundle-color-notification {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 2147483647;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 16px;
        background: #1A1A1A;
        border: 1px solid #2A2A2A;
        border-radius: 10px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        animation: bundle-color-slide-in 0.3s ease;
      }
      @keyframes bundle-color-slide-in {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
      }
      #bundle-color-notification * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      .bundle-color-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        background: rgba(16, 185, 129, 0.15);
        border-radius: 6px;
      }
      .bundle-color-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .bundle-color-hex {
        font-size: 14px;
        font-weight: 600;
        color: #FFFFFF;
        cursor: pointer;
        padding: 2px 6px;
        border-radius: 4px;
        background: rgba(255, 255, 255, 0.1);
        transition: background 150ms;
      }
      .bundle-color-hex:hover {
        background: rgba(255, 255, 255, 0.2);
      }
      .bundle-color-label {
        font-size: 11px;
        color: #A0A0A0;
      }
      .bundle-color-close {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        background: transparent;
        border: none;
        border-radius: 4px;
        color: #737373;
        cursor: pointer;
        transition: all 150ms;
      }
      .bundle-color-close:hover {
        background: rgba(255, 255, 255, 0.1);
        color: #FFFFFF;
      }
    `;
    
    document.head.appendChild(style);
    document.body.appendChild(notification);
    
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 5000);
  }

  function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.id = 'bundle-color-error';
    errorDiv.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 2147483647;
      padding: 12px 16px;
      background: #EF4444;
      color: white;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 13px;
      box-shadow: 0 4px 16px rgba(239, 68, 68, 0.4);
    `;
    errorDiv.textContent = message;
    document.body.appendChild(errorDiv);
    
    setTimeout(() => {
      if (errorDiv.parentNode) {
        errorDiv.remove();
      }
    }, 3000);
  }

  async function pickColor() {
    const EyeDropper = window.EyeDropper;
    
    if (!EyeDropper) {
      showError('EyeDropper not supported');
      return;
    }

    const eyeDropper = new EyeDropper();
    
    try {
      const result = await eyeDropper.open();
      const hexCode = result.sRGBHex;
      showNotification(hexCode);
      chrome.runtime.sendMessage({ action: 'COLOR_PICKED', value: hexCode });
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.error('Color picker error:', e);
        showError('Color pick failed');
      }
    }
  }

  pickColor();
})();
