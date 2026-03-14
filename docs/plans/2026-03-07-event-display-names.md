# Event Display Names Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace raw event codes (e.g., "2024njwar") with friendly display names (e.g., "1 Warren Hills") throughout the app, configurable per-event in Event Settings.

**Architecture:** Add a `eventDisplayNamesJson` column to the `EventSetting` DB model storing a JSON map of `{ eventCode: displayName }`. The backend settings API returns this map alongside existing fields. The frontend stores the map in localStorage and uses a lookup helper to resolve display names, falling back to the event code when no display name is set. The event code remains the canonical key for data (scouting entries, TBA sync); display names are purely presentational.

**Tech Stack:** Prisma (MySQL), Express.js, React + TypeScript, localStorage

---

### Task 1: Backend - Add display names column and update API

**Files:**
- Modify: `server/prisma/schema.prisma:99-106`
- Modify: `server/src/routes/events.js`

**Step 1: Add column to Prisma schema**

In `server/prisma/schema.prisma`, add `eventDisplayNamesJson` to the `EventSetting` model:

```prisma
model EventSetting {
  id                    Int     @id
  currentEvent          String? @map("current_event") @db.VarChar(255)
  eventsJson            String  @map("events_json") @db.LongText
  eventDisplayNamesJson String  @default("{}") @map("event_display_names_json") @db.LongText
  updatedAt             Int     @map("updated_at")

  @@map("event_settings")
}
```

**Step 2: Push schema change**

Run from `server/`:
```bash
npx prisma db push
```
Expected: Schema synced, `event_display_names_json` column added to `event_settings` table with default `"{}"`.

**Step 3: Update backend route helpers**

In `server/src/routes/events.js`:

Add a `parseDisplayNames` helper (after `parseEvents`):

```js
const parseDisplayNames = (raw) => {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const result = {}
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof key === "string" && typeof value === "string") {
          const trimmedKey = key.trim()
          const trimmedValue = value.trim()
          if (trimmedKey && trimmedValue) {
            result[trimmedKey] = trimmedValue
          }
        }
      }
      return result
    }
    return {}
  } catch {
    return {}
  }
}
```

Update `formatResponse` to include display names:

```js
const formatResponse = (row) => {
  const currentEvent = sanitizeEventName(row.currentEvent)
  let events = sanitizeEvents(parseEvents(row.eventsJson))
  if (currentEvent && !events.some((eventName) => eventName.toLowerCase() === currentEvent.toLowerCase())) {
    events = [...events, currentEvent].sort((a, b) => a.localeCompare(b))
  }
  return {
    currentEvent,
    events,
    eventDisplayNames: parseDisplayNames(row.eventDisplayNamesJson),
    updatedAt: Number(row.updatedAt) || 0,
  }
}
```

**Step 4: Update PUT handler to accept and persist display names**

In the PUT `/settings` handler, after `const { currentEvent, events } = req.body || {}`, also destructure:

```js
const { currentEvent, events, eventDisplayNames } = req.body || {}
```

Add validation for `eventDisplayNames`:

```js
if (eventDisplayNames !== undefined && (typeof eventDisplayNames !== "object" || Array.isArray(eventDisplayNames) || eventDisplayNames === null)) {
  return res.status(400).json({ error: "eventDisplayNames must be an object mapping event codes to display names" })
}
```

Compute the next display names (merge with existing, prune removed events):

```js
const existingDisplayNames = parseDisplayNames(existing.eventDisplayNamesJson)
const nextDisplayNames = eventDisplayNames !== undefined
  ? { ...existingDisplayNames, ...eventDisplayNames }
  : existingDisplayNames

// Prune display names for events no longer in the list
const prunedDisplayNames = {}
for (const eventCode of normalizedEvents) {
  if (nextDisplayNames[eventCode]) {
    prunedDisplayNames[eventCode] = nextDisplayNames[eventCode]
  }
}
```

Add `eventDisplayNamesJson: JSON.stringify(prunedDisplayNames)` to both the `create` and `update` objects in the `prisma.eventSetting.upsert` call.

**Step 5: Commit**

```bash
git add server/prisma/schema.prisma server/src/routes/events.js
git commit -m "feat: add event display names column and API support"
```

---

### Task 2: Frontend client - Update types and localStorage handling

**Files:**
- Modify: `src/lib/eventSettingsClient.ts`

**Step 1: Add display names to types and storage**

Add a new storage key constant:

```ts
export const STORAGE_EVENT_DISPLAY_NAMES_KEY = "eventDisplayNames"
```

Update `EventSettingsPayload`:

```ts
export interface EventSettingsPayload {
  currentEvent?: string | null
  events?: string[]
  eventDisplayNames?: Record<string, string>
}
```

Update `EventSettingsResponse`:

```ts
export interface EventSettingsResponse {
  currentEvent: string
  events: string[]
  eventDisplayNames: Record<string, string>
  updatedAt: number
}
```

**Step 2: Update `applyEventSettingsToStorage` to persist display names**

Add after the events/currentEvent localStorage writes:

```ts
const displayNames = settings.eventDisplayNames ?? {}
try {
  localStorage.setItem(STORAGE_EVENT_DISPLAY_NAMES_KEY, JSON.stringify(displayNames))
} catch (error) {
  console.warn("Failed to persist event display names", error)
}
```

**Step 3: Add a display name lookup helper**

Export a helper function:

```ts
export const getEventDisplayName = (eventCode: string): string => {
  if (typeof window === "undefined") return eventCode
  try {
    const stored = localStorage.getItem(STORAGE_EVENT_DISPLAY_NAMES_KEY)
    if (!stored) return eventCode
    const map = JSON.parse(stored) as Record<string, string>
    return map[eventCode] || eventCode
  } catch {
    return eventCode
  }
}
```

**Step 4: Update `fetchEventSettings` to include display names**

```ts
export const fetchEventSettings = async (): Promise<EventSettingsResponse> => {
  const response = await apiGet<EventSettingsResponse>("/events/settings")
  return {
    currentEvent: sanitizeEventName(response.currentEvent),
    events: sanitizeEventList(response.events),
    eventDisplayNames: response.eventDisplayNames ?? {},
    updatedAt: response.updatedAt ?? 0,
  }
}
```

**Step 5: Commit**

```bash
git add src/lib/eventSettingsClient.ts
git commit -m "feat: add event display name types, storage, and lookup helper"
```

---

### Task 3: EventSettingsPage - Add display name input per event

**Files:**
- Modify: `src/pages/EventSettingsPage.tsx`

**Step 1: Add display names state**

Add state for display names (near line 82-84, alongside existing state):

```tsx
const [eventDisplayNames, setEventDisplayNames] = useState<Record<string, string>>({})
```

Initialize from localStorage in a similar pattern to `readStoredEvents`:

```tsx
const readStoredDisplayNames = (): Record<string, string> => {
  if (typeof window === "undefined") return {}
  try {
    const stored = localStorage.getItem(STORAGE_EVENT_DISPLAY_NAMES_KEY)
    if (!stored) return {}
    const parsed = JSON.parse(stored)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}
```

Initialize the state: `useState<Record<string, string>>(readStoredDisplayNames)`

Import `STORAGE_EVENT_DISPLAY_NAMES_KEY` from `@/lib/eventSettingsClient`.

**Step 2: Update `applySettingsResponse` to include display names**

In the `applySettingsResponse` callback (line 167), add:

```tsx
setEventDisplayNames(settings.eventDisplayNames ?? {})
```

**Step 3: Add display name save handler**

Add a handler for saving a display name:

```tsx
const handleUpdateDisplayName = async (eventCode: string, displayName: string) => {
  const trimmed = displayName.trim()
  const nextDisplayNames = { ...eventDisplayNames, [eventCode]: trimmed }
  if (!trimmed) {
    delete nextDisplayNames[eventCode]
  }
  try {
    await performSettingsUpdate(
      { eventDisplayNames: nextDisplayNames },
      trimmed ? `Display name set: ${trimmed}` : `Display name cleared for ${eventCode}`
    )
  } catch {
    // Error handled by performSettingsUpdate
  }
}
```

**Step 4: Add display name input to each event card**

In the event list rendering (around line 698-741), add an `Input` for the display name inside each event card. After the event name `<p>` and active indicator, add:

```tsx
<div className="mt-2 flex items-center gap-2">
  <Input
    placeholder="Display name (e.g., 1 Warren Hills)"
    defaultValue={eventDisplayNames[eventName] || ""}
    className="h-8 text-sm"
    onBlur={(e) => {
      const newValue = e.target.value.trim()
      const oldValue = eventDisplayNames[eventName] || ""
      if (newValue !== oldValue) {
        void handleUpdateDisplayName(eventName, e.target.value)
      }
    }}
    onKeyDown={(e) => {
      if (e.key === "Enter") {
        e.preventDefault()
        ;(e.target as HTMLInputElement).blur()
      }
    }}
  />
</div>
```

Place this inside the `<div>` that contains the event name text (around line 707), so each event card has both its code and an editable display name field.

**Step 5: Update the "Current Event" badge to show display name**

In the Current Event card (around line 641-644), change the badge text:

```tsx
<Badge variant="secondary" className="text-base font-semibold">
  {eventDisplayNames[currentEvent] || currentEvent}
</Badge>
```

**Step 6: Update card description text**

Change the "Manage Event Codes" card title/description (lines 666-669) to reflect the new terminology:

- CardTitle: `"Manage Events"` (instead of "Manage Event Codes")
- CardDescription: `"Add events and set display names. When you set one as active, scouts see the display name instantly in Game Start."`

Update the placeholder on the add-event input (line 676):
```
"Enter event code (e.g., 2025njfla)"
```

**Step 7: Commit**

```bash
git add src/pages/EventSettingsPage.tsx
git commit -m "feat: add display name input per event in Event Settings page"
```

---

### Task 4: EventNameSelector - Show display names

**Files:**
- Modify: `src/components/GameStartComponents/EventNameSelector.tsx`

**Step 1: Import the display name helper**

Add import:

```tsx
import { getEventDisplayName } from "@/lib/eventSettingsClient"
```

Also import `STORAGE_EVENT_DISPLAY_NAMES_KEY`.

**Step 2: Update read-only display (non-editable scouts view)**

In the non-editable view (line 161-173), change the display text:

```tsx
<span className="font-medium text-foreground">
  {currentEventName ? getEventDisplayName(currentEventName) : "Awaiting event assignment"}
</span>
```

**Step 3: Update the combobox trigger button**

In the `PopoverTrigger` button (line 185-189):

```tsx
{currentEventName ? getEventDisplayName(currentEventName) : "Select event..."}
```

**Step 4: Update dropdown items to show display names**

In the `CommandItem` rendering (lines 208-231), show display name with event code as secondary text:

```tsx
{eventsList.map((event) => {
  const displayName = getEventDisplayName(event)
  return (
    <CommandItem
      key={event}
      value={displayName}
      disabled={isUpdating}
      onSelect={() => {
        void saveEvent(event)
      }}
      className="flex items-center justify-between"
    >
      <div className="flex items-center">
        <Check
          className={cn(
            "mr-2 h-4 w-4",
            currentEventName === event ? "opacity-100" : "opacity-0"
          )}
        />
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          {displayName}
        </div>
      </div>
    </CommandItem>
  )
})}
```

**Step 5: Update toast message**

In `saveEvent` (line 152), use the display name:

```tsx
toast.success(`Event set to: ${getEventDisplayName(trimmedName)}`)
```

**Step 6: Listen for display name changes**

In the `handleEventNameUpdated` handler (line 91-94), the existing logic already reloads from localStorage, which will pick up updated display names. Add `STORAGE_EVENT_DISPLAY_NAMES_KEY` to the storage event listener so the component re-renders when display names change:

```tsx
if (event.key === STORAGE_EVENT_DISPLAY_NAMES_KEY) {
  // Force re-render by updating events list
  setEventsList(loadEventsFromStorage())
}
```

**Step 7: Commit**

```bash
git add src/components/GameStartComponents/EventNameSelector.tsx
git commit -m "feat: show event display names in EventNameSelector"
```

---

### Task 5: Verify and clean up

**Step 1: Manual QA checklist**

Test the following scenarios:

1. **Add an event** in Event Settings - verify event code appears in the list
2. **Set a display name** (e.g., "1 Warren Hills") for an event - verify it saves on blur
3. **Set that event as active** - verify the "Current Event" badge shows the display name
4. **Navigate to Game Start** - verify the EventNameSelector shows the display name (not the code)
5. **As a scout** (non-lead role) - verify the read-only display shows the display name
6. **Clear the display name** - verify it falls back to showing the event code
7. **Remove an event** - verify its display name is pruned from the map
8. **Multiple events** - verify each event can have its own display name
9. **TBA sync** - verify the TBA event key input still works independently
10. **Page refresh** - verify display names persist across reloads

**Step 2: Final commit**

```bash
git add -A
git commit -m "feat: event display names - final polish"
```

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Parallel map (`eventDisplayNamesJson`) instead of restructuring `eventsJson` | Minimizes refactoring; existing code that works with `string[]` events is untouched |
| Display name is optional, falls back to event code | Backward-compatible; existing events without display names still work |
| Event code stays as canonical key in scouting entries | Preserves data integrity; display names are cosmetic and can change |
| Display names saved on blur, not on every keystroke | Avoids excessive API calls while keeping UX responsive |
| Pruning display names when events are removed | Prevents stale data accumulation |
