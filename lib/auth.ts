import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { api, setToken, getToken } from './api';
import { setPlayerId } from './liveOps';

const DEVICE_ID_KEY = 'dmr-device-id';

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export async function getOrCreateDeviceId(): Promise<string> {
  try {
    let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = generateUUID();
      await AsyncStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return generateUUID();
  }
}

/**
 * Silently registers or logs in the player.
 * Fire-and-forget — if this fails, the game continues offline.
 */
export async function registerOrLogin(playerName: string): Promise<void> {
  const deviceId = await getOrCreateDeviceId();
  const existingToken = await getToken();

  // If we have a token, validate it
  if (existingToken) {
    try {
      const result = await api.get<{ banned: boolean; playerId?: string }>('/auth/me');
      if (result.playerId) await setPlayerId(result.playerId);
      if (!result.banned) return; // Session is valid
    } catch {
      // Session expired or invalid — continue to re-auth
    }
  }

  // Try login first (returning device)
  try {
    const result = await api.post<{ token: string | null; banned: boolean; playerId?: string }>(
      '/auth/login',
      { deviceId },
    );
    if (result.token) {
      await setToken(result.token);
      if (result.playerId) await setPlayerId(result.playerId);
      return;
    }
    // If banned, token will be null — game still works offline
    return;
  } catch {
    // Device not registered yet — fall through to register
  }

  // Register new device
  try {
    const result = await api.post<{ token: string; playerId?: string }>('/auth/register', {
      deviceId,
      playerName,
      platform: Platform.OS,
      appVersion: '1.0.0',
    });
    await setToken(result.token);
    if (result.playerId) await setPlayerId(result.playerId);
  } catch {
    // Registration failed — game continues offline
  }
}
