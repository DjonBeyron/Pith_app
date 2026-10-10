import { useEffect } from 'react'
import { startIdlePrewarm } from '../../shared/lib/idlePrewarm.js'
import { prefetchSayPhrasePanel } from './panels/say-phrase/sayPhrasePrefetch.js'

/**
 * Подготовка урока с модулем «Сказать фразу» (has — в уроке есть нода say_phrase; без неё ничего не делается): чанк панели грузится тихо, в простое (микрофон не трогаем — он только по тапу
 * в панели), а Vosk греется ЗАРАНЕЕ — при входе в урок (sayLessonWarm.js, подгружается отдельным чанком только для таких уроков): модель из кэша в память, либо сразу фоновая загрузка,
 * если её ещё нет. Возвращает cancel(): урок закрыт → прогрев отпускается (модель живёт ещё 30 с и выгружается). deps подставляются в тестах.
 */
export function startLessonWarmups(has, deps = {}) {
  if (!has) return undefined
  const d = { idle: startIdlePrewarm, prefetchPanel: prefetchSayPhrasePanel, loadWarm: () => import('../../shared/lib/speech/sayLessonWarm.js'), ...deps }
  const stopPrefetch = d.idle([d.prefetchPanel])
  let dead = false
  let cancel = null
  Promise.resolve().then(d.loadWarm).then(m => { if (!dead) cancel = m.startLessonWarm() }).catch(() => { /* офлайн / чанк-сирота: прогрев всё равно начнётся при открытии панели */ })
  return () => { dead = true; stopPrefetch?.(); cancel?.() }
}

export function useLessonWarmups(nodes) {
  const hasSayPhrase = nodes.some(n => n.type === 'say_phrase')
  useEffect(() => startLessonWarmups(hasSayPhrase), [hasSayPhrase])
}
