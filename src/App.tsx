import {
  createBrowserRouter,
  createRoutesFromElements,
  RouterProvider,
  Route,
} from "react-router-dom";
import { useEffect, useState } from "react";
import { ThemeProvider } from "@/components/theme-provider"
import { analytics } from '@/lib/analytics';
import { syncEventSettings } from '@/lib/eventSettingsClient'
import { ensureMatchScheduleCached } from '@/lib/tbaUtils'
import { syncCachedPitScoutingEntries, syncCachedScoutingEntries } from '@/lib/dexieDB'
import { getForm } from '@/lib/formBuilderApi'
import { syncActiveFormConfig } from '@/lib/activeForm'
import { hasUsableAuthToken } from '@/lib/apiClient'

import MainLayout from "@/layouts/MainLayout";
import NotFoundPage from "@/pages/NotFoundPage";
import HomePage from "@/pages/HomePage";
import GameStartPage from "@/pages/GameStartPage";
import AutoStartPage from "@/pages/AutoStartPage";
// import ParseDataPage from "@/pages/ParseDataPage";
import APIDataPage from "@/pages/APIDataPage";
import ClearDataPage from "@/pages/ClearDataPage";
import DataManagementPage from "@/pages/DataManagementPage";
import EventSettingsPage from "./pages/EventSettingsPage";
import QRDataTransferPage from "@/pages/QRDataTransferPage";
import JSONDataTransferPage from "@/pages/JSONDataTransferPage";
import MatchDataQRPage from "@/pages/MatchDataQRPage";
import MatchStrategyPage from "@/pages/MatchStrategyPage";
import { AutoScoringPage, TeleopScoringPage } from "@/pages/ScoringPage";
import EndgamePage from "@/pages/EndgamePage";
import TeamStatsPage from "@/pages/TeamStatsPage";
import PitScoutingPage from "@/pages/PitScoutingPage";
import DriveTeamScoutingPage from "@/pages/DriveTeamScoutingPage";
import PitAssignmentsPage from "@/pages/PitAssignmentsPage";
import PickListPage from "./pages/PickListPage";
import StrategyOverviewPage from "./pages/StrategyOverviewPage";
import ScoutManagementDashboardPage from "./pages/ScoutManagementDashboardPage";
import AchievementsPage from "./pages/AchievementsPage";
import VerificationCenterPage from "./pages/VerificationCenterPage";
import DevUtilitiesPage from "./pages/DevUtilitiesPage";
import TOSPage from "./pages/TOSPage";
import PrivacyPolicyPage from "./pages/PrivacyPolicyPage";
import ShiftGeneratorPage from "./pages/ShiftGeneratorPage";
import AdminPanelPage from "./pages/AdminPanelPage";
import PiPanelPage from "./pages/PiPanelPage";
import UserManagementPage from "./pages/UserManagementPage";
import ScoutActivityPage from "./pages/ScoutActivityPage";
import AuthCallbackPage from "./pages/AuthCallbackPage";
import AllianceOnboardingPage from "./pages/AllianceOnboardingPage";
import ScoutFormPage from "./pages/ScoutFormPage";
import OutlierDetectionPage from "./pages/OutlierDetectionPage";
import SchedulePage from "@/pages/SchedulePage";
import RescouterPage from "@/pages/RescouterPage";
import { InstallPrompt } from '@/components/InstallPrompt';
import { PWAUpdatePrompt } from '@/components/PWAUpdatePrompt';
// import { StatusBarSpacer } from '@/components/StatusBarSpacer';
import { SplashScreen } from '@/components/SplashScreen';
import { FullscreenProvider } from '@/contexts/FullscreenContext';
import { AuthProvider } from '@/contexts/AuthContext';



function App() {
  const router = createBrowserRouter(
    createRoutesFromElements(
      <Route path="/" element={<MainLayout />}>
        <Route index element={<HomePage />} />
        <Route path="/data-management" element={<DataManagementPage />} />
        <Route path="/api-data" element={<APIDataPage />} />

        <Route path="/clear-data" element={<ClearDataPage />} />
        {/* <Route path="/parse-data" element={<ParseDataPage />} /> */}
        <Route path="/game-start" element={<GameStartPage />} />
  <Route path="/event-settings" element={<EventSettingsPage />} />
        <Route path="/auto-start" element={<AutoStartPage />} />
        <Route path="/qr-data-transfer" element={<QRDataTransferPage />} />
        <Route path="/json-transfer" element={<JSONDataTransferPage />} />
        <Route path="/match-data-qr" element={<MatchDataQRPage />} />
        <Route path="/match-strategy" element={<MatchStrategyPage />} />
        <Route path="/auto-scoring" element={<AutoScoringPage />} />
        <Route path="/teleop-scoring" element={<TeleopScoringPage />} />
        <Route path="/endgame" element={<EndgamePage />} />
        <Route path="/team-stats" element={<TeamStatsPage />} />
        <Route path="/pit-scouting" element={<PitScoutingPage />} />
        <Route path="/drive-scouting" element={<DriveTeamScoutingPage />} />
        <Route path="/pit-assignments" element={<PitAssignmentsPage />} />
        <Route path="/strategy-overview" element={<StrategyOverviewPage />} />
        <Route path="/pick-list" element={<PickListPage />} />
        <Route path="/shift-generator" element={<ShiftGeneratorPage />} />
        <Route path="/scout-form" element={<ScoutFormPage />} />
        <Route path="/admin" element={<AdminPanelPage />} />
  <Route path="/pi-panel" element={<PiPanelPage />} />
        <Route path="/user-management" element={<UserManagementPage />} />
        <Route path="/scout-activity" element={<ScoutActivityPage />} />
  <Route path="/verification-center" element={<VerificationCenterPage />} />
        <Route path="/scout-management" element={<ScoutManagementDashboardPage />} />
        <Route path="/achievements" element={<AchievementsPage />} />
        <Route path="/dev-utilities" element={<DevUtilitiesPage />} />
        <Route path="/tos" element={<TOSPage />} />
        <Route path="/terms" element={<TOSPage />} />
        <Route path="/privacy" element={<PrivacyPolicyPage />} />
        <Route path="/alliance-onboarding" element={<AllianceOnboardingPage />} />
        <Route path="/schedule" element={<SchedulePage />} />
        <Route path="/rescout" element={<RescouterPage />} />
        <Route path="/outliers" element={<OutlierDetectionPage />} />
        <Route path="/auth/google/callback" element={<AuthCallbackPage />} />
        {/* Add more routes as needed */}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    )
  );

  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {

    // Track PWA install prompt
    window.addEventListener('beforeinstallprompt', () => {
      analytics.trackEvent('pwa_install_prompt_shown');
    });

    // Track if app was launched as PWA
    if (window.matchMedia('(display-mode: standalone)').matches) {
      analytics.trackPWALaunched();
    }

    // Debug analytics in development
    if (process.env.NODE_ENV === 'development') {
      setTimeout(() => {
        analytics.debug();
        // Make analytics available globally for testing
        (window as typeof window & { analytics: typeof analytics }).analytics = analytics;

        // Make achievement functions available globally for debugging
        import('./lib/achievementUtils').then(achievementUtils => {
          (window as typeof window & { achievements: { backfillAll: () => Promise<void>, checkForNewAchievements: (name: string) => Promise<unknown[]> } }).achievements = {
            backfillAll: achievementUtils.backfillAchievementsForAllScouts,
            checkForNewAchievements: achievementUtils.checkForNewAchievements
          };
        });

        // Make test data generator available globally for testing
        import('./lib/testDataGenerator').then(testData => {
          (window as typeof window & { testData: { createTestProfiles: () => Promise<unknown>, clearAll: () => Promise<void> } }).testData = {
            createTestProfiles: testData.createTestScoutProfiles,
            clearAll: testData.clearTestData
          };
          console.log('🧪 Test data functions available:');
          console.log('  - window.testData.createTestProfiles() - Create test scout profiles');
          console.log('  - window.testData.clearAll() - Clear all scout data');
        });

        // Make gameDB available for debugging
        import('./lib/dexieDB').then(db => {
          (window as typeof window & { gameDB: typeof db.gameDB }).gameDB = db.gameDB;
          console.log('🗄️ Database available at window.gameDB');
        });

        // Debug function to check scout data
        (window as typeof window & { debugScoutData: (name: string) => Promise<void> }).debugScoutData = async (scoutName: string) => {
          const { gameDB } = await import('./lib/dexieDB');
          const scout = await gameDB.scouts.get(scoutName);
          console.log(`Scout data for ${scoutName}:`, scout);

          const achievements = await gameDB.scoutAchievements.where('scoutName').equals(scoutName).toArray();
          console.log(`Achievements for ${scoutName}:`, achievements);

          // Check specific Pi achievements
          const { checkAchievement, ACHIEVEMENT_DEFINITIONS } = await import('./lib/achievementTypes');
          const piAchievements = ACHIEVEMENT_DEFINITIONS.filter(a => a.id.startsWith('pis_'));

          piAchievements.forEach(achievement => {
            const isUnlocked = achievements.some(a => a.achievementId === achievement.id);
            const meetsRequirements = checkAchievement(achievement, scout!);
            console.log(`${achievement.name}: unlocked=${isUnlocked}, meetsReq=${meetsRequirements}, pisFromPredictions=${scout?.pisFromPredictions}`);
          });
        };

        console.log('🐛 Debug function available: window.debugScoutData("Riley Davis")');
      }, 2000);
    }

    const syncOnlineCaches = () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return
      }
      if (!hasUsableAuthToken()) {
        return
      }
      void (async () => {
        try {
          const activeConfig = await syncActiveFormConfig()
          const formIds = [activeConfig.match, activeConfig.pit].filter(Boolean) as string[]
          if (formIds.length) {
            await Promise.all(formIds.map((id) => getForm(id).catch(() => null)))
          }
        } catch (error) {
          console.warn('Failed to sync active forms', error)
        }

        await syncCachedScoutingEntries()
        await syncCachedPitScoutingEntries()
      })()
    }

    const runEventSync = () => {
      if (!hasUsableAuthToken()) {
        return
      }
      void (async () => {
        try {
          const settings = await syncEventSettings()
          const eventKey = settings.currentEvent?.trim()
          if (eventKey) {
            await ensureMatchScheduleCached(eventKey)
          }
        } catch (error) {
          console.error('Failed to sync event settings', error)
        }
      })()
    }

    runEventSync()
    syncOnlineCaches()

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        runEventSync()
      }
    }

    const handleFocus = () => {
      runEventSync()
    }

    const handleOnline = () => {
      syncOnlineCaches()
      runEventSync()
    }

    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('online', handleOnline)

    return () => {
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('online', handleOnline)
    }

  }, []);

  if (showSplash) {
    return <SplashScreen onComplete={() => setShowSplash(false)} />;
  }

  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <AuthProvider>
        <FullscreenProvider>
          <div className="min-h-screen bg-background">
            <RouterProvider router={router} />
            <InstallPrompt />
            <PWAUpdatePrompt />
            {/* <StatusBarSpacer /> */}
          </div>
        </FullscreenProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App
