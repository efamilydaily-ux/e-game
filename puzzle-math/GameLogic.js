/**
 * GameLogic.js
 * Pure-logic module for 乘法神速賽.
 * No DOM / React dependency – fully testable in isolation.
 *
 * Puzzle layout (4 × 3 = 12 cells, index 0-11):
 *   [ 0][ 1][ 2][ 3]
 *   [ 4][ 5][ 6][ 7]   ← index 5 is the centre cell (must unlock LAST)
 *   [ 8][ 9][10][11]
 *
 * Unlock order (11 cells freely + centre last):
 *   Predefined sequence that skips index 5 until all others are done.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

export const GAME_CONFIG = {
  DIGITS: [2, 3, 4, 5, 6, 7, 8, 9], // strict 2-9, no 1
  POINTS_PER_20: 20,                  // score threshold per puzzle cell
  CELLS_PER_PUZZLE: 12,
  TOTAL_PUZZLES: 10,
  CENTRE_INDEX: 5,
  // Error queue: re-ask wrong answers after these answer counts
  ERROR_REPLAY_AT: [5, 10, 20],
};

/**
 * Predefined unlock order for a 12-cell puzzle.
 * Centre (5) is always the very last slot.
 */
export const UNLOCK_ORDER = [0, 3, 8, 1, 7, 6, 11, 10, 4, 2, 9, 5];

// ─── Default game state ───────────────────────────────────────────────────────

export function createDefaultGameData() {
  return {
    totalScore: 0,
    combo: 0,
    maxCombo: 0,
    answeredCount: 0,
    correctCount: 0,
    wrongCount: 0,
    puzzles: Array.from({ length: GAME_CONFIG.TOTAL_PUZZLES }, () => ({
      unlockedIndices: [],
      completed: false,
    })),
    currentPuzzleIndex: 0,
    errorTracker: {},
    // Key of the replay question currently in-flight (set by processAnswer,
    // read by getDueReplayQuestion to avoid re-issuing the same slot)
    pendingReplayKey: null,
  };
}

// ─── Question generation ──────────────────────────────────────────────────────

/**
 * Returns the first error question due for replay, consuming its checkpoint
 * immediately (pendingAt) so it cannot fire again until answered.
 *
 * replayAt stores ABSOLUTE answeredCount thresholds calculated at wrong-answer
 * time as (wrongAnsweredCount + 5/10/20), so they fire exactly 5, 10, 20
 * questions after the mistake — not from game start.
 *
 * @param {object} errorTracker  – mutated in place (pendingAt reservation)
 * @param {number} answeredCount
 * @param {object|null} lastQuestion – skips same-as-last to prevent consecutive repeat
 */
/**
 * PURE READ — never mutates errorTracker.
 * Returns { key, a, b, answer } for the first due replay, or null.
 *
 * @param {object}      errorTracker
 * @param {number}      answeredCount
 * @param {string|null} pendingReplayKey  – key already in-flight, skip it
 * @param {object|null} lastQuestion      – skip if same as previous (no back-to-back repeat)
 */
export function getDueReplayQuestion(
  errorTracker,
  answeredCount,
  pendingReplayKey = null,
  lastQuestion = null,
) {
  for (const key of Object.keys(errorTracker)) {
    // This slot is already issued and awaiting an answer
    if (key === pendingReplayKey) continue;

    const entry = errorTracker[key];
    if (!entry.replayAt || entry.replayAt.length === 0) continue;

    const nextAt = entry.replayAt[0];
    if (answeredCount >= nextAt) {
      if (lastQuestion && lastQuestion.a === entry.a && lastQuestion.b === entry.b) continue;
      return { key, a: entry.a, b: entry.b, answer: entry.a * entry.b };
    }
  }
  return null;
}

/**
 * Generate the next question.
 * Replay queue is checked first; falls back to a fresh random question
 * that is guaranteed not to be identical to lastQuestion.
 *
 * @param {object} errorTracker  – may be mutated (pendingAt reservation)
 * @param {number} answeredCount
 * @param {object|null} lastQuestion
 * @returns {{ a, b, answer, isReplay }}
 */
/**
 * PURE READ — never mutates any state.
 * Returns the next question. replayKey is non-null when a replay is issued;
 * pass it to processAnswer so it can record pendingReplayKey in gameData.
 *
 * @param {object}      errorTracker
 * @param {number}      answeredCount
 * @param {string|null} pendingReplayKey
 * @param {object|null} lastQuestion
 * @returns {{ a, b, answer, isReplay, replayKey: string|null }}
 */
export function generateQuestion(
  errorTracker = {},
  answeredCount = 0,
  pendingReplayKey = null,
  lastQuestion = null,
) {
  const due = getDueReplayQuestion(errorTracker, answeredCount, pendingReplayKey, lastQuestion);
  if (due) {
    return { a: due.a, b: due.b, answer: due.answer, isReplay: true, replayKey: due.key };
  }

  const { DIGITS } = GAME_CONFIG;
  let a, b, attempts = 0;
  do {
    a = DIGITS[Math.floor(Math.random() * DIGITS.length)];
    b = DIGITS[Math.floor(Math.random() * DIGITS.length)];
    attempts++;
  } while (lastQuestion && lastQuestion.a === a && lastQuestion.b === b && attempts < 20);

  return { a, b, answer: a * b, isReplay: false, replayKey: null };
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

/**
 * Calculate points for a correct answer given the current combo.
 * Combo 0-2 → 1 pt, 3-5 → 2 pt, 6+ → 3 pt
 */
export function calcPoints(combo) {
  if (combo >= 6) return 3;
  if (combo >= 3) return 2;
  return 1;
}

/**
 * Process a player's answer.
 * Returns a new copy of gameData with all state updated.
 *
 * @param {object} gameData   – current state (treated as immutable)
 * @param {{ a, b, answer, isReplay }} question
 * @param {number} playerAnswer
 * @returns {{ gameData: object, correct: boolean, pointsEarned: number, newUnlocks: number[] }}
 */
export function processAnswer(gameData, question, playerAnswer) {
  const correct = playerAnswer === question.answer;

  // Deep clone to keep state immutable
  const next = JSON.parse(JSON.stringify(gameData));
  const { a, b } = question;
  const key = `${a}x${b}`;

  next.answeredCount += 1;

  let pointsEarned = 0;
  let newUnlocks = [];

  if (correct) {
    next.combo += 1;
    next.maxCombo = Math.max(next.maxCombo, next.combo);
    next.correctCount += 1;
    pointsEarned = calcPoints(next.combo - 1);
    next.totalScore += pointsEarned;

    // Replay answered correctly: shift the triggered checkpoint → replayed[]
    if (question.isReplay && question.replayKey && next.errorTracker[question.replayKey]) {
      const entry = next.errorTracker[question.replayKey];
      if (entry.replayAt.length > 0) {
        entry.replayed.push(entry.replayAt.shift());
      }
    }
    next.pendingReplayKey = null;  // slot answered, clear in-flight marker

    // Calculate puzzle unlocks
    newUnlocks = applyScoreToPuzzle(next);
  } else {
    next.combo = 0;
    next.wrongCount += 1;

    // Record wrong answer with RELATIVE checkpoints:
    //   replay at answeredCount + 5, + 10, + 20 from THIS mistake.
    // If the same question was wrong before, RESET its queue entirely —
    //   "re-count from this wrong answer" as per spec.
    const checkpoints = GAME_CONFIG.ERROR_REPLAY_AT.map(o => next.answeredCount + o);
    if (!next.errorTracker[key]) {
      next.errorTracker[key] = { a, b, replayAt: checkpoints, replayed: [] };
    } else {
      // Reset: discard old queue, start fresh from now
      next.errorTracker[key].replayAt = checkpoints;
      next.errorTracker[key].replayed = [];
    }
    next.pendingReplayKey = null;  // clear any in-flight marker
  }

  return { gameData: next, correct, pointsEarned, newUnlocks };
}

// ─── Puzzle unlock logic ──────────────────────────────────────────────────────

/**
 * Based on totalScore, compute how many cells should be unlocked
 * across all puzzles, then apply any newly earned cells.
 * Mutates `gameData` in place (after deep-clone in processAnswer).
 * Returns array of newly unlocked cell indices (for animation).
 */
export function applyScoreToPuzzle(gameData) {
  // Guard: if all puzzles already completed, nothing to unlock
  const allDone = gameData.puzzles.every(p => p.completed);
  if (allDone) return [];

  const { totalScore, puzzles } = gameData;
  const totalCellsEarned = Math.floor(totalScore / GAME_CONFIG.POINTS_PER_20);
  const newUnlocks = [];

  // Snapshot active puzzle index BEFORE any advance,
  // so newUnlocks always refers to the puzzle the player is currently viewing.
  const activePuzzleIdx = gameData.currentPuzzleIndex;

  let remaining = totalCellsEarned;

  for (let pi = 0; pi < puzzles.length; pi++) {
    const puzzle = puzzles[pi];
    const cellsForThisPuzzle = Math.min(remaining, GAME_CONFIG.CELLS_PER_PUZZLE);

    const targetUnlocked = UNLOCK_ORDER.slice(0, cellsForThisPuzzle);
    const alreadyUnlocked = new Set(puzzle.unlockedIndices);
    targetUnlocked.forEach(idx => {
      if (!alreadyUnlocked.has(idx)) {
        puzzle.unlockedIndices.push(idx);
        // Animate only cells on the puzzle that was active when this answer was given
        if (pi === activePuzzleIdx) {
          newUnlocks.push(idx);
        }
      }
    });

    puzzle.unlockedIndices.sort((a, b) =>
      UNLOCK_ORDER.indexOf(a) - UNLOCK_ORDER.indexOf(b)
    );

    puzzle.completed = puzzle.unlockedIndices.length >= GAME_CONFIG.CELLS_PER_PUZZLE;

    remaining -= GAME_CONFIG.CELLS_PER_PUZZLE;
    if (remaining <= 0) break;
  }

  // Advance to next puzzle AFTER newUnlocks has been recorded
  if (
    puzzles[gameData.currentPuzzleIndex]?.completed &&
    gameData.currentPuzzleIndex < GAME_CONFIG.TOTAL_PUZZLES - 1
  ) {
    gameData.currentPuzzleIndex += 1;
  }

  return newUnlocks;
}

/**
 * Get the set of unlocked cell indices for a given puzzle.
 */
export function getUnlockedSet(gameData, puzzleIndex) {
  return new Set(gameData.puzzles[puzzleIndex]?.unlockedIndices ?? []);
}

/**
 * Calculate progress percentage for the current puzzle.
 */
export function puzzleProgress(gameData) {
  const puzzle = gameData.puzzles[gameData.currentPuzzleIndex];
  if (!puzzle) return 0;
  return Math.round((puzzle.unlockedIndices.length / GAME_CONFIG.CELLS_PER_PUZZLE) * 100);
}

/**
 * Score needed to unlock the next puzzle cell.
 */
export function scoreToNextCell(gameData) {
  const cellsEarned = Math.floor(gameData.totalScore / GAME_CONFIG.POINTS_PER_20);
  const nextThreshold = (cellsEarned + 1) * GAME_CONFIG.POINTS_PER_20;
  return nextThreshold - gameData.totalScore;
}

// ─── Generate multiple-choice options ────────────────────────────────────────

/**
 * Generate 4 answer options including the correct answer.
 * Options are shuffled. Distractors stay within plausible multiplication range.
 */
export function generateOptions(correctAnswer) {
  const options = new Set([correctAnswer]);

  while (options.size < 4) {
    const offset = Math.floor(Math.random() * 20) - 10;
    const candidate = correctAnswer + offset;
    if (candidate > 0 && candidate !== correctAnswer) {
      options.add(candidate);
    }
  }

  return [...options].sort(() => Math.random() - 0.5);
}
