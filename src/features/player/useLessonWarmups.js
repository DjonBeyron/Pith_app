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

/**
 * Озвучка нод «Повтори за диктором» (rotate_phone) урока — куски фразы, слова и реплики Пита — скачивается заранее, в простое после входа в урок (wordLaneWarm.warmLessonRotate подгружается отдельным чанком только
 * для таких уроков): к тапу «Начать» файлы уже у телефона (иначе озвучка не успевала за 2,5 с, и Пит начинал молча). Только скачать: замеры — когда карточка покажется. Возвращает cancel().
 */
export function startRotateWarmups(rotateNodes, deps = {}) {
  if (!rotateNodes?.length) return undefined
  const d = { idle: startIdlePrewarm, load: () => import('./modules/rotate-phone/wordLaneWarm.js'), ...deps }
  let dead = false
  const stop = d.idle([() => d.load().then(m => (dead ? undefined : m.warmLessonRotate(rotateNodes)))])
  return () => { dead = true; stop?.() }
}

export function useLessonWarmups(nodes) {
  const hasSayPhrase = nodes.some(n => n.type === 'say_phrase' || n.type === 'rotate_phone') // «Повтори за диктором» слушает Vosk так же, как «Сказать фразу»
  useEffect(() => startLessonWarmups(hasSayPhrase), [hasSayPhrase])
  const rotate = nodes.filter(n => n.type === 'rotate_phone')
  const rotateKey = JSON.stringify(rotate.map(n => n.typeData?.rotate_phone ?? null)) // содержимое нод, а не новый массив на каждый рендер плеера
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => startRotateWarmups(rotate), [rotateKey])
}
