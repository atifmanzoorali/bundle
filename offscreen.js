(function() {
  'use strict';

  const MAX_HEIGHT = 16000;
  const MAX_WIDTH = 10000;
  const JPEG_THRESHOLD = 10000;

  function validateDimensions(dimensions) {
    if (dimensions.height > MAX_HEIGHT) {
      return { valid: false, error: 'Image too tall (' + dimensions.height + 'px). Maximum is ' + MAX_HEIGHT + 'px.' };
    }
    if (dimensions.width > MAX_WIDTH) {
      return { valid: false, error: 'Image too wide (' + dimensions.width + 'px). Maximum is ' + MAX_WIDTH + 'px.' };
    }
    return { valid: true };
  }

  async function cropAndDownload(dataUrl, coords) {
    try {
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      const img = await createImageBitmap(blob);

      const canvas = document.getElementById('stitch-canvas');
      canvas.width = coords.w;
      canvas.height = coords.h;
      const ctx = canvas.getContext('2d');

      ctx.drawImage(img, coords.x, coords.y, coords.w, coords.h, 0, 0, coords.w, coords.h);
      img.close();

      const croppedBlob = await new Promise(function(resolve, reject) {
        try {
          canvas.toBlob(function(result) {
            if (result) {
              resolve(result);
            } else {
              reject(new Error('Failed to create cropped blob - image may be too large'));
            }
          }, 'image/png');
        } catch (e) {
          reject(new Error('Canvas blob creation failed: ' + e.message));
        }
      });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = 'screenshot-' + timestamp + '.png';

      triggerDownload(croppedBlob, filename);
      return { success: true };

    } catch (error) {
      throw error;
    }
  }

  async function stitchAndDownload(chunks, dimensions) {
    const validation = validateDimensions(dimensions);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const canvas = document.getElementById('stitch-canvas');
    const ctx = canvas.getContext('2d');

    canvas.width = dimensions.width;
    canvas.height = dimensions.height;

    for (var i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      try {
        const response = await fetch(chunk.dataUrl);
        const blob = await response.blob();
        const img = await createImageBitmap(blob);

        const yOffset = chunk.index * dimensions.viewportHeight;
        ctx.drawImage(img, 0, yOffset, dimensions.width, dimensions.viewportHeight);

        img.close();
      } catch (chunkError) {
        throw new Error('Failed to process chunk ' + i + ': ' + chunkError.message);
      }
    }

    const useJpeg = dimensions.height > JPEG_THRESHOLD;
    const format = useJpeg ? 'image/jpeg' : 'image/png';
    const quality = useJpeg ? 0.8 : undefined;

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

    return finalBlob;
  }

  function triggerDownload(blob, filename) {
    const blobUrl = URL.createObjectURL(blob);

    chrome.runtime.sendMessage({
      action: 'DOWNLOAD_BLOB',
      url: blobUrl,
      filename: filename
    });
  }

  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === 'CROP_AND_DOWNLOAD') {
      cropAndDownload(request.dataUrl, request.coords)
        .then(function(result) {
          sendResponse(result);
        })
        .catch(function(error) {
          sendResponse({ success: false, error: error.message });
        });
      return true;
    }

    if (request.action === 'STITCH_AND_DOWNLOAD') {
      const chunks = request.chunks;
      const dimensions = request.dimensions;

      stitchAndDownload(chunks, dimensions)
        .then(function(blob) {
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
          const useJpeg = dimensions.height > JPEG_THRESHOLD;
          const ext = useJpeg ? 'jpg' : 'png';
          const filename = 'full-page-' + timestamp + '.' + ext;

          triggerDownload(blob, filename);

          sendResponse({ success: true, stitchingComplete: true });
        })
        .catch(function(error) {
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
      sendResponse({ success: true });
      return;
    }
  });
})();
