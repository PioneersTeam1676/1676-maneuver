type ResolveGoogleRedirectUriInput = {
  configuredRedirect?: string
  currentOrigin: string
  callbackPath: string
}

type ResolveGoogleRedirectUriResult = {
  redirectUri: string
  configuredRedirectOrigin: string | null
  currentCallbackUri: string
  usesConfiguredRedirect: boolean
}

export const resolveGoogleRedirectUri = ({
  configuredRedirect,
  currentOrigin,
  callbackPath,
}: ResolveGoogleRedirectUriInput): ResolveGoogleRedirectUriResult => {
  const currentCallbackUri = `${currentOrigin}${callbackPath}`
  if (!configuredRedirect) {
    return {
      redirectUri: currentCallbackUri,
      configuredRedirectOrigin: null,
      currentCallbackUri,
      usesConfiguredRedirect: false,
    }
  }

  try {
    const parsed = new URL(configuredRedirect)
    if (parsed.origin === currentOrigin) {
      return {
        redirectUri: parsed.toString(),
        configuredRedirectOrigin: parsed.origin,
        currentCallbackUri,
        usesConfiguredRedirect: true,
      }
    }

    return {
      redirectUri: currentCallbackUri,
      configuredRedirectOrigin: parsed.origin,
      currentCallbackUri,
      usesConfiguredRedirect: false,
    }
  } catch {
    return {
      redirectUri: currentCallbackUri,
      configuredRedirectOrigin: null,
      currentCallbackUri,
      usesConfiguredRedirect: false,
    }
  }
}

type BuildCanonicalGoogleAuthRestartUrlInput = {
  configuredRedirect?: string
  currentHref: string
  currentOrigin: string
  authStartParam: string
  authStartValue: string
}

export const buildCanonicalGoogleAuthRestartUrl = ({
  configuredRedirect,
  currentHref,
  currentOrigin,
  authStartParam,
  authStartValue,
}: BuildCanonicalGoogleAuthRestartUrlInput): string | null => {
  if (!configuredRedirect) return null

  try {
    const redirect = new URL(configuredRedirect)
    if (redirect.origin === currentOrigin) return null

    const current = new URL(currentHref)
    const restart = new URL(`${current.pathname}${current.search}${current.hash}`, redirect.origin)
    restart.searchParams.set(authStartParam, authStartValue)
    return restart.toString()
  } catch {
    return null
  }
}
