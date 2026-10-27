import { useState, useEffect, useRef } from 'react'
import { generateSpeech } from '../../../shared/lib/ttsApi.js'
import { uploadToR2, deleteFromR2 } from '../../../shared/lib/r2.js'
import { probeAudioDuration } from '../../../shared/lib/audioUtils.js'
import { getCatLines, saveCatLines } from '../../../shared/api/catLinesApi.js'
import { CAT_LINES, MAX_LINE_CHARS, normalizeLines, withText, linesToSave, lineMs } from '../../player/modules/rotate-phone/wordLaneCatLines.js'
import { mouthTrack } from '../../player/modules/rotate-phone/wordLaneVisemes.js'
import WordLaneCat from '../../player/modules/rotate-phone/WordLaneCat.jsx'

// Реплики кота-диктора: общие для ВСЕХ нод «Переверни телефон» (хранятся в настройках приложения, не в ноде). Здесь видны все реплики каталога (когда кот их говорит), правится текст,
// «🔊 Озвучить» делает озвучку ElevenLabs (после озвучки список сохраняется сам), «▶» проигрывает реплику и показывает анимацию рта Пита — она собирается по буквам текста (на «о» рот круглый,
// на «м/б/п» сомкнут …) и по таймингам слов озвучки. Без озвучки игрок видит реплику подписью. Правки текста — кнопкой «Сохранить».
export default function CatLinesPanel() {
  const [lines, setLines] = useState(() => normalizeLines(null))
  const [state, setState] = useState({ loaded: false, busy: '', msg: '', dirty: false })
  const catRef = useRef(null)
  const audioRef = useRef(null)

  useEffect(() => { getCatLines().then(raw => { setLines(normalizeLines(raw)); setState(s => ({ ...s, loaded: true })) }) }, [])
  useEffect(() => () => { audioRef.current?.pause() }, [])

  const patch = (id, next, dirty = true) => { setLines(l => ({ ...l, [id]: next })); setState(s => ({ ...s, dirty: s.dirty || dirty, msg: '' })) }
  const flag = (busy, msg = '') => setState(s => ({ ...s, busy, msg }))

  async function save(next = lines) {
    flag('save')
    try { await saveCatLines(linesToSave(next)); setState(s => ({ ...s, busy: '', dirty: false, msg: 'Сохранено' })) } catch (e) { flag('', `Не сохранилось: ${e.message}`) }
  }

  async function voice(id) {
    const line = lines[id]
    if (!line.text.trim() || state.busy) return
    flag(id)
    const old = line.url
    try {
      const { file, wordTimings } = await generateSpeech(line.text)
      const blob = URL.createObjectURL(file)
      const [url, duration] = await Promise.all([uploadToR2(file), probeAudioDuration(blob)]).finally(() => URL.revokeObjectURL(blob))
      const next = { ...lines, [id]: { ...line, url, duration, words: wordTimings?.length ? wordTimings : null } }
      setLines(next)
      await save(next)
      if (old) deleteFromR2(old).catch(() => {}) // прежняя озвучка этой реплики больше не нужна
    } catch (e) { flag('', `Не озвучилось: ${e.message}`) }
  }

  async function dropVoice(id) {
    const line = lines[id]
    const next = { ...lines, [id]: { ...line, url: null, duration: null, words: null } }
    setLines(next)
    await save(next)
    if (line.url) deleteFromR2(line.url).catch(() => {})
  }

  function play(id) {
    const line = lines[id]
    audioRef.current?.pause()
    const ms = lineMs(line)
    catRef.current?.speak?.(mouthTrack(line.text, ms, line.words), ms)
    if (line.url) { const a = new Audio(line.url); audioRef.current = a; a.play().catch(() => {}) }
  }

  return (
    <div className="catLines" onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
      <div className="wlStage catLinesCat" aria-hidden="true"><WordLaneCat apiRef={catRef} /></div>
      <div className="catLinesList">
        {CAT_LINES.map(d => {
          const line = lines[d.id]
          return (
            <div key={d.id} className="catLine" data-testid={`cat-line-${d.id}`}>
              <div className="catLineWhen">{d.when}</div>
              <input className="nodeRotateInput" value={line.text} maxLength={MAX_LINE_CHARS} onChange={e => patch(d.id, withText(line, e.target.value))} aria-label={`Реплика: ${d.when}`} />
              <div className="catLineRow">
                <button type="button" className="nodeAudioTtsBtn" onClick={() => voice(d.id)} disabled={!line.text.trim() || !!state.busy}>{state.busy === d.id ? '…' : '🔊 Озвучить'}</button>
                <button type="button" className="nodeTablePickerBtn" onClick={() => play(d.id)} title="Проиграть реплику и показать рот Пита">▶</button>
                {line.url && <button type="button" className="nodeTablePickerBtn" onClick={() => dropVoice(d.id)} disabled={!!state.busy}>✕ озвучку</button>}
                <span className="nodeRotateTrainerInfo">{line.url ? `озвучено · ${line.duration?.toFixed(1) ?? '?'} с` : 'без озвучки — игрок увидит подпись'}</span>
              </div>
            </div>
          )
        })}
      </div>
      <div className="catLineRow">
        <button type="button" className="nodeTablePickerBtn" onClick={() => save()} disabled={!state.dirty || !!state.busy}>{state.busy === 'save' ? '…' : 'Сохранить реплики'}</button>
        <span className="nodeRotateTrainerInfo">{state.msg || (state.loaded ? (state.dirty ? 'есть несохранённые правки' : '') : 'загружаю…')}</span>
      </div>
    </div>
  )
}
