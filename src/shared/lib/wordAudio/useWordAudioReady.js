import { useEffect, useState } from 'react'
import { ensureWordAudio } from './wordAudioEnsure.js'
import { subscribeWordAudio } from './wordAudioApi.js'

// Хук: прогрев озвучки слов (ensureWordAudio) для списка текстов; возвращает число, которое растёт, когда в кэше
// появилась новая озвучка — им пересчитывают подстановку (useMemo с этим числом в зависимостях).
// delayMs — подождать, пока слова перестанут меняться (набор пробного слова в предпросмотре), чтобы не слать запрос на каждую букву.
export function useWordAudioReady(texts, delayMs = 0) {
  const [version, setVersion] = useState(0)
  const sig = (texts ?? []).join('\u0001')
  // Админ озвучил/удалил слово в библиотеке — подстановку пересобрать
  useEffect(() => subscribeWordAudio(() => setVersion(v => v + 1)), [])
  useEffect(() => {
    if (!sig) return undefined
    let alive = true
    const run = () => ensureWordAudio(sig.split('\u0001')).then(changed => { if (alive && changed) setVersion(v => v + 1) })
    const t = delayMs > 0 ? setTimeout(run, delayMs) : null
    if (!t) run()
    return () => { alive = false; if (t) clearTimeout(t) }
  }, [sig, delayMs])
  return version
}
