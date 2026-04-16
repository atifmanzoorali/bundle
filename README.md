# Bundle - Chrome Extension

All-in-one Chrome extension for screenshots, full page captures, and color picking.

## Features

### 1. Screenshot Capture (Area Selection)
Select and capture any rectangular area of the visible page using a drag-to-select interface.

**How it works:**
- Click the "Screenshot" button or press `Ctrl+Shift+1`
- Click and drag to select an area
- Release to capture and download the selection

**Output:** PNG image saved as `screenshot-TIMESTAMP.png`

### 2. Full Page Capture
Capture an entire webpage including all scrollable content.

**How it works:**
- Click the "Full Page" button or press `Ctrl+Shift+2`
- The extension scrolls through the page automatically
- Captures each viewport slice and stitches them together
- Downloads the complete image

**Output:** PNG or JPEG image saved as `full-page-TIMESTAMP.png/.jpg`

**Technical features:**
- Automatic scrolling with 600ms delay before capture + 100ms after (prevents throttling)
- Fixed/sticky elements are temporarily hidden during capture
- JPEG format (0.8 quality) used automatically for pages >10,000px height
- Maximum height limit: 16,000px (alerts user if exceeded)
- Clean capture: overlay UI is hidden before any screenshots are taken
- Uses Offscreen Document for reliable image stitching
- Bulletproof error handling with try/catch and proper async responses

### 3. Color Picker
Pick any color from the page and copy its HEX value to clipboard.

**How it works:**
- Click the "Color Picker" button or press `Ctrl+Shift+3`
- Click anywhere on the page to pick a color
- HEX value is copied to clipboard automatically

### 4. Dark/Light Theme
Toggle between dark and light themes for the extension popup.

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Screenshot | `Ctrl+Shift+1` |
| Full Page | `Ctrl+Shift+2` |
| Color Picker | `Ctrl+Shift+3` |

## Installation

1. Clone the repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top right)
4. Click **Load unpacked**
5. Select the project folder
6. Reload the extension after any updates

## File Structure

```
Bundle/
├── manifest.json          # Extension configuration (Manifest V3)
├── background.js         # Service worker - orchestrates capture and downloads
├── popup.html            # Extension popup UI
├── popup.js             # Popup logic
├── popup.css            # Popup styling
├── content.js           # Content script for area selection
├── selection.js         # Area selection logic with port communication
├── selection.css        # Selection overlay styles
├── fullpage.js          # Full page capture scroll logic
├── offscreen.html       # Hidden DOM for image stitching
├── offscreen.js         # Canvas stitching engine
├── colorPicker.js       # Color picker logic
└── icons/               # Extension icons
```

## Architecture

### Data Flow: Full Page Capture

```
┌─────────────────────────────────────────────────────────────────┐
│ fullpage.js (Content Script)                                    │
│  - Scrolls page incrementally                                    │
│  - Requests captures via background                             │
│  - Collects image chunks                                         │
└───────────────────────┬─────────────────────────────────────────┘
                        │ chrome.runtime.sendMessage
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ background.js (Service Worker)                                  │
│  - Captures visible tab (chrome.tabs.captureVisibleTab)        │
│  - Creates Offscreen Document for stitching                     │
│  - Orchestrates the process                                     │
└───────────────────────┬─────────────────────────────────────────┘
                        │ chrome.runtime.sendMessage
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ offscreen.js (Offscreen Document - DOM Environment)             │
│  - Receives image chunks                                        │
│  - Stitches images on <canvas>                                  │
│  - Creates Blob URL                                              │
│  - Sends Blob URL back to background                            │
└───────────────────────┬─────────────────────────────────────────┘
                        │ chrome.runtime.sendMessage
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ background.js (Service Worker)                                  │
│  - Receives Blob URL                                            │
│  - Triggers chrome.downloads.download()                         │
│  - Closes Offscreen Document                                    │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow: Area Screenshot

```
┌─────────────────────────────────────────────────────────────────┐
│ popup.js → selection.js (Content Script)                       │
│  - User drags to select area                                    │
│  - Selection coordinates captured                               │
└───────────────────────┬─────────────────────────────────────────┘
                        │ chrome.runtime.connect (Port)
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ background.js (Service Worker)                                  │
│  - Receives coordinates via port                                │
│  - Captures visible tab                                         │
│  - Crops to selection area using OffscreenCanvas                │
│  - Downloads PNG                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Permissions

The extension requires the following permissions:

| Permission | Purpose |
|------------|---------|
| `activeTab` | Access the current tab for capture |
| `scripting` | Inject scripts into pages |
| `storage` | Store theme preference |
| `downloads` | Save captured images |
| `alarms` | Keep service worker alive |
| `offscreen` | Enable offscreen document for image stitching |

## Technical Details

### Throttling Prevention
- 600ms delay before each viewport capture
- 100ms delay after each capture
- Total ~700ms per chunk prevents `MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND` error

### Memory Management
- Images processed sequentially (no accumulation)
- Blob URLs revoked after download starts
- Offscreen Document closed after stitching completes

### Clean Capture
- Extension UI overlay hidden before any screenshots
- 150ms wait ensures browser render cycle completes
- Fixed/sticky elements hidden during capture

### Large Image Handling
- JPEG format (0.8 quality) for pages >10,000px height
- PNG format for shorter pages
- Maximum height: 16,000px (alerts user if exceeded)

### Service Worker Lifecycle
- Keep-alive alarm every 0.5 minutes
- Port connections maintain worker during captures
- Offscreen Document used for heavy canvas operations

### Error Handling & Robustness
- All message listeners return `true` for async responses
- Chrome API guards prevent errors on invalid contexts
- Try/catch around download operations
- Graceful failure handling with detailed console logging
- Offscreen Document closed properly after stitching

## Troubleshooting

### Full Page Capture Not Saving
1. Reload the extension
2. Check if page height exceeds 16,000px
3. Open Service Worker console (`chrome://extensions` → click worker link)
4. Look for `[Offscreen]` logs indicating stitching progress

### "Could not establish connection" Error
- Content script may not be loaded yet
- Extension automatically retries up to 3 times

### Ghost UI in Screenshots
- The overlay is now hidden before any capture occurs
- 150ms delay ensures browser render cycle completes

### Service Worker Stopping
- The extension uses alarms and port connections to stay alive
- Long captures may still cause worker restart (capture will fail gracefully)

## Tech Stack

- **Manifest V3** - Modern Chrome Extension format
- **Vanilla JavaScript** - No dependencies
- **Chrome Extension APIs** - Native browser integration
- **Offscreen Document** - DOM environment for canvas operations

## License

MIT
