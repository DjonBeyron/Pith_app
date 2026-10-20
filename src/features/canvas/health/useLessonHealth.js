import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { collectNodeUrls, allUrls, buildHealth } from './lessonHealth.js'
import { probeMany, invalidateProbes } from './urlProbe.js'
import { setBrokenNodes } from './brokenStore.js'

const DEBOUNCE_MS = 1200

// Здоровье файлов урока для шапки канваса и «Разбора»: по сменам нод/файлов (с задержкой — холст шлёт их на каждое движение)
// проверяет ссылки медиа (urlProbe.js, кэш 10 мин) и отдаёт { broken, unknown, checked, total, checking, recheck }.
// Сломанные ноды публикует в brokenStore — метка ⚠ на самих нодах холста
export function useLessonHealth({ nodes, files, enabled = true }) {
  const entries = useMemo(() => collectNodeUrls(nodes, files), [nodes, files])
  const urlKey = useMemo(() => allUrls(entries).sort().join('\n'), [entries])
  const [probes, setProbes] = useState(() => new Map())
  const [checking, setChecking] = useState(false)
  const [tick, setTick] = useState(0) // «Проверить снова»
  const runRef = useRef(0)

  useEffect(() => {
    if (!enabled || !urlKey) return undefined // старые пробы остаются (они и так в кэше) — сброс здесь был бы setState в эффекте
    const run = ++runRef.current
    const urls = urlKey.split('\n')
    const t = setTimeout(async () => {
      setChecking(true)
      const acc = new Map()
      await probeMany(urls, {
        cancelled: () => runRef.current !== run,
        onProbe: (u, p) => { acc.set(u, p); if (runRef.current === run) setProbes(new Map(acc)) },
      })
      if (runRef.current === run) setChecking(false)
    }, DEBOUNCE_MS)
    return () => { clearTimeout(t); runRef.current += 1 }
  }, [enabled, urlKey, tick])

  const health = useMemo(() => buildHealth(nodes, files, probes), [nodes, files, probes])
  useEffect(() => { setBrokenNodes(health.broken) }, [health.broken])
  useEffect(() => () => setBrokenNodes([]), [])

  const recheck = useCallback(() => { invalidateProbes(urlKey.split('\n')); setTick(n => n + 1) }, [urlKey])
  return { ...health, checking, recheck }
}
