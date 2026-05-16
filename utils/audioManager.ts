/**
 * Race audio SFX manager — preloads short sound effects and plays them
 * on race events (collisions, lead changes, finish).
 * Uses expo-av for audio playback. Safe in Expo Go (no-op).
 */
import Constants from 'expo-constants';

// Expo Go ships without the ExponentAV native module. Use executionEnvironment
// (the non-deprecated API in SDK 55) and fall back to appOwnership for safety.
const isExpoGo =
  (Constants.executionEnvironment as string | undefined) === 'storeClient' ||
  (Constants as any).appOwnership === 'expo';

// Lazy-load expo-av to avoid native module crash in Expo Go. Single load
// attempt — once it fails or succeeds, we don't retry.
let _Audio: any = null;
let _audioLoadAttempted = false;
function getAudio(): any {
  if (isExpoGo) return null;
  if (_audioLoadAttempted) return _Audio;
  _audioLoadAttempted = true;
  try {
    _Audio = require('expo-av').Audio;
  } catch {
    _Audio = null;
  }
  return _Audio;
}

// Audio event types — matches haptic types + race events
export type AudioEvent =
  | 'bumper'
  | 'trampoline'
  | 'speedBurst'
  | 'pendulum'
  | 'cradle'
  | 'leadChange'
  | 'finish'
  | 'countdown'
  | 'go'
  | 'doomsday';

// Tone synthesis: generate short sound buffers programmatically
// (No external .wav/.mp3 files needed — pure synthesis)
// Using expo-av's ability to create audio from inline URIs

let audioEnabled = true;
let audioInitialized = false;

// Sound pool — reuse Audio.Sound objects to avoid allocation during race
const soundPool: Map<AudioEvent, any[]> = new Map();
const POOL_SIZE = 3; // 3 instances per event type for overlapping sounds

// Frequencies for synthesized tones (simple sine waves via data URI)
const TONE_CONFIG: Record<AudioEvent, { freq: number; duration: number; volume: number }> = {
  bumper:      { freq: 440, duration: 60, volume: 0.3 },
  trampoline:  { freq: 660, duration: 100, volume: 0.4 },
  speedBurst:  { freq: 880, duration: 150, volume: 0.35 },
  pendulum:    { freq: 330, duration: 80, volume: 0.25 },
  cradle:      { freq: 520, duration: 70, volume: 0.25 },
  leadChange:  { freq: 1047, duration: 200, volume: 0.5 },
  finish:      { freq: 784, duration: 400, volume: 0.6 },
  countdown:   { freq: 440, duration: 200, volume: 0.5 },
  go:          { freq: 880, duration: 300, volume: 0.6 },
  doomsday:    { freq: 220, duration: 500, volume: 0.5 },
};

// Generate a WAV data URI for a simple sine tone
function generateToneWav(freq: number, durationMs: number, volume: number): string {
  const sampleRate = 22050;
  const numSamples = Math.floor(sampleRate * durationMs / 1000);
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;
  const dataSize = numSamples * blockAlign;
  const headerSize = 44;
  const fileSize = headerSize + dataSize;

  const buffer = new ArrayBuffer(fileSize);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, fileSize - 8, true);
  writeString(view, 8, 'WAVE');

  // fmt chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true);  // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Generate sine wave samples with envelope
  const amplitude = 32767 * volume;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const envelope = Math.min(1, (numSamples - i) / (numSamples * 0.3)); // fade out last 30%
    const attackEnv = Math.min(1, i / (sampleRate * 0.005)); // 5ms attack
    const sample = Math.sin(2 * Math.PI * freq * t) * amplitude * envelope * attackEnv;
    view.setInt16(headerSize + i * 2, Math.round(sample), true);
  }

  // Convert to base64
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return 'data:audio/wav;base64,' + btoa(binary);
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/** Initialize audio system — call once at race start */
export async function initAudio(): Promise<void> {
  if (audioInitialized || isExpoGo) return;
  const Audio = getAudio();
  if (!Audio) { audioEnabled = false; return; }
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: false,
      shouldDuckAndroid: true,
      staysActiveInBackground: false,
    });
    audioInitialized = true;
  } catch {
    audioEnabled = false;
  }
}

/** Preload sound pool for a specific event type */
async function preloadEvent(event: AudioEvent): Promise<void> {
  if (!audioEnabled || isExpoGo) return;
  const Audio = getAudio();
  if (!Audio) return;
  const config = TONE_CONFIG[event];
  const uri = generateToneWav(config.freq, config.duration, config.volume);
  const pool: any[] = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    try {
      const { sound } = await Audio.Sound.createAsync({ uri });
      pool.push(sound);
    } catch {
      // Skip if creation fails
    }
  }
  soundPool.set(event, pool);
}

/** Preload all race sounds — call once before race starts */
export async function preloadRaceSounds(): Promise<void> {
  if (!audioEnabled || isExpoGo) return;
  await initAudio();
  const events: AudioEvent[] = ['bumper', 'trampoline', 'speedBurst', 'leadChange', 'finish', 'countdown', 'go'];
  await Promise.all(events.map(e => preloadEvent(e)));
}

// Round-robin index per event type
const poolIndex: Map<AudioEvent, number> = new Map();

/** Play a sound effect — fire and forget, non-blocking */
export function playSound(event: AudioEvent): void {
  if (!audioEnabled || isExpoGo) return;
  const pool = soundPool.get(event);
  if (!pool || pool.length === 0) return;

  const idx = (poolIndex.get(event) || 0) % pool.length;
  poolIndex.set(event, idx + 1);
  const sound = pool[idx];

  // Fire and forget — rewind and play
  sound.setPositionAsync(0).then(() => sound.playAsync()).catch(() => {});
}

/** Unload all sounds — call when leaving race screen */
export async function unloadRaceSounds(): Promise<void> {
  for (const [, pool] of soundPool) {
    for (const sound of pool) {
      try { await sound.unloadAsync(); } catch {}
    }
  }
  soundPool.clear();
  poolIndex.clear();
}

/** Toggle audio on/off */
export function setAudioEnabled(enabled: boolean): void {
  audioEnabled = enabled;
}

export function isAudioEnabled(): boolean {
  return audioEnabled;
}
