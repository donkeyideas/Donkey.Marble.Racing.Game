/**
 * Multiplayer Tournament System — Firebase Realtime Database.
 *
 * ARCHITECTURE:
 * 1. Player creates or joins a lobby (max 8 players)
 * 2. After 10-20s wait, empty slots are filled with AI bots
 * 3. Draft phase: players pick marbles in turn order (snake draft)
 * 4. Host device simulates the race → pushes results to Firebase
 * 5. Elimination: last-place marble's owner is eliminated each round
 * 6. Last player standing wins the prize pool
 *
 * DATABASE PATH: /lobbies/{lobbyId}
 */

import { MARBLES, MarbleData } from '../theme';
import { ALL_COURSES } from '../data/courses';
import Constants from 'expo-constants';

const isExpoGo = Constants.appOwnership === 'expo';

// Lazy import — avoids crash in Expo Go where native modules aren't available
let _database: any = null;
function getDatabase() {
  if (isExpoGo) return null;
  if (_database) return _database;
  try {
    _database = require('@react-native-firebase/database').default;
    return _database;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LobbyPlayer {
  uid: string;
  displayName: string;
  isHost: boolean;
  isBot: boolean;
  marbleId: string | null;   // Assigned during draft
  eliminated: boolean;
  eliminatedRound: number | null;
  joinedAt: number;
}

export type LobbyStatus =
  | 'waiting'       // Waiting for players (10-20s)
  | 'drafting'      // Snake draft in progress
  | 'racing'        // Race is being simulated (host)
  | 'round_result'  // Showing round results
  | 'finished';     // Tournament complete

export interface LobbyRound {
  courseId: string;
  finishOrder: string[];        // marbleIds in finish order
  eliminatedMarbleId: string;   // Last place marble
  eliminatedPlayerId: string;   // Owner of eliminated marble
}

export interface LobbyData {
  hostUid: string;
  status: LobbyStatus;
  tier: 'daily' | 'weekly' | 'champion';
  entryFee: number;
  prizePool: number;
  players: Record<string, LobbyPlayer>;
  rounds: LobbyRound[];
  currentRound: number;
  draftOrder: string[];         // UIDs in draft pick order
  draftTurn: number;            // Index into draftOrder
  availableMarbles: string[];   // Marble IDs not yet picked
  courseSeed: number;           // Seed for course selection
  courses: string[];            // Pre-selected courseIds for all rounds
  createdAt: number;
  startedAt: number | null;     // When draft started (after AI backfill)
  maxPlayers: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MAX_PLAYERS = 8;
export const AI_BACKFILL_DELAY_MS = 15_000;  // 15s before AI fills empty slots
export const LOBBY_EXPIRY_MS = 30 * 60_000;  // 30 min stale lobby cleanup

export const MP_TIERS = {
  daily:    { label: 'Daily Blitz',           entryFee: 100,  prizePool: 5_000,  minLevel: 1  },
  weekly:   { label: 'Weekly Cup',            entryFee: 500,  prizePool: 25_000, minLevel: 5  },
  champion: { label: 'Champion Invitational', entryFee: 1000, prizePool: 50_000, minLevel: 10 },
} as const;

const BOT_NAMES = [
  'RoboRoll', 'MarbleBot', 'BounceAI', 'CyberSphere',
  'AutoRacer', 'NeonBot', 'TurboAI', 'PhantomRoll',
  'BlitzBot', 'SteelSphere', 'VoltRacer', 'PixelRoll',
];

// ---------------------------------------------------------------------------
// Lobby Reference
// ---------------------------------------------------------------------------

function lobbyRef(lobbyId: string) {
  return getDatabase().ref(`/lobbies/${lobbyId}`);
}

function activeLobbiesRef() {
  return getDatabase().ref('/lobbies');
}

// ---------------------------------------------------------------------------
// Create Lobby
// ---------------------------------------------------------------------------

export async function createLobby(
  uid: string,
  displayName: string,
  tier: 'daily' | 'weekly' | 'champion',
): Promise<string> {
  const ref = activeLobbiesRef().push();
  const lobbyId = ref.key!;
  const tierConfig = MP_TIERS[tier];

  // Pick 7 random courses for elimination rounds
  const seed = Date.now();
  const shuffled = [...ALL_COURSES].sort(() => Math.random() - 0.5);
  const courses = shuffled.slice(0, 7).map((c) => c.id);

  const lobby: LobbyData = {
    hostUid: uid,
    status: 'waiting',
    tier,
    entryFee: tierConfig.entryFee,
    prizePool: tierConfig.prizePool,
    players: {
      [uid]: {
        uid,
        displayName,
        isHost: true,
        isBot: false,
        marbleId: null,
        eliminated: false,
        eliminatedRound: null,
        joinedAt: Date.now(),
      },
    },
    rounds: [],
    currentRound: 0,
    draftOrder: [],
    draftTurn: 0,
    availableMarbles: MARBLES.map((m) => m.id),
    courseSeed: seed,
    courses,
    createdAt: Date.now(),
    startedAt: null,
    maxPlayers: MAX_PLAYERS,
  };

  await ref.set(lobby);
  return lobbyId;
}

// ---------------------------------------------------------------------------
// Join Lobby
// ---------------------------------------------------------------------------

export async function joinLobby(
  lobbyId: string,
  uid: string,
  displayName: string,
): Promise<boolean> {
  const ref = lobbyRef(lobbyId);
  const snap = await ref.once('value');
  const lobby = snap.val() as LobbyData | null;

  if (!lobby || lobby.status !== 'waiting') return false;

  const playerCount = Object.keys(lobby.players || {}).length;
  if (playerCount >= MAX_PLAYERS) return false;

  // Already in lobby
  if (lobby.players?.[uid]) return true;

  await ref.child(`players/${uid}`).set({
    uid,
    displayName,
    isHost: false,
    isBot: false,
    marbleId: null,
    eliminated: false,
    eliminatedRound: null,
    joinedAt: Date.now(),
  } as LobbyPlayer);

  return true;
}

// ---------------------------------------------------------------------------
// Find Open Lobbies (for matchmaking)
// ---------------------------------------------------------------------------

export async function findOpenLobbies(
  tier: 'daily' | 'weekly' | 'champion',
): Promise<{ lobbyId: string; lobby: LobbyData }[]> {
  const snap = await activeLobbiesRef()
    .orderByChild('status')
    .equalTo('waiting')
    .limitToFirst(10)
    .once('value');

  const results: { lobbyId: string; lobby: LobbyData }[] = [];
  snap.forEach((child) => {
    const lobby = child.val() as LobbyData;
    if (
      lobby.tier === tier &&
      lobby.status === 'waiting' &&
      Object.keys(lobby.players || {}).length < MAX_PLAYERS &&
      Date.now() - lobby.createdAt < LOBBY_EXPIRY_MS
    ) {
      results.push({ lobbyId: child.key!, lobby });
    }
    return undefined; // continue
  });

  return results;
}

// ---------------------------------------------------------------------------
// Quick Match — find or create
// ---------------------------------------------------------------------------

export async function quickMatch(
  uid: string,
  displayName: string,
  tier: 'daily' | 'weekly' | 'champion',
): Promise<string> {
  const openLobbies = await findOpenLobbies(tier);

  for (const { lobbyId } of openLobbies) {
    const joined = await joinLobby(lobbyId, uid, displayName);
    if (joined) return lobbyId;
  }

  // No open lobby found — create one
  return createLobby(uid, displayName, tier);
}

// ---------------------------------------------------------------------------
// AI Backfill — fills empty slots with bots
// ---------------------------------------------------------------------------

export async function backfillWithBots(lobbyId: string): Promise<void> {
  const ref = lobbyRef(lobbyId);
  const snap = await ref.once('value');
  const lobby = snap.val() as LobbyData | null;
  if (!lobby || lobby.status !== 'waiting') return;

  const existingPlayers = Object.keys(lobby.players || {});
  const slotsToFill = MAX_PLAYERS - existingPlayers.length;
  if (slotsToFill <= 0) return;

  const shuffledNames = [...BOT_NAMES].sort(() => Math.random() - 0.5);
  const updates: Record<string, LobbyPlayer> = {};

  for (let i = 0; i < slotsToFill; i++) {
    const botUid = `bot-${lobbyId.slice(-4)}-${i}`;
    updates[botUid] = {
      uid: botUid,
      displayName: shuffledNames[i % shuffledNames.length],
      isHost: false,
      isBot: true,
      marbleId: null,
      eliminated: false,
      eliminatedRound: null,
      joinedAt: Date.now(),
    };
  }

  const playerUpdates: Record<string, LobbyPlayer> = {};
  for (const [uid, player] of Object.entries(updates)) {
    playerUpdates[`players/${uid}`] = player;
  }

  await ref.update(playerUpdates);
}

// ---------------------------------------------------------------------------
// Start Draft — called by host after AI backfill
// ---------------------------------------------------------------------------

export async function startDraft(lobbyId: string): Promise<void> {
  const ref = lobbyRef(lobbyId);
  const snap = await ref.once('value');
  const lobby = snap.val() as LobbyData | null;
  if (!lobby) return;

  // Shuffle player order for draft (snake draft)
  const playerUids = Object.keys(lobby.players || {});
  const shuffled = playerUids.sort(() => Math.random() - 0.5);

  // Snake draft: 1-2-3-4-5-6-7-8 then 8-7-6-5-4-3-2-1 (but we only need 8 picks for 8 marbles)
  // Each player picks exactly 1 marble, so just use the shuffled order
  await ref.update({
    status: 'drafting',
    draftOrder: shuffled,
    draftTurn: 0,
    startedAt: Date.now(),
  });
}

// ---------------------------------------------------------------------------
// Draft Pick — player picks a marble
// ---------------------------------------------------------------------------

export async function draftPick(
  lobbyId: string,
  uid: string,
  marbleId: string,
): Promise<boolean> {
  const ref = lobbyRef(lobbyId);
  const snap = await ref.once('value');
  const lobby = snap.val() as LobbyData | null;
  if (!lobby || lobby.status !== 'drafting') return false;

  // Verify it's this player's turn
  const draftOrder = lobby.draftOrder || [];
  if (draftOrder[lobby.draftTurn] !== uid) return false;

  // Verify marble is available
  const available = lobby.availableMarbles || [];
  if (!available.includes(marbleId)) return false;

  // Update
  const newAvailable = available.filter((id) => id !== marbleId);
  const nextTurn = lobby.draftTurn + 1;
  const draftComplete = nextTurn >= draftOrder.length;

  await ref.update({
    [`players/${uid}/marbleId`]: marbleId,
    availableMarbles: newAvailable,
    draftTurn: nextTurn,
    ...(draftComplete ? { status: 'racing' } : {}),
  });

  return true;
}

// ---------------------------------------------------------------------------
// Auto-Draft for Bots
// ---------------------------------------------------------------------------

export async function autoDraftBots(lobbyId: string): Promise<void> {
  const ref = lobbyRef(lobbyId);

  // Keep picking for bots until a human's turn or draft is complete
  let keepGoing = true;
  while (keepGoing) {
    const snap = await ref.once('value');
    const lobby = snap.val() as LobbyData | null;
    if (!lobby || lobby.status !== 'drafting') return;

    const draftOrder = lobby.draftOrder || [];
    const currentUid = draftOrder[lobby.draftTurn];
    if (!currentUid) return;

    const player = lobby.players?.[currentUid];
    if (!player?.isBot) {
      keepGoing = false;
      continue;
    }

    // Bot picks a random available marble
    const available = lobby.availableMarbles || [];
    if (available.length === 0) return;

    const pick = available[Math.floor(Math.random() * available.length)];
    await draftPick(lobbyId, currentUid, pick);

    // Check if draft completed after this pick
    const nextSnap = await ref.once('value');
    const nextLobby = nextSnap.val() as LobbyData | null;
    if (!nextLobby || nextLobby.status !== 'drafting') return;
  }
}

// ---------------------------------------------------------------------------
// Submit Round Result (host only)
// ---------------------------------------------------------------------------

export async function submitRoundResult(
  lobbyId: string,
  hostUid: string,
  finishOrder: string[],  // marbleIds in finish order
): Promise<void> {
  const ref = lobbyRef(lobbyId);
  const snap = await ref.once('value');
  const lobby = snap.val() as LobbyData | null;
  if (!lobby || lobby.hostUid !== hostUid) return;

  // Find non-eliminated marbles that raced
  const activePlayers = Object.values(lobby.players || {}).filter(
    (p) => !p.eliminated && p.marbleId,
  );
  const activeMarbleIds = activePlayers.map((p) => p.marbleId!);

  // Filter finishOrder to only active marbles
  const raceFinish = finishOrder.filter((id) => activeMarbleIds.includes(id));

  // Last place marble → eliminated
  const eliminatedMarbleId = raceFinish[raceFinish.length - 1];
  const eliminatedPlayer = activePlayers.find((p) => p.marbleId === eliminatedMarbleId);

  const round: LobbyRound = {
    courseId: lobby.courses[lobby.currentRound] || '',
    finishOrder: raceFinish,
    eliminatedMarbleId,
    eliminatedPlayerId: eliminatedPlayer?.uid || '',
  };

  const rounds = [...(lobby.rounds || []), round];
  const nextRound = lobby.currentRound + 1;

  // Check if tournament is finished (only 1 player left)
  const remainingAfter = activePlayers.filter(
    (p) => p.uid !== eliminatedPlayer?.uid,
  );
  const isFinished = remainingAfter.length <= 1;

  const updates: Record<string, any> = {
    rounds,
    currentRound: nextRound,
    status: isFinished ? 'finished' : 'round_result',
  };

  // Mark eliminated player
  if (eliminatedPlayer) {
    updates[`players/${eliminatedPlayer.uid}/eliminated`] = true;
    updates[`players/${eliminatedPlayer.uid}/eliminatedRound`] = lobby.currentRound;
  }

  await ref.update(updates);
}

// ---------------------------------------------------------------------------
// Advance to Next Race (host only)
// ---------------------------------------------------------------------------

export async function advanceToNextRace(lobbyId: string): Promise<void> {
  await lobbyRef(lobbyId).update({ status: 'racing' });
}

// ---------------------------------------------------------------------------
// Listen to Lobby Changes
// ---------------------------------------------------------------------------

export function subscribeLobby(
  lobbyId: string,
  callback: (lobby: LobbyData | null) => void,
): () => void {
  const ref = lobbyRef(lobbyId);
  const handler = (snap: any) => {
    callback(snap.val() as LobbyData | null);
  };
  ref.on('value', handler);
  return () => ref.off('value', handler);
}

// ---------------------------------------------------------------------------
// Leave Lobby
// ---------------------------------------------------------------------------

export async function leaveLobby(lobbyId: string, uid: string): Promise<void> {
  const ref = lobbyRef(lobbyId);
  const snap = await ref.once('value');
  const lobby = snap.val() as LobbyData | null;
  if (!lobby) return;

  // If host leaves during waiting, delete lobby
  if (lobby.hostUid === uid && lobby.status === 'waiting') {
    await ref.remove();
    return;
  }

  // Remove player
  await ref.child(`players/${uid}`).remove();
}

// ---------------------------------------------------------------------------
// Get Winner
// ---------------------------------------------------------------------------

export function getWinner(lobby: LobbyData): LobbyPlayer | null {
  if (lobby.status !== 'finished') return null;
  const players = Object.values(lobby.players || {});
  return players.find((p) => !p.eliminated && !p.isBot) ||
         players.find((p) => !p.eliminated) ||
         null;
}

// ---------------------------------------------------------------------------
// Get Player Placement
// ---------------------------------------------------------------------------

export function getPlayerPlacement(lobby: LobbyData, uid: string): number {
  const players = Object.values(lobby.players || {});
  const eliminated = players
    .filter((p) => p.eliminated)
    .sort((a, b) => (a.eliminatedRound ?? 99) - (b.eliminatedRound ?? 99));

  const player = players.find((p) => p.uid === uid);
  if (!player) return 8;

  if (!player.eliminated) return 1; // Winner

  // Placement = total players - index in elimination order
  const elimIndex = eliminated.findIndex((p) => p.uid === uid);
  return players.length - elimIndex;
}

// ---------------------------------------------------------------------------
// Calculate Payout
// ---------------------------------------------------------------------------

export function calculateMPPayout(
  lobby: LobbyData,
  placement: number,
): number {
  const pool = lobby.prizePool;
  // 1st: 60%, 2nd: 20%, 3rd: 10%, 4th: 5%, 5th-8th: split 5%
  switch (placement) {
    case 1: return Math.floor(pool * 0.60);
    case 2: return Math.floor(pool * 0.20);
    case 3: return Math.floor(pool * 0.10);
    case 4: return Math.floor(pool * 0.05);
    default: return Math.floor(pool * 0.05 / 4); // 5-8th split remaining
  }
}
