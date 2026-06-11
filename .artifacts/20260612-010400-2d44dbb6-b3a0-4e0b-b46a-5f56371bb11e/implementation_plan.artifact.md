# Fix Video Caching Issues and UI Enhancements

This plan addresses several issues and missing features in the video caching/downloading functionality:
1.  **Simultaneous Download Control**: Strictly enforce the concurrent task limit by pausing excess tasks.
2.  **Dark Mode Support for Dropdown**: Fix UI colors in the Download Manager settings.
3.  **HLS Decryption for Playback**: Implement AES-128 decryption for encrypted M3U8 segments.
4.  **Real File Cleanup**: Delete local files and directories when a download task is removed.
5.  **Multi-select Downloads with Status**: Enhance the playback page download panel to support selecting multiple episodes and show existing download statuses.

## User Review Required

> [!IMPORTANT]
> This plan involves adding the `encrypt` package to `pubspec.yaml` to handle AES-128 decryption. Please ensure this is acceptable.

## Proposed Changes

### Dependency Updates

#### [pubspec.yaml](file:///E:/AndroidStudio/SuperTV/pubspec.yaml)
- Add `encrypt: ^5.0.3` to dependencies.

---

### UI Improvements

#### [download_manager_screen.dart](file:///E:/AndroidStudio/SuperTV/lib/screens/download_manager_screen.dart)
- Update the "同时下载" settings area to use `Theme.of(context)` instead of hardcoded grey colors.
- Ensure the dropdown menu and its items adapt to light and dark modes.

#### [player_screen.dart](file:///E:/AndroidStudio/SuperTV/lib/screens/player_screen.dart)
- Refactor `_showDownloadPanel` to:
    - Track a list of selected indices for multi-download.
    - Change single-tap to toggle selection (checkbox style).
    - Use colors to indicate episode status (e.g., green border for selected, shaded for already downloaded/pending).
    - Show a badge or text on each episode button if it is already in the download queue.
    - Add a "Confirm" button that adds all selected new episodes to the queue.

---

### Video Service Enhancements

#### [m3u8_service.dart](file:///E:/AndroidStudio/SuperTV/lib/services/m3u8_service.dart)
- Add `parseEncryptionKey` to extract `#EXT-X-KEY` information.

#### [download_service.dart](file:///E:/AndroidStudio/SuperTV/lib/services/download_service.dart)
- **Queue Management**: Update `_checkQueue()` to pause running tasks if they exceed `_maxConcurrentEpisodes`.
- **HLS Decryption**:
    - Download the encryption key if present.
    - Decrypt segments using AES-128-CBC before saving.
- **Cleanup**: Update `removeTask(String id)` to asynchronously delete the `savePath` directory and the `savePath.ts` file.
- **Status API**: Add a helper method to check the status of an episode by ID (used by the playback page UI).

---

### Documentation

#### [README.md](file:///E:/AndroidStudio/SuperTV/README.md)
- Update the "缓存下载" section:
    - Strict enforcement of simultaneous download limits.
    - Support for encrypted HLS streams.
    - Multi-episode selection in the download panel.
    - Automatic local file cleanup upon task removal.

## Verification Plan

### Automated Tests
- `test/hls_decryption_test.dart`: Verify AES-128 decryption.
- `test/download_queue_test.dart`: Verify queue enforcement and task pausing.

### Manual Verification
1.  **UI Verification**: Test dropdown and multi-select panel in both themes.
2.  **Concurrency Verification**: Change limits and watch tasks pause/resume.
3.  **Cleanup Verification**: Start a download, delete it, and check the file system to ensure the folder is gone.
4.  **Multi-select Verification**: Select 3 episodes, click confirm, and verify 3 tasks appear in Download Manager.
5.  **Playback Verification**: Download and play an encrypted stream.
