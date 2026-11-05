import { useState, useEffect, useMemo, useCallback } from 'react'
import { getCatLines } from '../../shared/api/catLinesApi.js'
import { normalizeLines } from '../player/modules/rotate-phone/wordLaneCatLines.js'
import { lineVoiced } from '../rehearsal/rehearsalLines.js'
import { voiceMissingPitLines } from '../rehearsal/rehearsalVoice.js'
import { planFor } from '../rehearsal/rehearsalFixtures.js'
import { warmGameSounds } from '../player/modules/rotate-phone/wordLaneWarm.js'
import { prefetchWords, dropWarmed } from '../player/modules/rotate-phone/wordLaneFetch.js'
import { getPhrases, phraseEntry, voicePhrase, phraseItem } from './game2Phrase.js'
import { phraseText } from './timelinePlan.js'
import { GAME2_LINES } from './game2Modes.js'
import { game2Cfg } from './game2Cfg.js'
import { log } from './game2Log.js'

// Подготовка стенда «Мини-игра 2.0» в админке: план из фикстуры, реплики Пита (rotate_cat_lines), озвучка фразы (game2_phrases), озвучка из этого блока (ElevenLabs → R2) и прогрев звука ДО тапа
// «Запустить» (wordLaneWarm: реплики качаются и декодируются, к тапу остаётся разбудить; озвучка фразы качается отдельно — её адреса нет в каталоге реплик). Нужны права админа для озвучки.
export default function useGame2Setup({ fixture, load = getCatLines, loadPhrases = getPhrases, voiceLines = voiceMissingPitLines, voiceOne = voicePhrase }) {
  const [lines, setLines] = useState(null)
  const [phrases, setPhrases] = useState(null)
  const [rev, setRev] = useState(0)
  const [busy, setBusy] = useState('') // '' | 'lines' | 'phrase'
  const [error, setError] = useState('')

  const plan = useMemo(() => planFor('sim', { fixture }), [fixture])
  const text = useMemo(() => phraseText(plan), [plan])
  useEffect(() => {
    let live = true
    load().then(raw => { if (live) setLines(normalizeLines(raw)) }).catch(() => { if (live) setLines(normalizeLines(null)) })
    return () => { live = false }
  }, [load, rev])
  useEffect(() => {
    let live = true
    loadPhrases(true).then(m => { if (live) setPhrases(m) }).catch(() => { if (live) setPhrases({}) })
    return () => { live = false }
  }, [loadPhrases, rev])
  const phrase = useMemo(() => phraseEntry(phrases, text), [phrases, text])
  const lineCount = useMemo(() => ({ done: GAME2_LINES.filter(id => lineVoiced(id, lines?.[id])).length, total: GAME2_LINES.length }), [lines])

  // Прогрев до тапа: реплики Пита и озвучка фразы (декодируются в AudioBuffer); отпускаются при смене набора и закрытии блока
  useEffect(() => {
    if (!lines) return undefined
    const mine = new Set()
    warmGameSounds({ cfg: game2Cfg(), lines }, { onItems: items => items.forEach(i => mine.add(i.url)) })
    const items = phraseItem(phrase)
    items.forEach(i => mine.add(i.url))
    if (items.length) prefetchWords(items)
    return () => dropWarmed([...mine])
  }, [lines, phrase])

  const run = useCallback(async (kind, job) => {
    setBusy(kind); setError('')
    try { await job() } catch (e) { setError(e?.message || String(e)); log(`озвучка не вышла: ${e?.message || e}`) }
    setBusy(''); setRev(n => n + 1)
  }, [])
  const voiceLinesNow = useCallback(() => run('lines', () => voiceLines({})), [run, voiceLines])
  const voicePhraseNow = useCallback(() => run('phrase', () => voiceOne(text)), [run, voiceOne, text])

  return { plan, text, lines, phrase, lineCount, busy, error, rev, voiceLines: voiceLinesNow, voicePhrase: voicePhraseNow }
}
