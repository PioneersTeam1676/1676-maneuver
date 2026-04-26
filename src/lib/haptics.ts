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
    if (this.isIOS) return false;
    return 'vibrate' in navigator && Boolean(navigator.vibrate);
  }

  vibrate(pattern: number | number[] = 50) {
    const canVib = this.canVibrate();
    let result = false;
    if (canVib) {
      result = navigator.vibrate(pattern);
    }
    this.debugInfo.attempts.push({
      pattern,
      result,
      timestamp: new Date().toLocaleTimeString()
    });
  }

  light() {
    this.vibrate(25);
  }

  medium() {
    this.vibrate(50);
  }

  strong() {
    this.vibrate(100);
  }

  success() {
    this.vibrate([50, 100, 50]);
  }

  error() {
    this.vibrate([100, 50, 100, 50, 100]);
  }

  notification() {
    this.vibrate([100, 50, 100]);
  }

  selection() {
    this.vibrate(15);
  }

  warning() {
    this.vibrate([150, 100, 150]);
  }

  isSupported(): boolean {
    return this.canVibrate();
  }

  getDebugInfo() {
    return this.debugInfo;
  }

  showDebugInfo() {
    const info = this.debugInfo;
    const recentAttempts = info.attempts.slice(-3);
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
