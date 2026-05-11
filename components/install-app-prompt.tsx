'use client'

import { useEffect, useState } from 'react'
import { Download, Smartphone } from 'lucide-react'

export function InstallAppPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalled] = useState(() => {
    if (typeof window === 'undefined') return false
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true
    )
  })
  const [isIOS] = useState(() => {
    if (typeof window === 'undefined') return false
    return /iPad|iPhone|iPod/.test(window.navigator.userAgent) && !(window as Window & { MSStream?: unknown }).MSStream
  })
  const [showInstructions, setShowInstructions] = useState(false)

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setDeferredPrompt(event as BeforeInstallPromptEvent)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
  }, [])

  if (isInstalled) return null

  async function handleInstall() {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      await deferredPrompt.userChoice.catch(() => null)
      setDeferredPrompt(null)
      return
    }

    setShowInstructions((current) => !current)
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-950 px-4 py-4 text-white shadow-xl shadow-slate-200/30">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/10">
          <Smartphone className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Install SushiTrack</p>
          <p className="mt-1 text-sm text-slate-300">
            Add the app to the home screen for faster access on mobile.
          </p>
          <button
            type="button"
            onClick={handleInstall}
            className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-white px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
          >
            <Download className="h-4 w-4" />
            {deferredPrompt ? 'Install app' : isIOS ? 'Show iPhone steps' : 'Open install options'}
          </button>
          {showInstructions || isIOS ? (
            <p className="mt-3 text-xs leading-5 text-slate-400">
              On iPhone, use Safari share menu then choose Add to Home Screen. On Android, use the browser menu or the install button when it appears.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void> | void
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}
