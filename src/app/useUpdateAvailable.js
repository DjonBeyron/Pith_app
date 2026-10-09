import { useState, useEffect } from 'react'
import { isLessonOpen } from '../shared/lib/lessonOpen.js'
import { APP_VERSION } from '../shared/lib/version.js'
import { onNewVersion, isShellActive, checkForUpdate } from '../shared/lib/shellClient.js'

const CHECK_MS = 10 * 60 * 1000 // раз в 10 минут + при возврате вкладки в фокус
const LESSON_WAIT_MS = 3000 // новая версия уже готова, но идёт урок — смотрим, не закрыли ли его
const STUCK_GAP_MS = 5 * 60 * 1000 // проверки «застряло» считаем не чаще, чем раз в 5 минут (быстрые возвраты в приложение не в счёт)
const STUCK_CHECKS = 2 // кеш оболочки включён, воркер версию не доставил, а version.json её видит столько проверок подряд

// Решение по ответу /version.json (чистая функция, тесты — useUpdateAvailable.test.js): { how, mismatches }
export function decideUpdate({ netVersion, appVersion, shellActive, mismatches }) {
  if (!netVersion || netVersion === appVersion) return { how: null, mismatches: 0 }
  if (!shellActive) return { how: 'poll', mismatches }
  const n = mismatches + 1
  return { how: n >= STUCK_CHECKS ? 'stuck' : null, mismatches: n }
}

// Есть ли новая версия приложения. Результат — null | 'sw' | 'poll' | 'stuck':
// 'sw' — основной путь: воркер уже поставил кеш новой сборки и прислал сообщение (тап → обычный reload, страница придёт из нового кеша);
// 'poll' — кеша оболочки нет (dev, воркер выключен/не поставлен): как раньше, по /version.json — reload идёт с сети;
// 'stuck' — кеш оболочки есть, но воркер новую сборку так и не поставил (version.json новее 2 проверки подряд): тап сбрасывает
// кеш оболочки и перезагружает с сети, иначе reload отдал бы старую версию из кеша.
// Посреди урока новую версию не предлагаем: тост лежит выше плеера, а «Обновить» перезагрузило бы страницу на середине чата.
export function useUpdateAvailable() {
  const [how, setHow] = useState(null)

  useEffect(() => {
    let stopped = false
    let swNew = false
    let mismatches = 0
    let lastAt = 0
    // сообщение воркера ('sw') главнее запасных путей ('poll'/'stuck')
    const set = v => { if (!stopped) setHow(prev => (v === 'sw' ? v : prev || v)) }
    const flush = () => { if (swNew && !isLessonOpen()) set('sw') }
    const off = onNewVersion(() => { swNew = true; flush() })
    const wait = setInterval(flush, LESSON_WAIT_MS)

    async function check() {
      if (isLessonOpen() || swNew) return
      if (mismatches > 0 && Date.now() - lastAt < STUCK_GAP_MS) return
      lastAt = Date.now()
      if (isShellActive()) checkForUpdate() // версию доставит воркер (сообщение new-version), здесь — только подталкиваем
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
        if (!res.ok) return
        const d = decideUpdate({ netVersion: (await res.json()).v, appVersion: APP_VERSION, shellActive: isShellActive(), mismatches })
        mismatches = d.mismatches
        if (d.how) set(d.how)
      } catch { /* оффлайн или dev — молчим */ }
    }
    check()
    const id = setInterval(check, CHECK_MS)
    const onVis = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      stopped = true
      off()
      clearInterval(id)
      clearInterval(wait)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  return how
}
