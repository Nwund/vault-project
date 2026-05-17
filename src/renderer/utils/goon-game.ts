// File: src/renderer/utils/goon-game.ts
//
// #362 G-138 — Goon-game roguelike. A turn-by-turn structured session
// driven by a procedurally-generated "run". Each run picks:
//
//   1. A floor count (4-8) — each floor advances arousal expectations.
//   2. A boss persona for the final floor (Mistress / Stepsister / …).
//   3. Per-floor encounters drawn from a weighted bag:
//        - watch N seconds of a randomly-tagged video
//        - hold edge for X seconds
//        - obey a JOI script
//        - take a debuff (denial extension, lockout) or buff (favorite)
//   4. Hand-of-cards UI lets player pick 1 of 3 encounters per floor.
//
// All state lives in a single GameState object the renderer renders.
// No persistence — runs are ephemeral, reflecting the "roguelike"
// feel. Stats (best floor, longest hold) live in localStorage for
// streak bragging.

export type EncounterKind =
  | 'watch' | 'edge' | 'joi' | 'task' | 'debuff' | 'buff'

export interface Encounter {
  kind: EncounterKind
  label: string
  /** Cost in "stamina" (caps at 100). */
  staminaCost: number
  /** Reward in "denial XP". */
  xpReward: number
  /** Optional payload (video tag for watch, seconds for edge, …). */
  payload?: Record<string, any>
}

export interface GameState {
  runId: string
  seed: number
  floor: number
  maxFloor: number
  stamina: number       // 0-100; reach 0 → forced cool-down floor
  xp: number            // total denial XP earned
  history: Encounter[]  // chosen encounters in order
  hand: Encounter[]     // currently offered 3 cards
  boss: 'mistress' | 'stepsister' | 'cheerleader' | 'boss' | 'goonbud'
  status: 'in-progress' | 'won' | 'lost'
}

function mulberry32(seed: number): () => number {
  return function() {
    seed |= 0; seed = seed + 0x6d2b79f5 | 0
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

const BOSSES: GameState['boss'][] = ['mistress', 'stepsister', 'cheerleader', 'boss', 'goonbud']

const ENCOUNTER_BAG: Array<(rng: () => number, floor: number) => Encounter> = [
  (rng, f) => ({ kind: 'watch', label: `Watch a ${pickTag(rng)} clip for ${30 + f * 10}s`, staminaCost: 5 + f, xpReward: 8 + f * 2, payload: { tag: pickTag(rng), seconds: 30 + f * 10 } }),
  (rng, f) => ({ kind: 'edge', label: `Hold edge for ${20 + f * 5}s`, staminaCost: 10 + f * 2, xpReward: 18 + f * 4, payload: { seconds: 20 + f * 5 } }),
  (rng, f) => ({ kind: 'joi', label: `Follow a ${f >= 3 ? 'strict' : 'soft'} JOI script`, staminaCost: 12 + f, xpReward: 20 + f * 3 }),
  (rng) => ({ kind: 'task', label: 'Spin the task wheel', staminaCost: 6, xpReward: 12 }),
  (rng) => ({ kind: 'debuff', label: 'Take a denial penalty (+24h tax)', staminaCost: 15, xpReward: 30 }),
  (rng) => ({ kind: 'buff', label: 'Pick a favorite clip from your library', staminaCost: 0, xpReward: 5 }),
]

const TAGS = ['edging', 'denial', 'tease', 'femdom', 'joi', 'asmr', 'pmv', 'cei']
function pickTag(rng: () => number): string {
  return TAGS[Math.floor(rng() * TAGS.length)]
}

export function startRun(seed = Date.now()): GameState {
  const rng = mulberry32(seed)
  const maxFloor = 4 + Math.floor(rng() * 5)
  const boss = BOSSES[Math.floor(rng() * BOSSES.length)]
  const state: GameState = {
    runId: `r-${seed}`,
    seed,
    floor: 1,
    maxFloor,
    stamina: 100,
    xp: 0,
    history: [],
    hand: [],
    boss,
    status: 'in-progress',
  }
  state.hand = dealHand(rng, state.floor)
  return state
}

function dealHand(rng: () => number, floor: number): Encounter[] {
  const picks: Encounter[] = []
  while (picks.length < 3) {
    const factory = ENCOUNTER_BAG[Math.floor(rng() * ENCOUNTER_BAG.length)]
    const e = factory(rng, floor)
    if (!picks.some((p) => p.label === e.label)) picks.push(e)
  }
  return picks
}

export function chooseCard(state: GameState, cardIndex: number): GameState {
  if (state.status !== 'in-progress') return state
  const card = state.hand[cardIndex]
  if (!card) return state
  const newState: GameState = { ...state, history: [...state.history, card] }
  newState.stamina = Math.max(0, newState.stamina - card.staminaCost)
  newState.xp += card.xpReward
  if (newState.floor >= newState.maxFloor) {
    newState.status = 'won'
    newState.hand = []
    return newState
  }
  if (newState.stamina <= 0) {
    newState.status = 'lost'
    newState.hand = []
    return newState
  }
  newState.floor += 1
  const rng = mulberry32(newState.seed + newState.floor)
  newState.hand = dealHand(rng, newState.floor)
  return newState
}

// Persisted personal-best stats.
const PB_KEY = 'vault.goonGame.personalBests'

export interface PersonalBests {
  bestFloor: number
  bestXp: number
  runsCompleted: number
  bossesDefeated: Record<string, number>
}

export function loadPBs(): PersonalBests {
  try {
    const raw = localStorage.getItem(PB_KEY)
    if (raw) return JSON.parse(raw) as PersonalBests
  } catch { /* ignore */ }
  return { bestFloor: 0, bestXp: 0, runsCompleted: 0, bossesDefeated: {} }
}

export function recordRun(final: GameState): PersonalBests {
  const pb = loadPBs()
  pb.runsCompleted += 1
  pb.bestFloor = Math.max(pb.bestFloor, final.floor)
  pb.bestXp = Math.max(pb.bestXp, final.xp)
  if (final.status === 'won') {
    pb.bossesDefeated[final.boss] = (pb.bossesDefeated[final.boss] ?? 0) + 1
  }
  localStorage.setItem(PB_KEY, JSON.stringify(pb))
  return pb
}
