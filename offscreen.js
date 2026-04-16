(function() {
  'use strict';

  const MAX_HEIGHT = 16000;
  const MAX_WIDTH = 10000;
  const JPEG_THRESHOLD = 10000;

  console.log('[Offscreen] Offscreen Document Created');

  function validateDimensions(dimensions) {
    if (dimensions.height > MAX_HEIGHT) {
      return { valid: false, error: 'Image too tall (' + dimensions.height + 'px). Maximum is ' + MAX_HEIGHT + 'px.' };
    }
    if (dimensions.width > MAX_WIDTH) {
      return { valid: false, error: 'Image too wide (' + dimensions.width + 'px). Maximum is ' + MAX_WIDTH + 'px.' };
    }
    return { valid: true };
  }

  async function stitchChunks(chunks, dimensions) {
    const validation = validateDimensions(dimensions);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const canvas = document.getElementById('stitch-canvas');
    const ctx = canvas.getContext('2d');

    canvas.width = dimensions.width;
    canvas.height = dimensions.height;

    console.log('[Offscreen] Canvas created:', dimensions.width, 'x', dimensions.height);
    console.log('[Offscreen] Stitching Started - processing', chunks.length, 'chunks');

    for (var i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log('[Offscreen] Processing chunk', i + 1, 'of', chunks.length);

      try {
        const response = await fetch(chunk.dataUrl);
        const blob = await response.blob();
        const img = await createImageBitmap(blob);

        const yOffset = chunk.index * dimensions.viewportHeight;
        ctx.drawImage(img, 0, yOffset, dimensions.width, dimensions.viewportHeight);

        img.close();
      } catch (chunkError) {
        console.error('[Offscreen] Error processing chunk', i, chunkError.message);
        throw new Error('Failed to process chunk ' + i + ': ' + chunkError.message);
      }
    }

    console.log('[Offscreen] All chunks drawn, converting to blob');

    // Use JPEG for long pages to reduce file size
    const useJpeg = dimensions.height > JPEG_THRESHOLD;
    const format = useJpeg ? 'image/jpeg' : 'image/png';
    const quality = useJpeg ? 0.8 : undefined;

    console.log('[Offscreen] Using format:', format, useJpeg ? '(0.8 quality for large image)' : '(PNG)');

    const finalBlob = await new Promise(function(resolve, reject) {
      try {
        canvas.toBlob(function(blob) {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to create blob - image may be too large for browser memory'));
          }
        }, format, quality);
      } catch (e) {
        reject(new Error('Canvas blob creation failed: ' + e.message));
      }
    });

    console.log('[Offscreen] Blob created, size:', finalBlob.size, 'bytes');
    return finalBlob;
  }

  function triggerDownload(blob, filename) {
    const blobUrl = URL.createObjectURL(blob);
    console.log('[Offscreen] Blob URL created:', blobUrl);
    console.log('[Offscreen] Sending blob URL to background for download');

    // Send blob URL back to background - background has chrome.downloads permission
    chrome.runtime.sendMessage({
      action: 'DOWNLOAD_BLOB',
      url: blobUrl,
      filename: filename
    });
  }

  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    console.log('[Offscreen] Received message:', request.action);

    if (request.action === 'STITCH_CHUNKS') {
      const chunks = request.chunks;
      const dimensions = request.dimensions;

      stitchChunks(chunks, dimensions)
        .then(function(blob) {
          // Generate filename with appropriate extension
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
          const useJpeg = dimensions.height > JPEG_THRESHOLD;
          const ext = useJpeg ? 'jpg' : 'png';
          const filename = 'full-page-' + timestamp + '.' + ext;

          console.log('[Offscreen] Triggering download:', filename);
          triggerDownload(blob, filename);

          // Respond immediately - download happens in callback
          sendResponse({ success: true, stitchingComplete: true });
        })
        .catch(function(error) {
          console.error('[Offscreen] Stitch failed:', error.message);

          // Check for memory/allocation errors
          const memoryErrorPatterns = [
            'memory',
            'allocation',
            'size',
            'failed to allocate',
            'out of memory',
            'allocation failed'
          ];

          const isMemoryError = memoryErrorPatterns.some(function(pattern) {
            return error.message.toLowerCase().includes(pattern);
          });

          if (isMemoryError) {
            console.error('[Offscreen] Memory error detected - image too large');
            // Note: alert() may not work in offscreen context, try to notify background
            chrome.runtime.sendMessage({
              action: 'STITCH_MEMORY_ERROR',
              error: error.message
            });
          }

          sendResponse({ success: false, error: error.message });
        });

      return true;
    }

    if (request.action === 'PING') {
      sendResponse({ success: true, message: 'Offscreen ready' });
      return true;
    }

    if (request.action === 'CLOSE_OFFSCREEN') {
      console.log('[Offscreen] Received close command - exiting');
      sendResponse({ success: true });
      // Offscreen document will close
      return;
    }
  });

  console.log('[Offscreen] Ready and listening for messages');
})();
