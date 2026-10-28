import { useCallback, useEffect, useRef, useState } from 'react'
import { canSeedWord, seedMemoryWord } from '../../../shared/api/memorySeedApi.js'
import { localDate } from '../../../shared/lib/memory/dailyPick.js'
import { track } from '../../../shared/lib/analytics/track.js'
import { MEMORY_SEED } from '../../../shared/lib/analytics/eventNames.js'
import { sendWordToMemory } from '../../learn/memoryFresh.js'
import { SEED_PER_DAY, shouldOfferSeed, seedOffersToday, markSeedOffered } from './seedWord.js'

// «Семена памяти» (B6): хук предложения сохранить слово. offer(word | [слова], moduleId) — по порядку берёт первое
// слово, которое можно предложить (есть колода, нет в памяти), и если дневной лимит не выбран — выставляет current
// { word, moduleId }. save(el) — слово в память (seedMemoryWord) и полёт плашки el на панель (sendWordToMemory);
// decline() — «Не сейчас». Оба закрывают предложение и пишут memory_seed в аналитику.
export function useSeedWord() {
  const [current, setCurrent] = useState(null)
  const busy = useRef(false)
  const saving = useRef(false)
  const alive = useRef(true) // размонтировались, пока ждали canSeedWord — плашку не выставляем
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  const offer = useCallback(async (words, moduleId) => {
    const today = localDate(new Date())
    if (busy.current || seedOffersToday(today) >= SEED_PER_DAY) return
    busy.current = true
    try {
      for (const word of [].concat(words)) {
        if (!word) continue
        const can = await canSeedWord(word) // уже включает «есть колода» и «нет в памяти»
        if (!alive.current) return
        if (!shouldOfferSeed({ ok: true, hasDeck: can, inMemory: false, offeredToday: seedOffersToday(today) })) continue
        markSeedOffered(today)
        setCurrent({ word, moduleId })
        return
      }
    } finally { busy.current = false }
  }, [])

  // Плашка остаётся на экране, пока слово записывается: копию для полёта sendWordToMemory снимает с живого элемента
  const save = useCallback(async el => {
    if (!current || saving.current) return
    saving.current = true
    track(MEMORY_SEED, { word: current.word, saved: true })
    try {
      const res = await seedMemoryWord(current.word, current.moduleId)
      if (res?.ok) sendWordToMemory(el)
    } finally {
      saving.current = false
      setCurrent(null)
    }
  }, [current])

  const decline = useCallback(() => {
    if (current) track(MEMORY_SEED, { word: current.word, saved: false })
    setCurrent(null)
  }, [current])

  return { current, offer, save, decline }
}
