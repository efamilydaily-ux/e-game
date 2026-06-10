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
export const UNLOCK_ORDER = [0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 5];

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
  };
}

// ─── Question generation ──────────────────────────────────────────────────────

/**
 * Returns the first error question due for replay at the current answeredCount,
 * or null if none.
 *
 * @param {object} errorTracker
 * @param {number} answeredCount
 * @param {object|null} lastQuestion – skips if it would produce a consecutive duplicate
 */
export function getDueReplayQuestion(errorTracker, answeredCount, lastQuestion = null) {
  for (const key of Object.keys(errorTracker)) {
    const entry = errorTracker[key];

    // Already reserved for the current question cycle — skip to prevent repeat
    if (entry.pendingAt != null) continue;

    if (!entry.replayAt || entry.replayAt.length === 0) continue;

    const nextReplayAt = entry.replayAt[0];
    if (answeredCount >= nextReplayAt) {
      // Skip if it would be identical to the last question
      if (lastQuestion && lastQuestion.a === entry.a && lastQuestion.b === entry.b) continue;

      // Reserve this checkpoint now — prevents re-triggering before player answers
      entry.pendingAt = entry.replayAt.shift();
      return { a: entry.a, b: entry.b, answer: entry.a * entry.b };
    }
  }
  return null;
}

/**
 * Generate a random multiplication question.
 * Avoids factor 1; picks from DIGITS (2-9).
 * Ensures the new question is not identical to lastQuestion.
 *
 * @param {object} errorTracker
 * @param {number} answeredCount
 * @param {object|null} lastQuestion – the previous question; avoids consecutive repeat
 * @returns {{ a: number, b: number, answer: number, isReplay: boolean }}
 */
export function generateQuestion(errorTracker = {}, answeredCount = 0, lastQuestion = null) {
  // Check replay queue first (skips same-as-last automatically)
  const dueReplay = getDueReplayQuestion(errorTracker, answeredCount, lastQuestion);
  if (dueReplay) {
    return { ...dueReplay, isReplay: true };
  }

  const { DIGITS } = GAME_CONFIG;
  let a, b, attempts = 0;

  // Retry up to 20 times to avoid producing the same question as last time
  do {
    a = DIGITS[Math.floor(Math.random() * DIGITS.length)];
    b = DIGITS[Math.floor(Math.random() * DIGITS.length)];
    attempts++;
  } while (
    lastQuestion &&
    lastQuestion.a === a &&
    lastQuestion.b === b &&
    attempts < 20
  );

  return { a, b, answer: a * b, isReplay: false };
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

    // Mark replay as done: consume pendingAt → replayed
    if (question.isReplay && next.errorTracker[key]) {
      const entry = next.errorTracker[key];
      if (entry.pendingAt != null) {
        entry.replayed.push(entry.pendingAt);
        entry.pendingAt = null;
      }
    }

    // Calculate puzzle unlocks
    newUnlocks = applyScoreToPuzzle(next);
  } else {
    next.combo = 0;
    next.wrongCount += 1;

    // Register / update error tracker (FIFO)
    if (!next.errorTracker[key]) {
      next.errorTracker[key] = {
        a, b,
        replayAt: [...GAME_CONFIG.ERROR_REPLAY_AT],
        replayed: [],
        pendingAt: null,
      };
    } else {
      const existingEntry = next.errorTracker[key];
      // If a replay was pending (player answered wrong again), put it back at front
      if (existingEntry.pendingAt != null) {
        existingEntry.replayAt.unshift(existingEntry.pendingAt);
        existingEntry.pendingAt = null;
      }
      GAME_CONFIG.ERROR_REPLAY_AT.forEach(checkpoint => {
        if (
          !existingEntry.replayAt.includes(checkpoint) &&
          !existingEntry.replayed.includes(checkpoint)
        ) {
          existingEntry.replayAt.push(checkpoint);
        }
      });
      existingEntry.replayAt.sort((a, b) => a - b);
    }
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

  let remaining = totalCellsEarned;

  for (let pi = 0; pi < puzzles.length; pi++) {
    const puzzle = puzzles[pi];
    const cellsForThisPuzzle = Math.min(remaining, GAME_CONFIG.CELLS_PER_PUZZLE);

    const targetUnlocked = UNLOCK_ORDER.slice(0, cellsForThisPuzzle);
    const alreadyUnlocked = new Set(puzzle.unlockedIndices);
    targetUnlocked.forEach(idx => {
      if (!alreadyUnlocked.has(idx)) {
        puzzle.unlockedIndices.push(idx);
        if (pi === gameData.currentPuzzleIndex) {
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

  // Only advance index if there is a next puzzle
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
