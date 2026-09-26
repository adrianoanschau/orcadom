export function computeGoalProgress(saved: number, targetAmount: number) {
  const ratio = targetAmount > 0 ? saved / targetAmount : 0;
  return {
    saved,
    ratio,
    remaining: targetAmount - saved,
  };
}

export function isGoalReached(saved: number, targetAmount: number): boolean {
  return targetAmount > 0 && saved >= targetAmount;
}
