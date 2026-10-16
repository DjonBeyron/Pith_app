import { useEffect, useState } from 'react'
import { Mic } from 'lucide-react'
import { listWordAudio, cachedWordAudio, subscribeWordAudio } from '../../../shared/lib/wordAudio/wordAudioApi.js'
import { generateWordAudio } from '../../../shared/lib/wordAudio/wordAudioGenerate.js'
import { wordKey } from '../../../shared/lib/wordAudio/wordKey.js'
import ScTip from './ScTip.jsx'

// Статус озвучки запасного слова в библиотеке word_audio (под полями слова в VarRow): слово подставляется в шаблонную реплику
// готовым файлом из библиотеки; нет файла — вся реплика прочитается синтезом устройства. «Озвучить слово» — тот же админский путь,
// что у меню 🔊 «Озвучить слова» в канвасе (generateWordAudio: ElevenLabs стандартным голосом проекта → R2 → строка word_audio).
// Кэш библиотеки — wordAudioApi (на сессию); пока список не загружен, кнопка неактивна (иначе частичный кэш).
export default function VarWordAudio({ text, lock = false, generate = generateWordAudio }) {
  const [lib, setLib] = useState(() => cachedWordAudio())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    listWordAudio().then(setLib)
    return subscribeWordAudio(setLib)
  }, [])
  const word = String(text ?? '').trim()
  const key = wordKey(word)
  if (!word) return null
  if (!key) return <p className="scbSub scbVarWord" data-state="skip">Слово «{word}» не для библиотеки озвучки (латиница, без кириллицы): реплика прочитается синтезом устройства.</p>
  const has = !!lib?.get(key)
  const run = async () => {
    setBusy(true); setError('')
    try { await generate(key, word) } catch (e) { setError(e?.message || String(e)) }
    setBusy(false)
  }
  return (
    <p className={has ? 'scbSub scbVarWord' : 'scbSub scbVarWord scbVarWordMiss'} data-state={has ? 'ok' : 'missing'}>
      {has ? <>Слово «{word}» озвучено в библиотеке.</> : <>Слово «{word}» не озвучено в библиотеке: реплика целиком прозвучит синтезом устройства.</>}
      {!has && (
        <button type="button" className="fsBtn fsBtnSmall" onClick={run} disabled={busy || lock || !lib} title="Озвучить слово через ElevenLabs и добавить в библиотеку озвучки слов">
          <Mic size={13} /> {busy ? 'Озвучиваю…' : 'Озвучить слово'}
        </button>
      )}
      <ScTip help="vars_word_audio" />
      {error && <span className="scbVoiceErr" role="alert"> {error}</span>}
    </p>
  )
}
