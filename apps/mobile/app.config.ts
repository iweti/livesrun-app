import type { ExpoConfig } from 'expo/config';
const config: ExpoConfig = {
  name: 'LivesRun',
  slug: 'livesrun',
  icon: './assets/icon.png',
  scheme: 'livesrun',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  ios: {
    bundleIdentifier: 'com.iweti.livesrun',
    supportsTablet: false,
    infoPlist: { ITSAppUsesNonExemptEncryption: false },
  },
  android: {
    package: 'com.iweti.livesrun',
    allowBackup: false,
    permissions: [
      'ACCESS_FINE_LOCATION',
      'ACCESS_COARSE_LOCATION',
      'ACCESS_BACKGROUND_LOCATION',
      'FOREGROUND_SERVICE',
      'FOREGROUND_SERVICE_LOCATION',
    ],
    ...(process.env.GOOGLE_MAPS_API_KEY
      ? { config: { googleMaps: { apiKey: process.env.GOOGLE_MAPS_API_KEY } } }
      : {}),
  },
  plugins: [
    [
      'expo-location',
      {
        locationAlwaysAndWhenInUsePermission:
          'A LivesRun usa sua localização durante o treino, inclusive com a tela bloqueada, para medir distância e registrar seu percurso privado.',
        locationWhenInUsePermission: 'Permita localização para registrar sua corrida ou caminhada.',
        isIosBackgroundLocationEnabled: true,
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
    ['expo-sqlite', { useSQLCipher: true }],
    'expo-secure-store',
    'expo-web-browser',
  ],
  web: {
    bundler: 'metro',
    name: 'LivesRun',
    shortName: 'LivesRun',
    favicon: './assets/icon.png',
    description: 'Every Move Has a Story.',
  },
  extra: { apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3010' },
};
export default config;
