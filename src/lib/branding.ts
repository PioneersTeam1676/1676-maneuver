/**
 * Branding and configuration utilities
 * Centralizes access to environment variables for app customization
 */

// App Identity
export const APP_NAME = import.meta.env.VITE_APP_NAME || 'Maneuver Scouting'
export const APP_SHORT_NAME = import.meta.env.VITE_APP_SHORT_NAME || 'Maneuver'
export const APP_DESCRIPTION = import.meta.env.VITE_APP_DESCRIPTION || 'Comprehensive FRC scouting and strategy application'
export const APP_URL = import.meta.env.VITE_APP_URL || 'https://scouting.team1676.org'
export const APP_VERSION = import.meta.env.VITE_APP_VERSION || '2025.1.0'

// Team Identity
export const TEAM_NAME = import.meta.env.VITE_TEAM_NAME || 'Your FRC Team'
export const TEAM_NICKNAME = import.meta.env.VITE_TEAM_NICKNAME || ''
export const TEAM_NUMBER = import.meta.env.VITE_TEAM_NUMBER || '0000'

// Visual Branding
export const ACCENT_COLOR = import.meta.env.VITE_ACCENT_COLOR || '#FFCC00'
export const THEME_COLOR = import.meta.env.VITE_THEME_COLOR || '#000000'
export const BACKGROUND_COLOR = import.meta.env.VITE_BACKGROUND_COLOR || '#ffffff'

// Assets
export const LOGO_PATH = import.meta.env.VITE_LOGO_PATH || '/pioneer.png'
export const WORDMARK_PATH = import.meta.env.VITE_WORDMARK_PATH || '/Wordmark Vertical with White background.png'
export const FAVICON_PATH = import.meta.env.VITE_FAVICON_PATH || '/pioneer.png'
export const ICON_192 = import.meta.env.VITE_ICON_192 || '/pioneer.png'
export const ICON_512 = import.meta.env.VITE_ICON_512 || '/pioneer.png'
export const APPLE_TOUCH_ICON = import.meta.env.VITE_APPLE_TOUCH_ICON || '/pioneer.png'

// Legal & Support
export const PRIVACY_POLICY_URL = import.meta.env.VITE_PRIVACY_POLICY_URL || '/privacy'
export const TERMS_OF_SERVICE_URL = import.meta.env.VITE_TERMS_OF_SERVICE_URL || '/terms'
export const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL || 'support@example.com'

// Developer Options
export const DEBUG_MODE = import.meta.env.VITE_DEBUG_MODE === 'true'

/**
 * Get the full app title with team branding
 */
export function getFullAppTitle(): string {
  if (TEAM_NUMBER && TEAM_NUMBER !== '0000') {
    return `${APP_NAME} - Team ${TEAM_NUMBER}`
  }
  return APP_NAME
}

/**
 * Get the team display name (with nickname if available)
 */
export function getTeamDisplayName(): string {
  if (TEAM_NICKNAME) {
    return `${TEAM_NAME} • ${TEAM_NICKNAME}`
  }
  return TEAM_NAME
}

/**
 * Get page title with app name suffix
 */
export function getPageTitle(pageTitle: string): string {
  return `${pageTitle} | ${APP_NAME}`
}

/**
 * Get install prompt text customized for the app
 */
export function getInstallPromptText(platform: 'ios' | 'android' | 'desktop'): string {
  if (platform === 'ios') {
    return `To install ${APP_NAME} on iOS:\n\n1. Tap the Share button (□↗) in Safari\n2. Scroll down and tap "Add to Home Screen"\n3. Tap "Add" to install ${APP_NAME}`
  }
  if (platform === 'android') {
    return `To install ${APP_NAME}:\n\n1. Tap the menu (⋮) in your browser\n2. Look for "Install app" or "Add to Home screen"\n3. Tap it to install ${APP_NAME}`
  }
  return `To install ${APP_NAME}:\n\n1. Look for the install icon (⊕) in your browser's address bar\n2. Click it to install ${APP_NAME}\n3. Or use your browser menu: Settings > Install ${APP_NAME}`
}

/**
 * Get PWA update prompt text
 */
export function getUpdatePromptText(): string {
  return `A new version of ${APP_NAME} is available!`
}

/**
 * Get analytics app name
 */
export function getAnalyticsAppName(): string {
  return `${APP_NAME} App`
}
