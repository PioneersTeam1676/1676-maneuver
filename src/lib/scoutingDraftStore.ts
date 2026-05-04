const INPUTS_KEY = "currentScoutingInputs"
const FORM_VALUES_KEY = "currentScoutingFormValues"

const safeRead = <T,>(key: string): T | null => {
  if (typeof localStorage === "undefined") return null
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

const safeWrite = (key: string, value: unknown): void => {
  if (typeof localStorage === "undefined") return
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // quota or serialization error; nothing actionable
  }
}

const safeRemove = (key: string): void => {
  if (typeof localStorage === "undefined") return
  try {
    localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

export const setDraftScoutingInputs = (inputs: unknown): void => {
  if (!inputs) return
  safeWrite(INPUTS_KEY, inputs)
}

export const getDraftScoutingInputs = <T = unknown,>(): T | null => safeRead<T>(INPUTS_KEY)

export const clearDraftScoutingInputs = (): void => {
  safeRemove(INPUTS_KEY)
  safeRemove(FORM_VALUES_KEY)
}

export const setDraftScoutingFormValues = (values: unknown): void => {
  if (!values) return
  safeWrite(FORM_VALUES_KEY, values)
}

export const getDraftScoutingFormValues = <T = unknown,>(): T | null => safeRead<T>(FORM_VALUES_KEY)

export const clearDraftScoutingFormValues = (): void => {
  safeRemove(FORM_VALUES_KEY)
}
