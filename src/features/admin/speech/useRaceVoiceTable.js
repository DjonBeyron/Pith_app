import { useState, useEffect, useMemo, useCallback } from 'react'
import { getCatLines, getCachedCatLines } from '../../../shared/api/catLinesApi.js'
import { getAppSetting, saveAppSetting } from '../../../shared/api/appSettingsApi.js'
import { listWordAudio, cachedWordAudio, subscribeWordAudio } from '../../../shared/lib/wordAudio/wordAudioApi.js'
import { generateWordAudio } from '../../../shared/lib/wordAudio/wordAudioGenerate.js'
import { normalizeLines } from '../../player/modules/rotate-phone/wordLaneCatLines.js'
import { voicePitLines, voiceMissingTexts } from '../../rehearsal/rehearsalVoice.js'
import { RACE_LINES } from '../../pitrace/raceLines.js'
import { transKey } from '../../pitrace/raceTrans.js'
import { RACE_PHRASE_RU_KEY, RACE_PHRASE_SCENE_KEY, meaningMap, mergeMeanings } from './racePhraseMeaning.js'
import { saveLineText } from './raceLineText.js'
import { CAT_LINES } from '../../player/modules/rotate-phone/wordLaneCatLines.js'
import { auditVoice, raceCatalog } from './voiceAudit.js'
import { lineRows, meaningVoiceRows, sceneVoiceRows, transVoiceRows, wholeRows, miaRows } from './raceVoiceTable.js'
import { MIA_LINES, isMiaLine } from '../../pitrace/mia/miaLines.js'

// Данные и действия таблицы «Озвучка Пита» (RaceVoiceTable.jsx). Реплики — app_settings.rotate_cat_lines (озвучка voicePitLines: ElevenLabs → R2 → настройки, тот же путь, что «Озвучить реплики»),
// смыслы, переводы и фразы целиком — библиотека слов word_audio (generateWordAudio, ключ ru:текст как у useTransVoice; фраза — phrase:<normText>, тот же английский голос диктора, что у слов). Каталог реплик берётся из raceLines.js как есть: новые реплики появляются в таблице сами.
// После озвучки или правки текста зовётся onChange — блок поднимает linesRev модуля игры, и игра перечитывает реплики. Зависимости подставляются в тестах.
const defaults = {
  loadLines: () => getCatLines({ fresh: true }), cachedLines: getCachedCatLines, loadMeanings: () => getAppSetting(RACE_PHRASE_RU_KEY), saveMeanings: v => saveAppSetting(RACE_PHRASE_RU_KEY, v),
  loadScenes: () => getAppSetting(RACE_PHRASE_SCENE_KEY), saveScenes: v => saveAppSetting(RACE_PHRASE_SCENE_KEY, v),
  voiceLines: voicePitLines, voiceTexts: voiceMissingTexts, generate: generateWordAudio, saveText: saveLineText,
}

export default function useRaceVoiceTable({ plan, list = RACE_LINES, onChange = () => {}, deps = {} }) {
  const d = { ...defaults, ...deps }
  const { loadLines, loadMeanings, loadScenes } = d
  const [lines, setLines] = useState(() => { const c = d.cachedLines(); return c ? normalizeLines(c) : null }) // прочитанные в сессии реплики — сразу, без «загружаю…»
  const [raw, setRaw] = useState(() => d.cachedLines()) // сырые настройки реплик: аудит сверяет их с кодом (voiceAudit.js)
  const [lib, setLib] = useState(() => cachedWordAudio())
  const [saved, setSaved] = useState({})
  const [savedScene, setSavedScene] = useState({})
  const [rev, setRev] = useState(0)
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState('')
  const [errors, setErrors] = useState({})
  useEffect(() => {
    let live = true
    Promise.resolve(loadLines()).then(r => { if (live) { setRaw(r ?? null); setLines(normalizeLines(r)) } }).catch(() => { if (live) { setRaw(null); setLines(normalizeLines(null)) } })
    return () => { live = false }
  }, [loadLines, rev])
  useEffect(() => {
    let live = true
    Promise.resolve(loadMeanings()).then(v => { if (live) setSaved(meaningMap(v)) }).catch(() => {})
    return () => { live = false }
  }, [loadMeanings])
  useEffect(() => {
    let live = true
    Promise.resolve(loadScenes()).then(v => { if (live) setSavedScene(meaningMap(v)) }).catch(() => {})
    return () => { live = false }
  }, [loadScenes])
  useEffect(() => {
    listWordAudio().then(setLib).catch(() => {})
    return subscribeWordAudio(setLib)
  }, [])

  const audit = useMemo(() => auditVoice(raw, raceCatalog(), CAT_LINES), [raw]) // только реплики «Встряхни память»; остальные игры — в «Старом»
  const groups = useMemo(() => {
    const meanings = meaningVoiceRows(plan, saved, lib), scenes = sceneVoiceRows(plan, savedScene, lib)
    return { whole: wholeRows(plan, lib), lines: lineRows(list, lines, audit.byId), mia: miaRows(MIA_LINES.filter(l => isMiaLine(l.id)), lines, audit.byId), pitMia: miaRows(MIA_LINES.filter(l => !isMiaLine(l.id)), lines, audit.byId), meanings, scenes, trans: transVoiceRows(plan, [...meanings, ...scenes], lib) }
  }, [plan, saved, savedScene, lib, list, lines, audit])

  /** Озвучить строки (любых групп) заново; ошибки — по строкам */
  const voice = useCallback(async rows => {
    setBusy(true); setErrors({})
    const failed = {}
    try {
      const ids = rows.filter(r => r.group === 'line').map(r => r.id)
      if (ids.length) Object.assign(failed, (await d.voiceLines({ ids, onStep: setStep })).failed)
      const words = rows.filter(r => r.group !== 'line')
      const keyOf = r => r.key ?? transKey(r.text) // фраза целиком — свой ключ phrase:…, смысл и перевод — ru:…
      const byKey = Object.fromEntries(words.map(r => [keyOf(r), r.id]))
      if (words.length) {
        const res = await d.voiceTexts(words.map(r => ({ key: keyOf(r), text: r.text, has: false })), d.generate, setStep)
        for (const [k, e] of Object.entries(res.failed)) failed[byKey[k] ?? k] = e
      }
    } catch (e) { failed._all = e?.message || String(e) }
    setErrors(failed); setStep(''); setBusy(false); setRev(n => n + 1); onChange()
  }, [d.voiceLines, d.voiceTexts, d.generate, onChange]) // eslint-disable-line react-hooks/exhaustive-deps -- d собирается заново на рендер, нужны только функции

  /** Сохранить текст строки: реплика — в rotate_cat_lines (custom, главнее каталога), смысл — в race_phrase_ru, ситуация — в race_phrase_scene */
  const save = useCallback(async (row, text) => {
    setBusy(true); setErrors({})
    try {
      if (row.group === 'line') { setLines(await d.saveText(row.id, text)); setRev(n => n + 1) } // перечитать сырые настройки: аудит увидит правку
      else if (row.group === 'scene') { const next = mergeMeanings(savedScene, { [row.phrase]: text }); await d.saveScenes(next); setSavedScene(next) }
      else { const next = mergeMeanings(saved, { [row.id]: text }); await d.saveMeanings(next); setSaved(next) }
      onChange()
    } catch (e) { setErrors({ [row.id]: e?.message || String(e) }) }
    setBusy(false)
  }, [d.saveText, d.saveMeanings, d.saveScenes, saved, savedScene, onChange]) // eslint-disable-line react-hooks/exhaustive-deps -- см. выше

  return { loaded: !!lines, audit, groups, busy, step, errors, voice, save }
}
