(function() {
  console.log("Color picker script loaded");
  
  if (!window.EyeDropper) {
    const err = document.createElement('div');
    err.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:2147483647;padding:12px 16px;background:#EF4444;color:white;border-radius:8px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;box-shadow:0 4px 16px rgba(0,0,0,0.3);';
    err.textContent = 'EyeDropper not supported in this browser';
    document.body.appendChild(err);
    setTimeout(() => err.remove(), 5000);
    return;
  }

  console.log("Starting EyeDropper...");
  
  const picker = new EyeDropper();
  
  picker.open().then(result => {
    const hex = result.sRGBHex;
    console.log("Color picked:", hex);
    
    const notif = document.createElement('div');
    notif.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:2147483647;display:flex;align-items:center;gap:12px;padding:12px 16px;background:#1A1A1A;border:1px solid #2A2A2A;border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,0.4);font-family:-apple-system,BlinkMacSystemFont,sans-serif;';
    notif.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;background:rgba(16,185,129,0.15);border-radius:6px;flex-shrink:0;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg></div><div style="display:flex;flex-direction:column;gap:2px;"><span id="bundle-hex" style="font-size:14px;font-weight:600;color:#FFF;cursor:pointer;padding:2px 6px;border-radius:4px;background:rgba(255,255,255,0.1);">' + hex + '</span><span id="bundle-label" style="font-size:11px;color:#A0A0A0;">Click to copy</span></div>';
    
    notif.querySelector('#bundle-hex').addEventListener('click', () => {
      navigator.clipboard.writeText(hex);
      notif.querySelector('#bundle-label').textContent = 'Copied!';
      notif.querySelector('#bundle-label').style.color = '#10B981';
    });
    
    document.body.appendChild(notif);
    
    try {
      chrome.runtime.sendMessage({ action: 'COLOR_PICKED', value: hex });
    } catch (e) {
      console.log("Could not send message to background:", e.message);
    }
    
    setTimeout(() => notif.remove(), 5000);
    
  }).catch(e => {
    if (e.name === 'AbortError') {
      console.log("Color picker cancelled");
    } else {
      console.error("Color picker error:", e);
      const err = document.createElement('div');
      err.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:2147483647;padding:12px 16px;background:#EF4444;color:white;border-radius:8px;font-family:sans-serif;font-size:13px;';
      err.textContent = 'Color pick failed';
      document.body.appendChild(err);
      setTimeout(() => err.remove(), 3000);
    }
  });
})();
