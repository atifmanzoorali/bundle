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
    startFullPageCapture(card);
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
        resetButton(card);
        return;
      }

      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ['selection.css']
      }).catch(e => {
        if (!e.message.includes('already injected')) {}
      });

      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['selection.js']
        });
      } catch (e) {
        if (!e.message.includes('already injected')) {}
      }

      let connected = false;
      for (let retry = 0; retry < 3 && !connected; retry++) {
        try {
          await new Promise(resolve => setTimeout(resolve, 100));
          await chrome.tabs.sendMessage(tab.id, { action: 'INIT_SELECTION', tabId: tab.id });
          connected = true;
        } catch (e) {
          if (retry < 2) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }
      }

      window.close();
    } catch (error) {
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
        resetButton(card);
        return;
      }

      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['colorPicker.js'],
        world: 'MAIN'
      });

      await new Promise(resolve => setTimeout(resolve, 100));
      window.close();
    } catch (error) {
      resetButton(card);
    }
  })();
}

async function startFullPageCapture(card) {
  setButtonLoading(card, 'Capturing...');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      resetButton(card);
      return;
    }

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['fullpage.js']
    }).catch(e => {
      if (!e.message.includes('already injected')) {}
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    await chrome.tabs.sendMessage(tab.id, {
      action: 'START_FULL_PAGE_CAPTURE'
    });

    window.close();
  } catch (error) {
    resetButton(card);
  }
}

function setButtonLoading(card, text) {
  card.setAttribute('data-loading', text);
  card.classList.add('loading');
}

function resetButton(card) {
  card.removeAttribute('data-loading');
  card.classList.remove('loading');
}
