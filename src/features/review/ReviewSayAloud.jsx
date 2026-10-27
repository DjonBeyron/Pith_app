import { useMemo } from 'react'
import SayAloudLaunch from '../learn/say-aloud/SayAloudLaunch.jsx'
import { translationMap } from '../../shared/lib/memory/sceneVarsSource.js'

// Третье место запуска «Скажи вслух» — итог повторения: «Пит нашёл игру на минутку». Лестницы памяти (view) в итоге нет, поэтому слова берём
// из памяти до сессии (memory — строки word_memory; сегодняшние слова — самые срочные, и раунд начнётся с них) и переводов опубликованных
// модулей (curricula, как у сцен: translationMap). Кнопка видна при ≥ 3 подходящих словах (годных для Vosk, с переводом) — решает SayAloudLaunch.
export default function ReviewSayAloud({ memory, curricula }) {
  const pool = useMemo(() => {
    const tr = translationMap(curricula)
    return (memory ?? []).map(m => ({ word: m.word, translation: tr.get(m.word) ?? '', due: m.due_on, step: m.step }))
  }, [memory, curricula])
  return <SayAloudLaunch pool={pool} variant="summary" label="Пит нашёл игру на минутку" />
}
