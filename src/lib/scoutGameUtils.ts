import type { Scout } from './dexieDB';
import { 
  getOrCreateScout,
  getScout, 
  getAllScouts,
  updateScoutPoints,
  updateScoutStats,
  updateScoutWithPredictionResult,
  createMatchPrediction,
  getPredictionForMatch,
  getAllPredictionsForScout,
  getAllPredictionsForMatch,
  markPredictionAsVerified,
  deleteScout,
  clearGameData,
  reconcileScoutPredictionStats
} from './dexieDB';
import { checkForNewAchievements } from './achievementUtils';
import type { Achievement } from './achievementTypes';

// Pi values for different activities
export const PI_VALUES = {
  CORRECT_PREDICTION: 10,
  INCORRECT_PREDICTION: 0,
  PARTICIPATION_BONUS: 1,
  STREAK_BONUS_BASE: 2, // Base streak bonus (2 Pis for 2+ in a row)
} as const;

// Calculate streak bonus Pis based on streak length
export const calculateStreakBonus = (streakLength: number): number => {
  if (streakLength < 2) return 0;
  return PI_VALUES.STREAK_BONUS_BASE * (streakLength - 1);
};

// Get or create a scout by name (linked to sidebar selection)
export const getOrCreateScoutByName = async (name: string): Promise<Scout> => {
  return await getOrCreateScout(name);
};

// Calculate scout accuracy percentage
export const calculateAccuracy = (scout: Scout): number => {
  if (scout.totalPredictions === 0) return 0;
  return Math.round((scout.correctPredictions / scout.totalPredictions) * 100);
};

// Get leaderboard
export const getLeaderboard = async (): Promise<Scout[]> => {
  return await getAllScouts();
};

// Wrapper function to update scout stats with achievement checking
export const updateScoutStatsWithAchievements = async (
  name: string, 
  newPis: number, 
  correctPredictions: number, 
  totalPredictions: number,
  currentStreak?: number,
  longestStreak?: number
): Promise<{ newAchievements: Achievement[] }> => {
  // Update the stats first
  await updateScoutStats(name, newPis, correctPredictions, totalPredictions, currentStreak, longestStreak);
  
  // Check for new achievements
  const newAchievements = await checkForNewAchievements(name);
  
  return { newAchievements };
};

// Wrapper function to update scout with prediction result and achievement checking
export const updateScoutWithPredictionAndAchievements = async (
  name: string,
  isCorrect: boolean,
  basePoints: number,
  eventName: string,
  matchNumber: string
): Promise<{ newAchievements: Achievement[] }> => {
  // Update with prediction result first
  await updateScoutWithPredictionResult(name, isCorrect, basePoints, eventName, matchNumber);
  
  // Check for new achievements
  const newAchievements = await checkForNewAchievements(name);
  
  return { newAchievements };
};

export {
  getScout,
  getAllScouts,
  updateScoutPoints,
  updateScoutStats,
  updateScoutWithPredictionResult,
  createMatchPrediction,
  getPredictionForMatch,
  getAllPredictionsForScout,
  getAllPredictionsForMatch,
  markPredictionAsVerified,
  deleteScout,
  clearGameData,
  reconcileScoutPredictionStats
};
