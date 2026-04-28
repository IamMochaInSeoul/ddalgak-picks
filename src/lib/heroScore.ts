// §3.9 — Hero-person scoring: heroBonus, heroMatchKind, exclusionReason injection
import type { PhotoEntry, PersonCluster, HeroConfig } from "./types";

/** Classify how a photo matches the current hero config */
export function classifyHeroMatch(
  photo: PhotoEntry,
  heroConfig: HeroConfig
): NonNullable<PhotoEntry["heroMatchKind"]> {
  const { selectedPersonIds, mode } = heroConfig;
  if (selectedPersonIds.length === 0) return "none";

  const present = photo.presentPersonIds ?? [];
  const heroesPresent = selectedPersonIds.filter((id) => present.includes(id));

  if (mode === "AND") {
    return heroesPresent.length === selectedPersonIds.length ? "all" : "none";
  }
  // OR mode
  if (heroesPresent.length === selectedPersonIds.length) return "all";
  if (heroesPresent.length > 0) return "any";
  return "none";
}

/** Additive score bonus (points, not 0-1) for the given match kind */
export function computeHeroBonus(
  matchKind: PhotoEntry["heroMatchKind"],
  mode: HeroConfig["mode"]
): number {
  if (!matchKind || matchKind === "non_hero_guaranteed") return 0;
  if (matchKind === "all") return 15;
  if (matchKind === "any" && mode === "OR") return 10;
  return 0;
}

/**
 * §3.9 — Write heroMatchKind, heroBonus, finalScore, and exclusionReasons
 * onto every PhotoEntry. Call this after the user picks heroes on PersonSelect.
 * Safe to call multiple times — idempotent (clears previous hero exclusions first).
 */
export function applyHeroScores(
  photos: Map<string, PhotoEntry>,
  heroConfig: HeroConfig,
  _personClusters: Map<string, PersonCluster>
): void {
  const { selectedPersonIds, mode, guaranteeNonHeroCount: _g } = heroConfig;
  const heroActive = selectedPersonIds.length > 0;

  for (const [, entry] of photos) {
    // Clear previous hero exclusions to stay idempotent
    if (entry.exclusionReasons) {
      entry.exclusionReasons = entry.exclusionReasons.filter(
        (r) => r.kind !== "hero_absent"
      );
    }

    if (!heroActive) {
      entry.heroMatchKind = "none";
      entry.heroBonus = 0;
      entry.finalScore = (entry.score?.total ?? 0) * 100;
      continue;
    }

    const matchKind = classifyHeroMatch(entry, heroConfig);
    entry.heroMatchKind = matchKind;
    entry.heroBonus = computeHeroBonus(matchKind, mode);
    entry.finalScore = Math.min(100, (entry.score?.total ?? 0) * 100 + entry.heroBonus);

    // AND mode: missing hero = exclusion signal for selectBest
    if (mode === "AND" && matchKind === "none") {
      entry.exclusionReasons = [
        ...(entry.exclusionReasons ?? []),
        { kind: "hero_absent" as const, mode: "AND" as const },
      ];
    }
  }
}
