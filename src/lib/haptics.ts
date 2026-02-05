class HapticFeedback {
  private isIOS: boolean;
  private isInstalled: boolean;
  private debugInfo: {
    isIOS: boolean;
    isInstalled: boolean;
    userAgent: string;
    displayMode: boolean;
    vibrateSupport: boolean;
    vibrateFunction: string;
    hostname: string;
    attempts: Array<{ pattern: number | number[], result: boolean, timestamp: string }>;
  };

  constructor() {
    this.isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    this.isInstalled = window.matchMedia('(display-mode: standalone)').matches;
    
    // Store debug info for mobile display
    this.debugInfo = {
      isIOS: this.isIOS,
      isInstalled: this.isInstalled,
      userAgent: navigator.userAgent,
      displayMode: window.matchMedia('(display-mode: standalone)').matches,
      vibrateSupport: 'vibrate' in navigator,
      vibrateFunction: typeof navigator.vibrate,
      hostname: location.hostname,
      attempts: []
    };
    
  }

  private canVibrate(): boolean {
    if (!('vibrate' in navigator) || !navigator.vibrate) {
      return false;
    }
    
    // iOS Safari does not support the Vibration API at all
    // Even when installed as PWA, Apple has disabled it
    if (this.isIOS) {
      return false;
    }
    
    return true;
  }

  vibrate(pattern: number | number[] = 50) {
    const canVib = this.canVibrate();
    let result = false;
    
    if (canVib && 'vibrate' in navigator) {
      result = navigator.vibrate(pattern);
    }
    
    // Store attempt for debugging
    this.debugInfo.attempts.push({
      pattern,
      result,
      timestamp: new Date().toLocaleTimeString()
    });

    
    // For iOS, provide visual feedback instead
    if (this.isIOS && !result) {
      this.visualFeedback();
    }
  }

  // Visual feedback alternative for iOS
  private visualFeedback() {
    // Create a brief visual pulse effect
    const originalFilter = document.body.style.filter;
    document.body.style.filter = 'brightness(1.1)';
    document.body.style.transition = 'filter 0.05s ease';
    
    setTimeout(() => {
      document.body.style.filter = originalFilter;
      setTimeout(() => {
        document.body.style.transition = '';
      }, 50);
    }, 50);
  }

  // Light tap feedback
  light() {
    this.vibrate(25);
  }

  // Medium feedback for button presses
  medium() {
    this.vibrate(50);
  }

  // Strong feedback for important actions
  strong() {
    this.vibrate(100);
  }

  // Success pattern
  success() {
    this.vibrate([50, 100, 50]);
  }

  // Error pattern
  error() {
    this.vibrate([100, 50, 100, 50, 100]);
  }

  // Notification pattern
  notification() {
    this.vibrate([100, 50, 100]);
  }

  // Selection feedback (for UI interactions)
  selection() {
    this.vibrate(15);
  }

  // Warning pattern
  warning() {
    this.vibrate([150, 100, 150]);
  }

  // Utility to check if haptics are available
  isSupported(): boolean {
    return this.canVibrate();
  }

  // Get debug info for mobile display
  getDebugInfo() {
    return this.debugInfo;
  }

  // Show debug info as alert (for mobile testing)
  showDebugInfo() {
    const info = this.debugInfo;
    const recentAttempts = info.attempts.slice(-3); // Last 3 attempts
    
    const debugText = `Haptics Debug Info:
    
iOS: ${info.isIOS}
Installed as PWA: ${info.isInstalled}
Vibrate API: ${info.vibrateSupport}
Hostname: ${info.hostname}

Recent Attempts:
${recentAttempts.map(a => `${a.timestamp}: ${JSON.stringify(a.pattern)} → ${a.result}`).join('\n')}

User Agent:
${info.userAgent.substring(0, 100)}...`;

    alert(debugText);
  }
}

export const haptics = new HapticFeedback();