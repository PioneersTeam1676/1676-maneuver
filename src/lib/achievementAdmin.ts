import { gameDB, updateScoutPoints } from "@/lib/dexieDB";
import type { ScoutAchievement } from "@/lib/dexieDB";
import { apiDelete, apiPost } from "@/lib/apiClient";
import { ACHIEVEMENT_DEFINITIONS } from "@/lib/achievementTypes";
export { getScoutAchievements } from "@/lib/achievementUtils";

export async function addAchievementForScout(
  scoutName: string,
  achievementId: string,
  applyPiReward: boolean = true,
): Promise<void> {
  const record: ScoutAchievement = {
    scoutName,
    achievementId,
    unlockedAt: Date.now(),
    progress: 100,
  };

  await gameDB.scoutAchievements.put(record);

  try {
    await apiPost("/game/achievements", { achievement: record });
  } catch (e) {
    // If remote fails, keep local; sync will retry later
    console.error("Failed to persist achievement remotely:", e);
  }

  if (applyPiReward) {
    const def = ACHIEVEMENT_DEFINITIONS.find((a) => a.id === achievementId);
    if (def && def.piReward) {
      await updateScoutPoints(scoutName, def.piReward);
    }
  }
}

export async function removeAchievementForScout(
  scoutName: string,
  achievementId: string,
  deductPiReward: boolean = false,
): Promise<void> {
  try {
    await apiDelete(`/game/achievements/${encodeURIComponent(scoutName)}/${encodeURIComponent(achievementId)}`);
  } catch (e) {
    console.error("Failed to delete achievement remotely:", e);
  }

  await gameDB.scoutAchievements
    .where("[scoutName+achievementId]")
    .equals([scoutName, achievementId])
    .delete();

  if (deductPiReward) {
    const def = ACHIEVEMENT_DEFINITIONS.find((a) => a.id === achievementId);
    if (def && def.piReward) {
      await updateScoutPoints(scoutName, -def.piReward);
    }
  }
}
