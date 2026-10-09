import { useState, useEffect, useCallback } from 'react'
import { getRecognitionCtor, isStandalone, queryMicPermission } from '../../../shared/lib/speech/speechSupport.js'
import { appendLog, dialogGuess } from './speechLog.js'
import { createSpeechController, emptyView, isBusy } from '../../../shared/lib/speech/speechController.js'
import { captureLogFields } from './speechCapture.js'

// Обёртка React над speechController: попытка по тапу («Сказать»), каждая попытка — новый экземпляр recognition.
// Микрофон включается только внутри start(), гасится на результате, ошибке, «Стоп», таймерах, уходе со страницы и
// размонтировании (вместе с ней — параллельный поток режимов B/C). onLogged должен быть стабильным (setState). Звук не сохраняется: из распознавателя берём только текст и confidence.
export function useSpeechProbe({ reference, lang, onLogged, capture, getCapture }) {
  const [view, setView] = useState(emptyView)

  const [ctrl] = useState(() => createSpeechController({
    createRecognition: () => { const Ctor = getRecognitionCtor(); return new Ctor() },
    queryPerm: queryMicPermission,
    capture, // менеджер параллельного потока (режимы B/C) — закрывается вместе с попыткой
    getCapture,
    logFields: captureLogFields, // поля режима захвата B/C в записи журнала
    getMode: () => (isStandalone() ? 'pwa' : 'browser'),
    now: () => Date.now(),
    perfNow: () => performance.now(),
    onView: setView,
    onEntry: entry => onLogged?.(appendLog({ ...entry, dialog: dialogGuess(entry) })),
  }))

  useEffect(() => {
    const stopNow = () => ctrl.reset()
    // Пока ждём диалог разрешения (iOS может мигнуть visibility), попытку не рвём: гасим только реальную запись
    const onHidden = () => { if (document.visibilityState === 'hidden' && ctrl.isAudioActive()) ctrl.reset() }
    document.addEventListener('visibilitychange', onHidden)
    window.addEventListener('pagehide', stopNow)
    return () => {
      document.removeEventListener('visibilitychange', onHidden)
      window.removeEventListener('pagehide', stopNow)
      ctrl.reset() // уход со вкладки админки — микрофон не держим
    }
  }, [ctrl])

  const start = useCallback(() => {
    if (!getRecognitionCtor()) return
    ctrl.start({ reference, lang }) // эталон и язык фиксируются на момент тапа
  }, [ctrl, reference, lang])

  return { view, start, stop: ctrl.stop, reset: ctrl.reset, busy: isBusy(view) }
}
