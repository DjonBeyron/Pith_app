import { useState, useEffect, useRef } from 'react'
import { setPending, getPending, flushOne, usePendingKey } from '../../../shared/lib/pendingSettings.js'
import { generateSpeech } from '../../../shared/lib/ttsApi.js'
import { uploadToR2, deleteFromR2 } from '../../../shared/lib/r2.js'
import { probeAudioDuration } from '../../../shared/lib/audioUtils.js'
import { getCatLines, saveCatLines } from '../../../shared/api/catLinesApi.js'
import { REHEARSAL_LINE_IDS } from '../../rehearsal/rehearsalLines.js'
import { CAT_LINES, MAX_LINE_CHARS, normalizeLines, withText, linesToSave, lineMs } from '../../player/modules/rotate-phone/wordLaneCatLines.js'
import { mouthTrack } from '../../player/modules/rotate-phone/wordLaneVisemes.js'
import WordLaneCat from '../../player/modules/rotate-phone/WordLaneCat.jsx'

// Реплики кота-диктора: общие для ВСЕХ нод «Переверни телефон» (хранятся в настройках приложения, не в ноде). Здесь видны все реплики каталога (когда кот их говорит), правится текст,
// «🔊 Озвучить» делает озвучку ElevenLabs, «▶» проигрывает реплику и показывает анимацию рта Пита — она собирается по буквам текста (на «о» рот круглый, на «м/б/п» сомкнут …) и по таймингам слов
// озвучки; «⤢» увеличивает предпросмотр втрое. Любая правка (текст, озвучка, удаление озвучки) — НЕСОХРАНЁННАЯ: она попадает в реестр pendingSettings, и на кнопке «Сохранить» урока мигает точка;
// кнопка «Сохранить» записывает её вместе с уроком (можно и кнопкой ниже). Старые файлы озвучки удаляются из R2 только после записи. Без озвучки игрок видит реплику подписью.
const KEY = 'cat_lines'

export default function CatLinesPanel() {
  const [lines, setLines] = useState(() => getPending(KEY)?.value ?? normalizeLines(null)) // правка, оставшаяся после сворачивания блока, возвращается
  const [state, setState] = useState({ loaded: !!getPending(KEY), busy: '', msg: '', big: false })
  const dirty = usePendingKey(KEY)
  const catRef = useRef(null)
  const audioRef = useRef(null)
  const deletesRef = useRef(getPending(KEY)?.deletes ?? []) // файлы озвучки, которые удалим после записи

  useEffect(() => { if (!getPending(KEY)) getCatLines().then(raw => { setLines(normalizeLines(raw)); setState(s => ({ ...s, loaded: true })) }) }, [])
  useEffect(() => () => { audioRef.current?.pause() }, [])

  const flag = (busy, msg = '') => setState(s => ({ ...s, busy, msg }))
  // Правка: сохраняем в реестр (мигает «Сохранить»); drop — файл озвучки, ставший ненужным
  function commit(next, drop = null) {
    if (drop) deletesRef.current = [...deletesRef.current, drop]
    const deletes = deletesRef.current
    setLines(next)
    setPending(KEY, {
      value: next, deletes, label: 'реплики кота',
      flush: async () => {
        await saveCatLines(linesToSave(next))
        deletes.forEach(u => deleteFromR2(u).catch(() => {}))
        deletesRef.current = []
      },
    })
    setState(s => ({ ...s, msg: '' }))
  }

  async function saveNow() {
    flag('save')
    try { await flushOne(KEY); flag('', 'Сохранено') } catch (e) { flag('', `Не сохранилось: ${e.message}`) }
  }

  async function voice(id) {
    const line = lines[id]
    if (!line.text.trim() || state.busy) return
    flag(id)
    try {
      const { file, wordTimings } = await generateSpeech(line.text)
      const blob = URL.createObjectURL(file)
      const [url, duration] = await Promise.all([uploadToR2(file), probeAudioDuration(blob)]).finally(() => URL.revokeObjectURL(blob))
      commit({ ...lines, [id]: { ...line, url, duration, words: wordTimings?.length ? wordTimings : null } }, line.url)
      flag('', 'Озвучено — нажмите «Сохранить»')
    } catch (e) { flag('', `Не озвучилось: ${e.message}`) }
  }

  const dropVoice = id => { const line = lines[id]; commit({ ...lines, [id]: { ...line, url: null, duration: null, words: null } }, line.url) }

  function play(id) {
    const line = lines[id]
    audioRef.current?.pause()
    const ms = lineMs(line)
    catRef.current?.speak?.(mouthTrack(line.text, ms, line.words, line.duration), ms, { id })
    if (line.url) { const a = new Audio(line.url); audioRef.current = a; a.play().catch(() => {}) }
  }

  return (
    <div className="catLines" onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
      <div className={`wlStage catLinesCat${state.big ? ' catLinesCat--big' : ''}`} aria-hidden="true"><WordLaneCat apiRef={catRef} /></div>
      <button type="button" className="nodeTablePickerBtn catLinesBig" onClick={() => setState(s => ({ ...s, big: !s.big }))}>{state.big ? '⤡ Свернуть предпросмотр' : '⤢ Развернуть предпросмотр (×3)'}</button>
      <div className="catLinesList">
        {CAT_LINES.map(d => {
          const line = lines[d.id]
          return (
            <div key={d.id} className="catLine" data-testid={`cat-line-${d.id}`}>
              <div className="catLineWhen">{d.when}</div>
              <input className="nodeRotateInput" value={line.text} maxLength={MAX_LINE_CHARS} readOnly={REHEARSAL_LINE_IDS.includes(d.id)} title={REHEARSAL_LINE_IDS.includes(d.id) ? 'Текст реплики репетиции задан в коде (rehearsalLines.js); здесь только озвучка' : undefined} onChange={e => commit({ ...lines, [d.id]: withText(line, e.target.value) }, line.url && e.target.value.trim() !== line.text ? line.url : null)} aria-label={`Реплика: ${d.when}`} />
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
        <button type="button" className={`nodeTablePickerBtn${dirty ? ' catLinesSave--hot' : ''}`} onClick={saveNow} disabled={!dirty || !!state.busy}>{state.busy === 'save' ? '…' : 'Сохранить реплики'}</button>
        <span className={`nodeRotateTrainerInfo${dirty ? ' catLinesWarn' : ''}`}>{dirty ? 'Есть несохранённые реплики — нажмите «Сохранить» вверху (или здесь)' : state.msg || (state.loaded ? '' : 'загружаю…')}</span>
      </div>
    </div>
  )
}
