/**
 * SM-2 Spaced Repetition Algorithm
 *
 * Based on the SuperMemo SM-2 algorithm by Piotr Woźniak.
 * This is the same algorithm used by Anki (with modifications).
 *
 * Quality scores (user's self-assessment):
 *   0 - Complete blackout
 *   1 - Incorrect; the correct answer remembered
 *   2 - Incorrect; but correct answer seemed easy to recall
 *   3 - Correct with serious difficulty
 *   4 - Correct after hesitation
 *   5 - Perfect response
 */

export interface SM2State {
  easeFactor: number;
  interval: number;
  repetitions: number;
}

export interface SM2Result {
  easeFactor: number;
  interval: number;
  repetitions: number;
  nextReview: Date;
}

/**
 * Calculate the next review schedule based on the user's quality rating.
 */
export function sm2(state: SM2State, quality: number): SM2Result {
  let { easeFactor, interval, repetitions } = state;

  if (quality < 0 || quality > 5) {
    throw new Error("Quality must be between 0 and 5");
  }

  if (quality >= 3) {
    // Correct response
    if (repetitions === 0) {
      interval = 1;
    } else if (repetitions === 1) {
      interval = 6;
    } else {
      interval = Math.round(interval * easeFactor);
    }
    repetitions += 1;
  } else {
    // Incorrect response — reset
    repetitions = 0;
    interval = 1;
  }

  // Update ease factor
  easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (easeFactor < 1.3) easeFactor = 1.3;

  // Calculate next review date
  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + interval);

  return { easeFactor, interval, repetitions, nextReview };
}

/**
 * Get the human-readable interval description.
 */
export function describeInterval(interval: number): string {
  if (interval === 0) return "现在";
  if (interval === 1) return "明天";
  if (interval < 7) return `${interval} 天后`;
  if (interval < 30) return `${Math.round(interval / 7)} 周后`;
  if (interval < 365) return `${Math.round(interval / 30)} 个月后`;
  return `${Math.round(interval / 365)} 年后`;
}
