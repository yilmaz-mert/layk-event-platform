import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { createSupabaseClient } from '@layk/core';

// expo-secure-store limits each item to 2 048 bytes.
// Supabase JWT sessions can exceed this, so we chunk large values across
// multiple SecureStore entries and reassemble them on read.
const CHUNK_SIZE = 2048;
const CHUNK_COUNT_SUFFIX = '.chunks';
const CHUNK_PART_SUFFIX = '.chunk.';

const SecureStoreAdapter = {
  async getItem(key: string): Promise<string | null> {
    const countStr = await SecureStore.getItemAsync(`${key}${CHUNK_COUNT_SUFFIX}`);
    if (countStr !== null) {
      const chunkCount = parseInt(countStr, 10);
      const parts: string[] = [];
      for (let i = 0; i < chunkCount; i++) {
        const part = await SecureStore.getItemAsync(`${key}${CHUNK_PART_SUFFIX}${i}`);
        if (part !== null) parts.push(part);
      }
      return parts.join('');
    }
    return SecureStore.getItemAsync(key);
  },

  async setItem(key: string, value: string): Promise<void> {
    // Always remove stale data first so old chunks don't linger
    await SecureStoreAdapter.removeItem(key);

    if (value.length > CHUNK_SIZE) {
      const chunkCount = Math.ceil(value.length / CHUNK_SIZE);
      await SecureStore.setItemAsync(`${key}${CHUNK_COUNT_SUFFIX}`, String(chunkCount));
      for (let i = 0; i < chunkCount; i++) {
        await SecureStore.setItemAsync(
          `${key}${CHUNK_PART_SUFFIX}${i}`,
          value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
        );
      }
    } else {
      await SecureStore.setItemAsync(key, value);
    }
  },

  async removeItem(key: string): Promise<void> {
    const countStr = await SecureStore.getItemAsync(`${key}${CHUNK_COUNT_SUFFIX}`);
    if (countStr !== null) {
      const chunkCount = parseInt(countStr, 10);
      await SecureStore.deleteItemAsync(`${key}${CHUNK_COUNT_SUFFIX}`);
      for (let i = 0; i < chunkCount; i++) {
        await SecureStore.deleteItemAsync(`${key}${CHUNK_PART_SUFFIX}${i}`);
      }
    }
    // Always attempt to delete the plain key too (covers non-chunked values)
    await SecureStore.deleteItemAsync(key);
  },
};

// On web, SecureStore is not a real native module — skip it entirely and let
// Supabase fall back to its built-in localStorage adapter so that
// onAuthStateChange fires the INITIAL_SESSION event correctly.
const authStorage = Platform.OS === 'web' ? undefined : SecureStoreAdapter;

// Mobile-specific Supabase client built on the shared credentials from @layk/core.
// Uses SecureStore on native so sessions survive app restarts and backgrounding.
// detectSessionInUrl: false — Expo handles auth redirects via expo-linking instead.
export const supabase = createSupabaseClient({
  auth: {
    storage: authStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
