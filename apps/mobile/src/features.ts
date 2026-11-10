// This MVP runs entirely with in-memory fixtures. API integration is opt-in for
// a future phase and must never be enabled by a database or credential alone.
export const API_ENABLED = process.env.EXPO_PUBLIC_ENABLE_API === 'true';
