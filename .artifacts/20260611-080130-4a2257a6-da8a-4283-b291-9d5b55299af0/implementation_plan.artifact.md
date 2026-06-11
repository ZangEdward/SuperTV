# Implementation Plan - Responsive Android Tablet UI

This plan aims to enhance the SuperTV Android app with a dedicated tablet UI and ensure "self-adaptive" behavior across different screen sizes (phones, tablets, and PCs).

## Proposed Changes

### [Navigation & Layout]

The core change is to introduce a sidebar (Navigation Rail) for tablets and PCs, replacing the bottom navigation bar when horizontal space is sufficient.

#### [main_layout.dart](file:///E:/AndroidStudio/SuperTV/lib/widgets/main_layout.dart)

- Modify the `build` method to use a `Row` when `DeviceUtils.isTablet(context)` is true.
- Implement `_buildSideNavRail(themeService)` to show a `NavigationRail` on the left.
- Conditionally show `_buildBottomNavBar(themeService)` only on non-tablet devices.
- Synchronize the navigation state between the sidebar and bottom bar.
- Adjust `_buildHeader` to better fit the tablet layout (e.g., logo placement).

```dart
// Conceptual change in MainLayout.build
Row(
  children: [
    if (isTablet && widget.showBottomNav) _buildSideNavRail(themeService),
    Expanded(
      child: Column(
        children: [
          if (Platform.isWindows) WindowsTitleBar(...),
          _buildHeader(context, themeService),
          Expanded(child: widget.content),
          if (!isTablet && widget.showBottomNav) _buildBottomNavBar(themeService),
        ],
      ),
    ),
  ],
)
```

#### [device_utils.dart](file:///E:/AndroidStudio/SuperTV/lib/utils/device_utils.dart)

- Ensure `isTablet` and `getTabletColumnCount` are properly tuned for a wide range of Android tablets (e.g., Foldables, 7-inch to 12-inch tablets).

---

### [Screen Optimizations]

#### [home_screen.dart](file:///E:/AndroidStudio/SuperTV/lib/screens/home_screen.dart)

- Ensure the `PageView` transitions work smoothly with the new sidebar navigation.
- Check if any home sections need additional tablet-specific spacing or sizing.

#### [player_screen.dart](file:///E:/AndroidStudio/SuperTV/lib/screens/player_screen.dart)

- Verify the existing `_buildTabletLandscapeLayout` and `_buildPortraitTabletLayout` are working as expected with the new navigation changes.
- Ensure the transition between landscape and portrait is seamless.

---

### [Android Configuration]

#### [AndroidManifest.xml](file:///E:/AndroidStudio/SuperTV/android/app/src/main/AndroidManifest.xml)

- Confirm `configChanges` includes `orientation`, `screenSize`, and `smallestScreenSize` to prevent activity recreation and allow the Flutter UI to adapt dynamically. (Already present, will double-check).

## Verification Plan

### Manual Verification

1.  **Phone Layout**: Verify that the app still shows the bottom navigation bar on phones (portrait and landscape).
2.  **Tablet Portrait**: Verify the layout on a tablet in portrait mode. Check if it uses bottom nav or sidebar based on the 600dp threshold.
3.  **Tablet Landscape**: Verify that the sidebar (Navigation Rail) appears on the left and vertical space is utilized better.
4.  **Rotation Test**: Rotate a tablet/emulator from portrait to landscape and vice versa. The UI should switch between bottom nav and sidebar seamlessly without losing state.
5.  **Grid Consistency**: Verify that movie/TV grids show the correct number of columns (6-8 on tablets) as defined in `DeviceUtils`.
6.  **Player Experience**: Test the player on a tablet in landscape to ensure the split-screen layout (65/35) works correctly.

### Automated Tests
- I will add a simple widget test to verify that `NavigationRail` is present when the screen width is large.
- Command: `flutter test test/widgets/main_layout_test.dart` (I'll create this test).
