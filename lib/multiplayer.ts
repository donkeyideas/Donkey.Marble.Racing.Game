/**
 * Multiplayer Tournament System — Firebase Realtime Database (Web SDK).
 *
 * Uses the modular `firebase/database` Web SDK rather than
 * @react-native-firebase/database, because the latter has hostile iOS Pod
 * dependencies (Firebase.h imports FirebaseAuth-Swift.h which only resolves
 * under specific use_frameworks!/use_modular_headers! combinations that
 * cascade-fail every other Pod). The Web SDK uses a WebSocket from JS — no
 * native pod, no Xcode archive issues, same Realtime Database API.
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

import {
  ref as dbRef,
  child,
  push,
  set,
  get,
  update,
  remove,
  onValue,
  query,
  limitToLast,
  DataSnapshot,
} from 'firebase/database';
import { getDb } from './firebase';
import { MARBLES } from '../theme';
import { ALL_COURSES } from '../data/courses';

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

/** How prize money is split among placements. */
export type PayoutMode = 'standard' | 'winner_takes_all' | 'survivors';

export interface LobbyData {
  hostUid: string;
  status: LobbyStatus;
  tier: 'daily' | 'weekly' | 'champion';
  entryFee: number;
  /** Legacy: pre-computed fixed pool, now derived dynamically from entryFee
   *  × players − rake at payout time. Kept as a serialized snapshot for
   *  historical lobbies in the DB. New lobbies set this to 0 at creation. */
  prizePool: number;
  payoutMode: PayoutMode;
  /** 6-character invite code for private lobbies. undefined = public. */
  code?: string;
  /** Private lobbies are excluded from quickMatch/findOpenLobbies/browser. */
  isPrivate?: boolean;
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

/** Fraction of the pot the house keeps as a rake. Historically 0.10
 *  but the spec docs and admin UI use 0.20; canonical source is now
 *  remote config (mp_rake). Kept as a back-compat export. */
export const MP_RAKE = 0.10;

/** Live MP rake from remote config, falls back to MP_RAKE. */
export function getMpRake(): number {
  // Lazy require to avoid circular imports during module init.
  const { getConfig } = require('./remoteConfig');
  return getConfig().multiplayer?.rake ?? MP_RAKE;
}

/** Live pool = (entry × number of paid-in players) × (1 − rake). Called from
 *  the lobby UI to show the pot growing as humans join, and from the payout
 *  calc at finish time. */
export function computePool(entryFee: number, paidInPlayers: number): number {
  return Math.floor(entryFee * paidInPlayers * (1 - getMpRake()));
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MAX_PLAYERS = 8;
export const AI_BACKFILL_DELAY_MS = 60_000;  // 60s window for humans before AI fills empty slots
export const LOBBY_EXPIRY_MS = 30 * 60_000;  // 30 min stale lobby cleanup

/* Tier metadata. entryFee + prizePool are baseline defaults; call
 * getMpTiers() to get the live values from remote config. minLevel +
 * label stay baked (not economy-tunable). */
export const MP_TIERS = {
  daily:    { label: 'Daily Blitz',           entryFee: 100,  prizePool: 5_000,  minLevel: 1  },
  weekly:   { label: 'Weekly Cup',            entryFee: 500,  prizePool: 25_000, minLevel: 5  },
  champion: { label: 'Champion Invitational', entryFee: 1000, prizePool: 50_000, minLevel: 10 },
} as const;

export type MpTierKey = keyof typeof MP_TIERS;

export function getMpTiers() {
  const { getConfig } = require('./remoteConfig');
  const live = getConfig().multiplayer;
  if (!live) return MP_TIERS;
  return {
    daily:    { ...MP_TIERS.daily,    entryFee: live.blitz.entry,        prizePool: live.blitz.pool },
    weekly:   { ...MP_TIERS.weekly,   entryFee: live.cup.entry,          prizePool: live.cup.pool },
    champion: { ...MP_TIERS.champion, entryFee: live.invitational.entry, prizePool: live.invitational.pool },
  };
}

// Bot display names are meant to feel like opponents, not obvious AI.
// "Bot" / "AI" stripped out so the lobby doesn't look like you're racing
// computers — the UI can still flag them as bots if it ever needs to,
// it just shouldn't be baked into the name string.
const BOT_NAMES = [
  'RoboRoll', 'MarbleMike', 'Bouncer', 'CyberSphere',
  'AutoRacer', 'NeonStrike', 'Turbo', 'PhantomRoll',
  'BlitzKid', 'SteelSphere', 'VoltRacer', 'PixelRoll',
];

// ---------------------------------------------------------------------------
// Lobby Reference helpers
// ---------------------------------------------------------------------------

function lobbyRef(lobbyId: string) {
  return dbRef(getDb(), `/lobbies/${lobbyId}`);
}

function activeLobbiesRef() {
  return dbRef(getDb(), '/lobbies');
}

// ---------------------------------------------------------------------------
// Create Lobby
// ---------------------------------------------------------------------------

export async function createLobby(
  uid: string,
  displayName: string,
  tier: 'daily' | 'weekly' | 'champion',
  payoutMode: PayoutMode = 'standard',
): Promise<string> {
  const newRef = push(activeLobbiesRef());
  const lobbyId = newRef.key!;
  const tierConfig = getMpTiers()[tier];

  // Pick 7 random courses for elimination rounds
  const seed = Date.now();
  const shuffled = [...ALL_COURSES].sort(() => Math.random() - 0.5);
  const courses = shuffled.slice(0, 7).map((c) => c.id);

  const lobby: LobbyData = {
    hostUid: uid,
    status: 'waiting',
    tier,
    entryFee: tierConfig.entryFee,
    // Pool now computed dynamically from paid-in players at payout time.
    // Persisted as 0 here so old code that reads .prizePool doesn't crash.
    prizePool: 0,
    payoutMode,
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

  await set(newRef, lobby);
  return lobbyId;
}

// ---------------------------------------------------------------------------
// Create Private Lobby — generates a 6-char code, excludes from quickMatch
// ---------------------------------------------------------------------------

export async function createPrivateLobby(
  uid: string,
  displayName: string,
  tier: 'daily' | 'weekly' | 'champion',
  payoutMode: PayoutMode = 'standard',
): Promise<{ lobbyId: string; code: string }> {
  const newRef = push(activeLobbiesRef());
  const lobbyId = newRef.key!;
  const tierConfig = getMpTiers()[tier];

  const seed = Date.now();
  const shuffled = [...ALL_COURSES].sort(() => Math.random() - 0.5);
  const courses = shuffled.slice(0, 7).map((c) => c.id);
  const code = generateLobbyCode();

  const lobby: LobbyData = {
    hostUid: uid,
    status: 'waiting',
    tier,
    entryFee: tierConfig.entryFee,
    prizePool: 0,
    payoutMode,
    code,
    isPrivate: true,
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

  await set(newRef, lobby);
  return { lobbyId, code };
}

// ---------------------------------------------------------------------------
// Join by Code — look up a private lobby by its invite code
// ---------------------------------------------------------------------------

export async function joinByCode(
  code: string,
  uid: string,
  displayName: string,
): Promise<{ ok: true; lobbyId: string } | { ok: false; reason: string }> {
  const normalized = code.trim().toUpperCase();
  if (normalized.length !== 6) {
    return { ok: false, reason: 'Codes are 6 characters.' };
  }
  // Scan recent lobbies for one matching the code. We don't pay for a
  // separate indexed query — the recent-N window is plenty for this.
  const q = query(activeLobbiesRef(), limitToLast(100));
  const snap = await get(q);
  let matchId: string | null = null;
  let matchLobby: LobbyData | null = null;
  snap.forEach((childSnap: DataSnapshot) => {
    const lobby = childSnap.val() as LobbyData;
    if (!lobby) return undefined;
    if (lobby.code === normalized && Date.now() - lobby.createdAt < LOBBY_EXPIRY_MS) {
      matchId = childSnap.key!;
      matchLobby = lobby;
    }
    return undefined;
  });
  if (!matchId || !matchLobby) {
    return { ok: false, reason: 'No lobby found with that code, or it has expired.' };
  }
  if ((matchLobby as LobbyData).status !== 'waiting') {
    return { ok: false, reason: 'That lobby has already started.' };
  }
  if (Object.keys((matchLobby as LobbyData).players || {}).length >= MAX_PLAYERS) {
    return { ok: false, reason: 'That lobby is full.' };
  }
  const joined = await joinLobby(matchId, uid, displayName);
  if (!joined) return { ok: false, reason: 'Couldn’t join (maybe it just filled).' };
  return { ok: true, lobbyId: matchId };
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
  const snap = await get(ref);
  const lobby = snap.val() as LobbyData | null;

  if (!lobby || lobby.status !== 'waiting') return false;

  const playerCount = Object.keys(lobby.players || {}).length;
  if (playerCount >= MAX_PLAYERS) return false;

  // Already in lobby
  if (lobby.players?.[uid]) return true;

  const player: LobbyPlayer = {
    uid,
    displayName,
    isHost: false,
    isBot: false,
    marbleId: null,
    eliminated: false,
    eliminatedRound: null,
    joinedAt: Date.now(),
  };
  await set(child(ref, `players/${uid}`), player);

  return true;
}

// ---------------------------------------------------------------------------
// Find Open Lobbies (for matchmaking)
// ---------------------------------------------------------------------------

export async function findOpenLobbies(
  tier: 'daily' | 'weekly' | 'champion',
): Promise<{ lobbyId: string; lobby: LobbyData }[]> {
  // Originally this used `orderByChild('status').equalTo('waiting')` which is
  // server-side efficient — but Firebase Realtime Database refuses such a query
  // unless `.indexOn: ["status"]` is configured in the security rules. To stay
  // self-contained (no Firebase Console changes needed), we fetch the most
  // recent N lobbies and filter client-side. Push keys are time-ordered, so
  // limitToLast gives newest lobbies first. Plenty efficient for early-stage
  // multiplayer with <100 active lobbies.
  const q = query(activeLobbiesRef(), limitToLast(50));
  const snap = await get(q);

  const results: { lobbyId: string; lobby: LobbyData }[] = [];
  snap.forEach((childSnap: DataSnapshot) => {
    const lobby = childSnap.val() as LobbyData;
    if (!lobby) return undefined;
    if (
      lobby.tier === tier &&
      lobby.status === 'waiting' &&
      !lobby.isPrivate &&  // private lobbies are code-only, never auto-matched
      Object.keys(lobby.players || {}).length < MAX_PLAYERS &&
      Date.now() - lobby.createdAt < LOBBY_EXPIRY_MS
    ) {
      results.push({ lobbyId: childSnap.key!, lobby });
    }
    return undefined;
  });

  return results;
}

// ---------------------------------------------------------------------------
// Find All Open Public Lobbies — for the manual lobby browser
// ---------------------------------------------------------------------------

export async function findAllOpenPublicLobbies(): Promise<{ lobbyId: string; lobby: LobbyData }[]> {
  const q = query(activeLobbiesRef(), limitToLast(50));
  const snap = await get(q);
  const results: { lobbyId: string; lobby: LobbyData }[] = [];
  snap.forEach((childSnap: DataSnapshot) => {
    const lobby = childSnap.val() as LobbyData;
    if (!lobby) return undefined;
    if (
      lobby.status === 'waiting' &&
      !lobby.isPrivate &&
      Object.keys(lobby.players || {}).length < MAX_PLAYERS &&
      Date.now() - lobby.createdAt < LOBBY_EXPIRY_MS
    ) {
      results.push({ lobbyId: childSnap.key!, lobby });
    }
    return undefined;
  });
  // Newest first
  results.sort((a, b) => b.lobby.createdAt - a.lobby.createdAt);
  return results;
}

// ---------------------------------------------------------------------------
// Queue Counts — how many players are currently queued in each tier+mode
// ---------------------------------------------------------------------------

export type QueueKey = `${'daily' | 'weekly' | 'champion'}-${PayoutMode}`;
export type QueueCounts = Record<QueueKey, number>;

export function emptyQueueCounts(): QueueCounts {
  const tiers: ('daily' | 'weekly' | 'champion')[] = ['daily', 'weekly', 'champion'];
  const modes: PayoutMode[] = ['standard', 'winner_takes_all', 'survivors'];
  const out = {} as QueueCounts;
  for (const t of tiers) for (const m of modes) out[`${t}-${m}` as QueueKey] = 0;
  return out;
}

export async function getQueueCounts(): Promise<QueueCounts> {
  const lobbies = await findAllOpenPublicLobbies();
  const counts = emptyQueueCounts();
  for (const { lobby } of lobbies) {
    const humans = Object.values(lobby.players || {}).filter(p => !p.isBot).length;
    const mode = (lobby.payoutMode || 'standard') as PayoutMode;
    const key = `${lobby.tier}-${mode}` as QueueKey;
    if (key in counts) counts[key] += humans;
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Lobby Codes — 6-char alphanumeric, no ambiguous chars (0/O, 1/I/L)
// ---------------------------------------------------------------------------

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // skip 0,O,1,I,L

export function generateLobbyCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

// ---------------------------------------------------------------------------
// Quick Match — find or create
// ---------------------------------------------------------------------------

export async function quickMatch(
  uid: string,
  displayName: string,
  tier: 'daily' | 'weekly' | 'champion',
  payoutMode: PayoutMode = 'standard',
): Promise<string> {
  // Players in matchmaking get bucketed by their chosen payout mode so a
  // "Winner Takes All" risk-taker doesn't get dropped into a Standard
  // lobby (and vice versa). Easiest way is to look only for open lobbies
  // that already have the same mode set; if none, create a fresh one.
  const openLobbies = await findOpenLobbies(tier);

  for (const { lobbyId, lobby } of openLobbies) {
    if (lobby.payoutMode && lobby.payoutMode !== payoutMode) continue;
    const joined = await joinLobby(lobbyId, uid, displayName);
    if (joined) return lobbyId;
  }

  // No open lobby found — create one
  return createLobby(uid, displayName, tier, payoutMode);
}

// ---------------------------------------------------------------------------
// AI Backfill — fills empty slots with bots
// ---------------------------------------------------------------------------

export async function backfillWithBots(lobbyId: string): Promise<void> {
  const ref = lobbyRef(lobbyId);
  const snap = await get(ref);
  const lobby = snap.val() as LobbyData | null;
  if (!lobby || lobby.status !== 'waiting') return;

  const existingPlayers = Object.keys(lobby.players || {});
  const slotsToFill = MAX_PLAYERS - existingPlayers.length;
  if (slotsToFill <= 0) return;

  const shuffledNames = [...BOT_NAMES].sort(() => Math.random() - 0.5);
  const playerUpdates: Record<string, LobbyPlayer> = {};

  for (let i = 0; i < slotsToFill; i++) {
    const botUid = `bot-${lobbyId.slice(-4)}-${i}`;
    playerUpdates[`players/${botUid}`] = {
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

  await update(ref, playerUpdates);
}

// ---------------------------------------------------------------------------
// Start Draft — called by host after AI backfill
// ---------------------------------------------------------------------------

export async function startDraft(lobbyId: string): Promise<void> {
  const ref = lobbyRef(lobbyId);
  const snap = await get(ref);
  const lobby = snap.val() as LobbyData | null;
  if (!lobby) return;

  // Shuffle player order for draft (snake draft)
  const playerUids = Object.keys(lobby.players || {});
  const shuffled = playerUids.sort(() => Math.random() - 0.5);

  await update(ref, {
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
  const snap = await get(ref);
  const lobby = snap.val() as LobbyData | null;
  if (!lobby || lobby.status !== 'drafting') return false;

  // Verify it's this player's turn
  const draftOrder = lobby.draftOrder || [];
  if (draftOrder[lobby.draftTurn] !== uid) return false;

  // Verify marble is available
  const available = lobby.availableMarbles || [];
  if (!available.includes(marbleId)) return false;

  const newAvailable = available.filter((id) => id !== marbleId);
  const nextTurn = lobby.draftTurn + 1;
  const draftComplete = nextTurn >= draftOrder.length;

  await update(ref, {
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

  let keepGoing = true;
  while (keepGoing) {
    const snap = await get(ref);
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

    const available = lobby.availableMarbles || [];
    if (available.length === 0) return;

    const pick = available[Math.floor(Math.random() * available.length)];
    await draftPick(lobbyId, currentUid, pick);

    const nextSnap = await get(ref);
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
  const snap = await get(ref);
  const lobby = snap.val() as LobbyData | null;
  if (!lobby || lobby.hostUid !== hostUid) return;

  const activePlayers = Object.values(lobby.players || {}).filter(
    (p) => !p.eliminated && p.marbleId,
  );
  const activeMarbleIds = activePlayers.map((p) => p.marbleId!);
  const raceFinish = finishOrder.filter((id) => activeMarbleIds.includes(id));

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

  const remainingAfter = activePlayers.filter(
    (p) => p.uid !== eliminatedPlayer?.uid,
  );
  const isFinished = remainingAfter.length <= 1;

  const updates: Record<string, any> = {
    rounds,
    currentRound: nextRound,
    status: isFinished ? 'finished' : 'round_result',
  };

  if (eliminatedPlayer) {
    updates[`players/${eliminatedPlayer.uid}/eliminated`] = true;
    updates[`players/${eliminatedPlayer.uid}/eliminatedRound`] = lobby.currentRound;
  }

  await update(ref, updates);
}

// ---------------------------------------------------------------------------
// Advance to Next Race (host only)
// ---------------------------------------------------------------------------

export async function advanceToNextRace(lobbyId: string): Promise<void> {
  await update(lobbyRef(lobbyId), { status: 'racing' });
}

// ---------------------------------------------------------------------------
// Listen to Lobby Changes
// ---------------------------------------------------------------------------

export function subscribeLobby(
  lobbyId: string,
  callback: (lobby: LobbyData | null) => void,
): () => void {
  const ref = lobbyRef(lobbyId);
  // onValue() returns its own unsubscribe function — perfect for our cleanup contract.
  return onValue(ref, (snap) => {
    callback(snap.val() as LobbyData | null);
  });
}

// ---------------------------------------------------------------------------
// Leave Lobby
// ---------------------------------------------------------------------------

export async function leaveLobby(lobbyId: string, uid: string): Promise<void> {
  const ref = lobbyRef(lobbyId);
  const snap = await get(ref);
  const lobby = snap.val() as LobbyData | null;
  if (!lobby) return;

  // If host leaves during waiting, delete lobby
  if (lobby.hostUid === uid && lobby.status === 'waiting') {
    await remove(ref);
    return;
  }

  await remove(child(ref, `players/${uid}`));
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

/** Number of players who actually paid an entry fee (i.e. humans — bots
 *  don't fund the pot). The pot scales with this so a half-bot lobby still
 *  has real stakes from the humans who DID pay. */
function paidInCount(lobby: LobbyData): number {
  return Object.values(lobby.players || {}).filter(p => !p.isBot).length;
}

/**
 * Payout for a given placement under the lobby's selected mode.
 *
 * Modes:
 *   - standard         50 / 30 / 20 to top 3, 4-8 lose entry → casual stakes
 *   - winner_takes_all 100% to 1st, everyone else gets nothing → max risk
 *   - survivors        ladder paying every round survived past R4, with the
 *                      champion still taking the largest slice → tournament
 *                      vibes, more places earn something, fewer go home dry
 *
 * Pool is derived dynamically from (entry × paid-in players) × (1 − rake).
 * Legacy lobbies in the DB with a fixed prizePool still work — if no
 * paid-in players are recorded, we fall back to lobby.prizePool.
 */
export function calculateMPPayout(
  lobby: LobbyData,
  placement: number,
): number {
  const paid = paidInCount(lobby);
  const pool = paid > 0
    ? computePool(lobby.entryFee, paid)
    : lobby.prizePool; // back-compat for old lobbies

  const mode = lobby.payoutMode || 'standard';

  /* All three modes now read admin-configurable ratios. The "standard"
   * vs "survivors" distinction is which placements get paid:
   *   - standard: 1st/2nd/3rd only (4th+ get nothing)
   *   - survivors: 1st/2nd/3rd/4th (4th paid for surviving to top half)
   *   - winner_takes_all: 1st gets the whole pool, ignoring ratios
   * Ratios live under multiplayer.placementRatios in remote config. */
  const { getConfig } = require('./remoteConfig');
  const ratios = getConfig().multiplayer?.placementRatios ?? { first: 0.60, second: 0.20, third: 0.10, fourth: 0.05 };

  switch (mode) {
    case 'winner_takes_all':
      return placement === 1 ? pool : 0;

    case 'survivors':
      switch (placement) {
        case 1: return Math.floor(pool * ratios.first);
        case 2: return Math.floor(pool * ratios.second);
        case 3: return Math.floor(pool * ratios.third);
        case 4: return Math.floor(pool * (ratios.fourth ?? 0.05));
        default: return 0;
      }

    case 'standard':
    default:
      switch (placement) {
        case 1: return Math.floor(pool * ratios.first);
        case 2: return Math.floor(pool * ratios.second);
        case 3: return Math.floor(pool * ratios.third);
        default: return 0;
      }
  }
}

/** Payout structure as percentages, used by the lobby UI to show players
 *  what they're playing for before the match starts. Static fallback —
 *  prefer getPayoutBreakdowns() at render time so admin edits show up
 *  without waiting for an app build. */
export const PAYOUT_BREAKDOWNS: Record<PayoutMode, { placement: string; pct: number }[]> = {
  standard: [
    { placement: '1st', pct: 50 },
    { placement: '2nd', pct: 30 },
    { placement: '3rd', pct: 20 },
  ],
  winner_takes_all: [
    { placement: '1st', pct: 100 },
  ],
  survivors: [
    { placement: '1st', pct: 60 },
    { placement: '2nd', pct: 25 },
    { placement: '3rd', pct: 10 },
    { placement: '4th', pct: 5 },
  ],
};

/** Live payout breakdowns built from admin-configurable placement ratios. */
export function getPayoutBreakdowns(): Record<PayoutMode, { placement: string; pct: number }[]> {
  const { getConfig } = require('./remoteConfig');
  const r = getConfig().multiplayer?.placementRatios;
  if (!r) return PAYOUT_BREAKDOWNS;
  const pct = (n: number) => Math.round(n * 100);
  return {
    standard: [
      { placement: '1st', pct: pct(r.first) },
      { placement: '2nd', pct: pct(r.second) },
      { placement: '3rd', pct: pct(r.third) },
    ],
    winner_takes_all: [{ placement: '1st', pct: 100 }],
    survivors: [
      { placement: '1st', pct: pct(r.first) },
      { placement: '2nd', pct: pct(r.second) },
      { placement: '3rd', pct: pct(r.third) },
      { placement: '4th', pct: pct(r.fourth ?? 0.05) },
    ],
  };
}

export const PAYOUT_MODE_META: Record<PayoutMode, { label: string; tagline: string }> = {
  standard:         { label: 'Standard',          tagline: 'Top 3 split the pot. 4–8 lose their entry.' },
  winner_takes_all: { label: 'Winner Takes All',  tagline: 'Champion gets everything. Max risk, max reward.' },
  survivors:        { label: 'Survivors',         tagline: 'Top 4 paid. Champion still takes the lion\'s share.' },
};
