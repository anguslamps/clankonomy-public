import type { ScoreDirection } from "./types";

export function compareScores(
  left: number,
  right: number,
  direction: ScoreDirection,
): number {
  if (left === right) return 0;
  if (direction === "lower_is_better") {
    return left < right ? -1 : 1;
  }
  return left > right ? -1 : 1;
}

export function isScoreBetter(
  candidate: number,
  incumbent: number | null | undefined,
  direction: ScoreDirection,
): boolean {
  if (incumbent === null || incumbent === undefined) return true;
  return compareScores(candidate, incumbent, direction) < 0;
}

export function bestScore(
  scores: Array<number | null | undefined>,
  direction: ScoreDirection,
): number | null {
  let best: number | null = null;
  for (const score of scores) {
    if (score === null || score === undefined) continue;
    if (best === null || isScoreBetter(score, best, direction)) {
      best = score;
    }
  }
  return best;
}

export function sortRankedEntries<T>(
  entries: T[],
  direction: ScoreDirection,
  getScore: (entry: T) => number,
  getCreatedAt: (entry: T) => Date,
  getId: (entry: T) => string,
): T[] {
  return [...entries].sort((left, right) => {
    const scoreOrder = compareScores(
      getScore(left),
      getScore(right),
      direction,
    );
    if (scoreOrder !== 0) return scoreOrder;

    const createdOrder =
      getCreatedAt(left).getTime() - getCreatedAt(right).getTime();
    if (createdOrder !== 0) return createdOrder;

    return getId(left).localeCompare(getId(right));
  });
}
