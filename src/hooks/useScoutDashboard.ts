import { useState, useEffect, useMemo } from 'react';
import { getAllScouts, calculateAccuracy, reconcileScoutPredictionStats } from '@/lib/scoutGameUtils';
import { getAchievementStats } from '@/lib/achievementUtils';
import type { Scout } from '@/lib/dexieDB';
import { analytics } from '@/lib/analytics';

export type ScoutMetric = "Pis" | "totalPis" | "totalPredictions" | "correctPredictions" | "accuracy" | "currentStreak" | "longestStreak";

export interface ScoutChartData {
  name: string;
  value: number;
  scout: Scout;
}

export function useScoutDashboard() {
  const [scouts, setScouts] = useState<Scout[]>([]);
  const [achievementPis, setAchievementPis] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [chartMetric, setChartMetric] = useState<ScoutMetric>("totalPis");
  const [chartType, setChartType] = useState<"bar" | "line" | "table">("bar");

  const metricOptions = [
    { key: "totalPis", label: "Total Pis", icon: "Trophy" },
    { key: "Pis", label: "Prediction Pis", icon: "Trophy" },
    { key: "totalPredictions", label: "Total Predictions", icon: "Target" },
    { key: "correctPredictions", label: "Correct Predictions", icon: "Award" },
    { key: "accuracy", label: "Accuracy %", icon: "TrendingUp" },
    { key: "currentStreak", label: "Current Streak", icon: "TrendingUp" },
    { key: "longestStreak", label: "Best Streak", icon: "Award" },
  ];

  const loadScoutData = async () => {
    setLoading(true);
    try {
      const scoutData = await getAllScouts();
      const corrections = await reconcileScoutPredictionStats(scoutData.map((scout) => scout.name));
      const normalizedScouts = scoutData.map((scout) => {
        const fix = corrections[scout.name];
        if (!fix) return scout;
        return {
          ...scout,
          totalPredictions: fix.totalPredictions,
          correctPredictions: fix.correctPredictions
        };
      });
      setScouts(normalizedScouts);
      
      // Load achievement Pis for each scout
      const achievementPisMap: Record<string, number> = {};
  for (const scout of normalizedScouts) {
        try {
          const stats = await getAchievementStats(scout.name);
          achievementPisMap[scout.name] = stats.totalPisFromAchievements;
        } catch (error) {
          console.error(`Error loading achievement stats for ${scout.name}:`, error);
          achievementPisMap[scout.name] = 0;
        }
      }
  setAchievementPis(achievementPisMap);
      
      analytics.trackEvent('scout_dashboard_loaded', { scoutCount: scoutData.length });
    } catch (error) {
      console.error('❌ Error loading scout data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadScoutData();
  }, []);

  const chartData = useMemo(() => {
    return scouts
      .map(scout => {
        let value: number;
        switch (chartMetric) {
          case "accuracy":
            value = calculateAccuracy(scout);
            break;
          case "Pis":
            value = scout.pis;
            break;
          case "totalPis": {
            // Total Pis = prediction Pis + achievement Pis
            const predictionPis = scout.pis;
            const achievementPisValue = achievementPis[scout.name] || 0;
            value = predictionPis + achievementPisValue;
            
            // Debug logging for Riley Davis
            if (scout.name === "Riley Davis") {
              console.log(`🔍 Riley Davis Pis Debug:`, {
                predictionPis,
                achievementPisValue,
                totalValue: value,
                achievementPisObject: achievementPis
              });
            }
            break;
          }
          default:
            value = scout[chartMetric] as number;
        }
        
        return {
          name: scout.name,
          value,
          scout
        };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 12);
  }, [scouts, chartMetric, achievementPis]);

  // Line chart data - shows progression over number of matches
  const lineChartData = useMemo(() => {
    if (chartType !== "line" || scouts.length === 0) return [];
    
    // For line chart, we'll simulate progression data
    // In a real implementation, you'd fetch historical prediction data
    const maxMatches = Math.max(...scouts.map(s => s.totalPredictions));
    const dataPoints: Array<{ matchNumber: number; [scoutName: string]: number }> = [];
    
    // Create data points for each match number
    for (let matchNum = 1; matchNum <= Math.min(maxMatches, 20); matchNum++) {
      const point: { matchNumber: number; [scoutName: string]: number } = { matchNumber: matchNum };
      
      // For each scout, calculate their metric value at this point in time
      scouts.slice(0, 6).forEach((scout) => {
        if (scout.totalPredictions >= matchNum) {
          let value: number;
          switch (chartMetric) {
            case "accuracy":
              // Simulate accuracy progression (in real app, calculate from historical data)
              value = Math.min(100, (scout.correctPredictions / matchNum) * 100);
              break;
            case "Pis":
              // Simulate Pis progression
              value = Math.floor((scout.pis / scout.totalPredictions) * matchNum);
              break;
            case "totalPis": {
              // For total Pis, add achievement Pis to prediction Pis progression
              const predictionPisProgression = Math.floor((scout.pis / scout.totalPredictions) * matchNum);
              const achievementPisForScout = achievementPis[scout.name] || 0;
              value = predictionPisProgression + achievementPisForScout;
              break;
            }
            case "currentStreak":
              // For streaks, just show current value after they reach that point
              value = matchNum === scout.totalPredictions ? scout.currentStreak : 0;
              break;
            case "longestStreak":
              // Simulate longest streak growth
              value = Math.floor((scout.longestStreak / scout.totalPredictions) * matchNum);
              break;
            default:
              value = Math.floor((scout[chartMetric] as number / scout.totalPredictions) * matchNum);
          }
          point[scout.name] = value;
        }
      });
      dataPoints.push(point);
    }
    
    return dataPoints;
  }, [scouts, chartMetric, chartType, achievementPis]);

  return {
    scouts,
    achievementPis,
    loading,
    chartMetric,
    setChartMetric,
    chartType,
    setChartType,
    metricOptions,
    chartData,
    lineChartData,
    loadScoutData
  };
}
