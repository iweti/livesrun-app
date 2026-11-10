import { it, expect, vi } from 'vitest';
const { sessionHook } = vi.hoisted(() => ({ sessionHook: vi.fn() }));
vi.mock('better-auth/react', () => ({ createAuthClient: () => ({ useSession: sessionHook }) }));
vi.mock('@better-auth/expo/client', () => ({ expoClient: () => ({}) }));
vi.mock('expo-secure-store', () => ({}));
vi.mock('expo-constants', () => ({
  default: { expoConfig: { extra: { apiUrl: 'http://localhost:3010' } } },
}));
vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));
import { request, useAppSession } from '../src/auth';
import { API_ENABLED } from '../src/features';
it('opens the MVP without a session request', () => {
  expect(API_ENABLED).toBe(false);
  expect(useAppSession()).toEqual({ data: null, isPending: false });
  expect(sessionHook).not.toHaveBeenCalled();
});
it('blocks API calls in the MVP before reaching the network', async () => {
  const network = vi.spyOn(globalThis, 'fetch');
  await expect(request('/v1/me')).rejects.toThrow('não está conectado');
  expect(network).not.toHaveBeenCalled();
  network.mockRestore();
});
