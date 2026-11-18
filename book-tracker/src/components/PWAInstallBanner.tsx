import { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { useI18n } from '../i18n/useI18n';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PWAInstallPrompt() {
  const { t } = useI18n();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIosHintVisible, setIsIosHintVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const isStandalone =
      typeof window !== 'undefined' &&
      (window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true);

    if (isStandalone) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);

    const ua = navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua);
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
    if (isIos && isSafari) {
      setIsIosHintVisible(true);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (dismissed || (!deferredPrompt && !isIosHintVisible)) return null;

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  if (deferredPrompt) {
    return (
      <button
        type="button"
        onClick={handleInstall}
        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-stone-800 dark:text-slate-100 hover:bg-stone-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
      >
        <Download className="h-3.5 w-3.5 text-[#C2410C]" />
        <span>{t('action.installApp')}</span>
      </button>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/80 dark:bg-amber-950/30 px-3 py-2 text-xs text-stone-800 dark:text-slate-200">
      <div className="flex items-center gap-2">
        <Share className="h-4 w-4 text-[#C2410C] shrink-0" />
        <span>iOS: Tap Share then &ldquo;Add to Home Screen&rdquo; to install Book Tracker.</span>
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setDismissed(true)}
        className="p-1 text-stone-500 hover:text-stone-900 dark:hover:text-white"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
