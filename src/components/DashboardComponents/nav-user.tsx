import { useCallback, useState } from "react"
import { SidebarMenu, SidebarMenuItem } from "@/components/ui/sidebar"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { GoogleButton } from "@/components/ui/google-button"
import { Badge } from "@/components/ui/badge"
import { Trophy } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { ensureMatchScheduleCached } from "@/lib/tbaUtils"
import { STORAGE_EVENT_NAME_KEY } from "@/lib/eventSettingsClient"

export function NavUser() {
  const { user, login, logout, ready, role } = useAuth()
  const navigate = useNavigate()
  const [syncingSchedule, setSyncingSchedule] = useState(false)

  const roleLabel = (() => {
    switch (role) {
      case 'ultra_admin':
        return 'Ultra Admin'
      case 'admin':
        return 'Admin'
      case 'lead':
        return 'Lead'
      case 'scout':
        return 'Scout'
      default:
        return 'Pending approval'
    }
  })()

  const readConfiguredEvent = useCallback(() => {
    if (typeof window === 'undefined') return ''
    try {
      const primary = localStorage.getItem(STORAGE_EVENT_NAME_KEY)
      const fallback = localStorage.getItem('matchDataEventKey')
      return (primary || fallback || '').trim()
    } catch {
      return ''
    }
  }, [])

  const handleSyncSchedule = useCallback(async () => {
    if (syncingSchedule) return
    const eventKey = readConfiguredEvent()

    if (!eventKey) {
      toast.error('No event is configured yet. Ask a lead to set one in Event Settings.')
      return
    }

    setSyncingSchedule(true)
    try {
      await ensureMatchScheduleCached(eventKey, { force: true })
  toast.success('Match schedule synced')
    } catch (error) {
      console.error('Failed to sync match schedule', error)
      toast.error("Couldn't sync the match schedule. Try again in a moment.")
    } finally {
      setSyncingSchedule(false)
    }
  }, [readConfiguredEvent, syncingSchedule])

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        {/* Google Auth section */}
        <div className="px-2 py-2 flex items-center gap-2">
          {user ? (
            <div className="flex w-full flex-wrap items-start gap-2">
              <div className="flex min-w-0 flex-1 items-start gap-2">
                {user.picture && (
                  <img src={user.picture} alt={user.name} className="h-6 w-6 rounded-full" />
                )}
                <div className="text-xs min-w-0 flex-1">
                  <div className="flex items-center gap-1 font-semibold leading-none">
                    <span>{user.name}</span>
                    {(role === 'lead' || role === 'admin' || role === 'ultra_admin') && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 p-0"
                        onClick={() => navigate('/achievements')}
                        title="Achievements"
                      >
                        <Trophy className="h-4 w-4 text-yellow-500" />
                      </Button>
                    )}
                  </div>
                  <div className="text-muted-foreground truncate max-w-[160px]">{user.email}</div>
                  <Badge variant={role === 'pending' ? 'outline' : 'secondary'} className="mt-1">
                    {roleLabel}
                  </Badge>
                  {role === 'pending' && (
                    <p className="text-[10px] text-muted-foreground mt-1">
                      An admin needs to grant additional access.
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={syncingSchedule}
                      onClick={handleSyncSchedule}
                    >
                      {syncingSchedule ? 'Syncing...' : 'Sync Match Schedule'}
                    </Button>
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="w-full sm:w-auto sm:ml-auto"
                onClick={logout}
              >
                Sign out
              </Button>
            </div>
          ) : (
            <GoogleButton onClick={login} disabled={!ready} />
          )}
        </div>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
