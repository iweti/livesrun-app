import { API_ENABLED } from './features';
import { createAuthClient } from 'better-auth/react';
import { expoClient } from '@better-auth/expo/client';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
export const API_URL = String(
  Constants.expoConfig?.extra?.apiUrl ?? 'http://localhost:3010',
).replace(/\/$/, '');
export const auth = createAuthClient({
  baseURL: API_URL,
  ...(Platform.OS !== 'web'
    ? {
        plugins: [
          expoClient({ scheme: 'livesrun', storagePrefix: 'livesrun', storage: SecureStore }),
        ],
      }
    : {}),
});
export const useAppSession = API_ENABLED
  ? auth.useSession
  : () => ({ data: null, isPending: false });
export type AppSession = NonNullable<ReturnType<typeof useAppSession>['data']>;
export async function request<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  if (!API_ENABLED) throw new Error('Este MVP usa dados fictícios e não está conectado a uma API.');
  const headers = new Headers(options.headers);
  if (options.body) headers.set('Content-Type', 'application/json');
  if (Platform.OS !== 'web') {
    const cookies = await (auth as unknown as { getCookie: () => Promise<string> }).getCookie();
    if (cookies) headers.set('Cookie', cookies);
    headers.set('expo-origin', 'livesrun://');
  }
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });
  if (!response.ok) {
    let message = 'Não foi possível conectar. Tente novamente.';
    try {
      const data = await response.json();
      message = data.error ?? data.message ?? message;
    } catch {}
    throw new Error(message);
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
export const json = (data: unknown) => JSON.stringify(data);
