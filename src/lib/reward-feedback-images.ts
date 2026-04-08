import rewardManifest from "@/lib/reward-manifest.json";

export type RewardManifest = typeof rewardManifest;

const DEFAULT_PREFIX = "german-reward-img";

/**
 * Client-only: picks a reward image URL without repeating until every path
 * in the pool has been used once, then resets the pool for that kind.
 */
export function pickRewardImageUrl(
  kind: "success" | "fail",
  m: RewardManifest,
  storageKeyPrefix = DEFAULT_PREFIX,
): string | null {
  if (typeof window === "undefined") return null;
  const paths = m[kind];
  if (!paths?.length) return null;

  const key = `${storageKeyPrefix}:${kind}:used`;
  let used: number[] = [];
  try {
    const raw = sessionStorage.getItem(key);
    if (raw) used = JSON.parse(raw) as number[];
  } catch {
    used = [];
  }

  const unused = paths.map((_, i) => i).filter((i) => !used.includes(i));
  let pick: number;
  if (unused.length === 0) {
    sessionStorage.removeItem(key);
    pick = Math.floor(Math.random() * paths.length);
    sessionStorage.setItem(key, JSON.stringify([pick]));
  } else {
    pick = unused[Math.floor(Math.random() * unused.length)]!;
    used.push(pick);
    sessionStorage.setItem(key, JSON.stringify(used));
  }
  return paths[pick] ?? null;
}
