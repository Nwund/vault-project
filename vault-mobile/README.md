# Vault Mobile

React Native mobile app for Vault media library.

## Features

- Browse your desktop Vault library from your phone
- Stream videos directly from your desktop
- Download media for offline viewing
- Sync playlists and favorites
- Cast to TV from mobile

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm start
   ```

3. Run on device/emulator:
   ```bash
   npm run ios     # iOS
   npm run android # Android
   ```

## Connecting to Desktop

1. Make sure your desktop Vault is running
2. Go to Settings > Mobile Sync on your desktop
3. Click "Start Server" and "Generate Pairing Code"
4. On your phone, open the Vault app and enter the pairing code

## Requirements

- Desktop Vault running with Mobile Sync enabled
- Both devices on the same local network
- iOS 13+ or Android 10+

## Architecture

```
vault-mobile/
├── app/                  # Expo Router pages
│   ├── (tabs)/          # Tab navigation
│   ├── player/          # Video player
│   └── connect.tsx      # Connection screen
├── components/          # Reusable components
├── services/            # API and sync services
├── stores/              # Zustand state stores
└── assets/              # App icons and images
```

## Tech Stack

- Expo 51
- React Native 0.74
- Expo Router for navigation
- Zustand for state management
- expo-av for video playback
- expo-file-system for downloads
- expo-secure-store for credentials
