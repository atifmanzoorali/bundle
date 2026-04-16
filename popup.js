document.addEventListener('DOMContentLoaded', async () => {
  const themeToggle = document.getElementById('themeToggle');
  const toolCards = document.querySelectorAll('.tool-card');

  const savedTheme = await getStoredTheme();
  if (savedTheme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  }

  themeToggle.addEventListener('click', async () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';

    if (newTheme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }

    await chrome.storage.local.set({ theme: newTheme });
  });

  toolCards.forEach(card => {
    card.addEventListener('click', () => {
      const tool = card.getAttribute('data-tool');
      handleToolAction(tool, card);
    });
  });
});

function getStoredTheme() {
  return new Promise((resolve) => {
    chrome.storage.local.get('theme', (result) => {
      resolve(result.theme || 'dark');
    });
  });
}

function handleToolAction(tool, card) {
  if (tool === 'screenshot') {
    startAreaSelection(card);
  } else if (tool === 'fullpage') {
    setButtonLoading(card, 'Capturing...');
    setTimeout(() => resetButton(card), 1000);
  } else if (tool === 'colorpicker') {
    startColorPicker(card);
  }
}

function startAreaSelection(card) {
  setButtonLoading(card, 'Selecting area...');

  (async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        console.error('No active tab found');
        resetButton(card);
        return;
      }

      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ['selection.css']
      }).catch(e => {
        if (!e.message.includes('already injected')) {
          console.warn('CSS injection warning:', e.message);
        }
      });

      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['selection.js']
        });
      } catch (e) {
        if (!e.message.includes('already injected')) {
          console.warn('Script injection warning:', e.message);
        }
      }

      // Small delay to ensure script is ready before sending message
      await new Promise(resolve => setTimeout(resolve, 100));

      try {
        await chrome.tabs.sendMessage(tab.id, { action: 'INIT_SELECTION', tabId: tab.id }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('Failed to send INIT_SELECTION:', chrome.runtime.lastError.message);
          }
        });
      } catch (e) {
        console.error('Error sending INIT_SELECTION:', e.message);
      }

      window.close();
    } catch (error) {
      console.error('Failed to start selection:', error);
      resetButton(card);
    }
  })();
}

function startColorPicker(card) {
  setButtonLoading(card, 'Selecting...');

  (async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        console.error('No active tab found');
        resetButton(card);
        return;
      }

      const colorPickerCode = `
        (function() {
          if (!window.EyeDropper) {
            const err = document.createElement('div');
            err.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:2147483647;padding:12px 16px;background:#EF4444;color:white;border-radius:8px;font-family:sans-serif;font-size:13px;';
            err.textContent = 'EyeDropper not supported in this browser';
            document.body.appendChild(err);
            setTimeout(() => err.remove(), 3000);
            return;
          }
          
          const picker = new EyeDropper();
          picker.open().then(result => {
            const hex = result.sRGBHex;
            const notif = document.createElement('div');
            notif.innerHTML = '<div style="position:fixed;bottom:24px;right:24px;z-index:2147483647;display:flex;align-items:center;gap:12px;padding:12px 16px;background:#1A1A1A;border:1px solid #2A2A2A;border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,0.4);font-family:-apple-system,BlinkMacSystemFont,sans-serif;"><div style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;background:rgba(16,185,129,0.15);border-radius:6px;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg></div><div style="display:flex;flex-direction:column;gap:2px;"><span class="hex" style="font-size:14px;font-weight:600;color:#FFF;cursor:pointer;padding:2px 6px;border-radius:4px;background:rgba(255,255,255,0.1);">' + hex + '</span><span class="label" style="font-size:11px;color:#A0A0A0;">Click to copy</span></div></div>';
            notif.querySelector('.hex').onclick = () => { navigator.clipboard.writeText(hex); notif.querySelector('.label').textContent = 'Copied!'; notif.querySelector('.label').style.color = '#10B981'; };
            document.body.appendChild(notif);
            chrome.runtime.sendMessage({ action: 'COLOR_PICKED', value: hex });
            setTimeout(() => notif.remove(), 5000);
          }).catch(e => {
            if (e.name !== 'AbortError') console.error(e);
          });
        })()
      `;

      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (code) => { eval(code); },
        args: [colorPickerCode],
        world: 'MAIN'
      });

      window.close();
    } catch (error) {
      console.error('Failed to start color picker:', error);
      resetButton(card);
    }
  })();
}

function setButtonLoading(card, text) {
  card.setAttribute('data-loading', text);
  card.classList.add('loading');
}

function resetButton(card) {
  card.removeAttribute('data-loading');
  card.classList.remove('loading');
}