import { useState, useEffect, useCallback } from 'react'
import { getRecognitionCtor } from '../../../shared/lib/speech/speechSupport.js'
import {
  readSettings, writeSettings, sanitizeSettings, detectFeatures, effectiveSettings, activeModes,
  generateWrongForms, wrongFormsOfWord, parseWrongList,
} from './antiPredictModes.js'

// React-обвязка экспериментов «против домысливания»: выбранные режимы (localStorage), ошибочные формы, подпись «что я сказал»,
// снимок настроек на момент тапа (getExtra → speechController.start({extra})) и состояние локальной модели Chrome (режим 6).
export function useAntiPredict({ reference, lang, series = null }) {
  const [settings, setSettings] = useState(readSettings)
  const [features] = useState(() => detectFeatures(window))
  const [wrongEdit, setWrongEdit] = useState(null) // { ref, text } — правка поля относится к эталону, при смене эталона сбрасывается
  const [said, setSaid] = useState('')
  const [local, setLocal] = useState({ status: null, error: null })
  const [installing, setInstalling] = useState(false)
  const [tick, setTick] = useState(0)
  const localLang = settings.lang || lang

  const wrongText = wrongEdit && wrongEdit.ref === reference ? wrongEdit.text : generateWrongForms(reference).join(', ')
  const setWrongText = useCallback(text => setWrongEdit({ ref: reference, text }), [reference])
  const resetWrong = useCallback(() => setWrongEdit(null), [])

  const update = useCallback(patch => {
    const next = sanitizeSettings({ ...settings, ...patch })
    setSettings(next)
    writeSettings(next)
  }, [settings])

  // Статус локальной модели: есть / нужно скачать / скачивается / недоступна (SpeechRecognition.available, Chrome 139+)
  useEffect(() => {
    if (!settings.local || !features.localAvailable) return undefined
    let alive = true
    Promise.resolve()
      .then(() => getRecognitionCtor().available({ langs: [localLang], processLocally: true }))
      .then(status => { if (alive) setLocal({ status, error: null }) })
      .catch(e => { if (alive) setLocal({ status: null, error: e?.message || String(e) }) })
    return () => { alive = false }
  }, [settings.local, localLang, features.localAvailable, tick])

  const install = useCallback(async () => {
    setInstalling(true)
    try { await getRecognitionCtor().install({ langs: [localLang], processLocally: true }) } catch (e) { setLocal({ status: null, error: e?.message || String(e) }) }
    setInstalling(false)
    setTick(n => n + 1)
  }, [localLang])

  // Снимок на момент тапа. wordRef — режим «одно слово»: эталон = слово, ошибочные формы = его таблица.
  // series — активный шаг серии «длина контекста»: в серии альтернативы (10) и история interim включены автоматически
  const getExtra = useCallback(wordRef => {
    const s = series && !wordRef ? { ...settings, alts: true, history: true } : settings
    const list = wordRef ? wrongFormsOfWord(wordRef) : parseWrongList(wrongText, reference)
    return {
      v: 1, settings: effectiveSettings(s, features), oneWord: !!wordRef, modes: activeModes(s, features, !!wordRef),
      wrong: series && !wordRef ? [series.wrongPhrase, ...list.filter(w => w !== series.wrongPhrase)] : list,
      said: wordRef ? said.trim() : (said.trim() || series?.said || series?.wrongPhrase || ''), // «что я сказал» фиксируется на момент тапа
      ...(series && !wordRef ? { series } : {}),
    }
  }, [settings, features, wrongText, reference, series, said])

  return { settings, update, features, wrongText, setWrongText, resetWrong, said, setSaid, getExtra, local, install, installing }
}
