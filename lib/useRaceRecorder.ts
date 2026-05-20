import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useGameStore } from '../state/gameStore';

/**
 * Race screen-recording hook.
 *
 * Wraps `react-native-record-screen` (iOS ReplayKit / Android
 * MediaProjection) for the "record + share my race" feature. Video
 * only — no microphone capture.
 *
 * The native module is `require`d defensively: in Expo Go (or any build
 * that didn't compile the module) the require throws, `available` is
 * false, and the race screen simply hides the REC button instead of
 * crashing.
 *
 * Recording happens only when the user opts in (taps REC). It captures
 * the live race; the OS encodes on dedicated hardware so the game still
 * renders once. There is no recording during normal play.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
let RecordScreen: any = null;
try {
  RecordScreen = require('react-native-record-screen').default;
} catch {
  // Native module not present (e.g. Expo Go) — recording stays disabled.
}

export interface RaceRecorder {
  /** True when the native recorder module is compiled into this build. */
  available: boolean;
  isRecording: boolean;
  /** Start if idle, stop+save if recording. */
  toggle: () => void;
  /** Stop recording and save the resulting video URI to the store.
   *  Safe to call when not recording — it no-ops. Call this at race end. */
  stopAndSave: () => void;
}

export function useRaceRecorder(): RaceRecorder {
  const setRaceVideoUri = useGameStore((s) => s.setRaceVideoUri);
  const [isRecording, setIsRecording] = useState(false);
  // Mirror of isRecording for use inside stable callbacks (avoids stale
  // closures — the race-end handler is a memoized callback).
  const recordingRef = useRef(false);

  const start = useCallback(async () => {
    if (!RecordScreen || recordingRef.current) return;
    try {
      const res = await RecordScreen.startRecording({ mic: false });
      if (res === 'started') {
        recordingRef.current = true;
        setIsRecording(true);
      } else {
        // 'permission_error' — user denied the OS screen-capture prompt.
        Alert.alert(
          'Recording unavailable',
          'Screen recording permission was denied. You can still race — just tap REC and allow it next time to capture a clip.',
        );
      }
    } catch (err) {
      console.warn('[raceRecorder] startRecording failed', err);
    }
  }, []);

  const stopAndSave = useCallback(async () => {
    if (!RecordScreen || !recordingRef.current) return;
    recordingRef.current = false;
    setIsRecording(false);
    try {
      const res = await RecordScreen.stopRecording();
      if (res?.status === 'success' && res?.result?.outputURL) {
        setRaceVideoUri(res.result.outputURL);
      }
    } catch (err) {
      console.warn('[raceRecorder] stopRecording failed', err);
    }
  }, [setRaceVideoUri]);

  const toggle = useCallback(() => {
    if (recordingRef.current) stopAndSave();
    else start();
  }, [start, stopAndSave]);

  // If the race screen unmounts while still recording (back-out, crash
  // recovery, etc.) stop the OS recorder so it doesn't leak.
  useEffect(() => {
    return () => {
      if (recordingRef.current && RecordScreen) {
        recordingRef.current = false;
        RecordScreen.stopRecording().catch(() => {});
      }
    };
  }, []);

  return { available: !!RecordScreen, isRecording, toggle, stopAndSave };
}
