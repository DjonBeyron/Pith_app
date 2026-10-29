import { useState, useEffect, useRef } from 'react'
import WordLaneMirror from '../../rehearsal/mirror/WordLaneMirror.jsx'
import { recordTake, releaseTake } from '../../rehearsal/mirror/takeRecorder.js'
import { listenTake } from '../../rehearsal/mirror/mirrorListen.js'
import { dictorFromLibrary, libraryRms } from '../../rehearsal/mirror/dictorFromLibrary.js'
import { measureTake } from '../../rehearsal/mirror/mirrorMeasure.js'
import { noteFor } from '../../rehearsal/mirror/mirrorNotes.js'
import { CHUNKS, DICTOR, STUDENT_CLEAN, STUDENT_MISSING, STUDENT_PAUSE } from '../../rehearsal/mirror/mirrorFixtures.js'
import { openGameMic, getGameMic, closeGameMic } from '../../../shared/lib/gameMic.js'
import { prepareWords, sliceToWav } from '../../player/modules/rotate-phone/wordLaneClips.js'
import { libItems } from '../../player/modules/rotate-phone/wordLaneLib.js'
import { listWordAudio, cachedWordAudio, subscribeWordAudio } from '../../../shared/lib/wordAudio/wordAudioApi.js'
import { useVoskReady } from '../../../shared/lib/vosk/useVoskReady.js'

// ВРЕМЕННЫЙ демо-блок (Админ → «Голос» → «Зеркало (демо)»): проверка модуля «Дубль и зеркало» (src/features/rehearsal/mirror/) без сценария репетиции. Удалить, когда сценарий (акт 5) заработает.
// «Записать дубль»: фраза «I'm | trying | to learn», 4 с записи на микрофоне игры (openGameMic — в тапе; recordTake на том же потоке) + Vosk (listenTake) даёт слова с таймингами; диктор — куски
// библиотеки слов (prepareWords → dictorFromLibrary). Нет модели Vosk / слов — тайминги слов человека ПОДСТАВЛЯЮТСЯ равномерно по длине записи (пометка на экране). «Примеры» — готовые подставные дубли
// (чистый / пропуск / долгая пауза) без микрофона: звук записи — тишина, диктор только подсвечивается по таймингам.
const TAKE_MS = 4000
const PHRASE = CHUNKS.join(' | ')

/** Равномерные тайминги вместо Vosk: слова фразы делят середину записи поровну (секунды, как у Vosk) */
function uniformWords(chunks, durationMs) {
  const toks = chunks.flatMap(c => c.split(/\s+/)).filter(Boolean)
  const from = durationMs * 0.12
  const step = (durationMs * 0.76) / Math.max(1, toks.length)
  return toks.map((word, i) => ({ word, conf: 1, start: (from + i * step) / 1000, end: (from + (i + 0.85) * step) / 1000 }))
}

function silentWavUrl(ms) {
  const rate = 8000
  const sec = ms / 1000
  return URL.createObjectURL(new Blob([sliceToWav(new Float32Array(Math.round(rate * sec)), rate, 0, sec)], { type: 'audio/wav' }))
}

/** Диктор для примеров: тайминги из фикстуры, звука нет — play() просто ждёт длину фразы (пилюли горят по таймингам) */
const fakeDictor = () => ({ ...DICTOR, leadMs: 0, play: () => new Promise(r => setTimeout(r, DICTOR.durationMs + 250)) })

export default function MirrorDemoBlock() {
  const [lib, setLib] = useState(() => cachedWordAudio())
  const [phase, setPhase] = useState('idle') // idle | opening | recording | analyzing
  const [status, setStatus] = useState('')
  const [shown, setShown] = useState(null)   // { dictor, student, measure, note, info }
  const live = useRef(null)                  // { rec, listener, timer, ready } пока идёт запись
  const takeRef = useRef(null)               // что освободить при смене/уходе (objectURL дубля)

  useEffect(() => { listWordAudio().then(setLib); return subscribeWordAudio(setLib) }, [])
  const vosk = useVoskReady({ why: 'mirror-demo' }) // модель Vosk прогрета, пока блок открыт (общая проверка готовности, как у игр)
  useEffect(() => () => { live.current?.rec.cancel(); live.current?.listener.cancel(); clearTimeout(live.current?.timer); releaseTake(takeRef.current); closeGameMic() }, [])

  const show = value => { releaseTake(takeRef.current); takeRef.current = value?.student ?? null; setShown(value) }

  async function record() {
    setShown(null); setPhase('opening'); setStatus('Открываю микрофон…')
    const ready = prepareWords(libItems(CHUNKS, lib)).catch(() => false) // слоты звука диктора будятся в жесте (тап по кнопке)
    const mic = await openGameMic()
    const stream = mic === 'granted' ? getGameMic() : null
    if (!stream) { setPhase('idle'); setStatus(`Микрофон недоступен (${mic}).`); return }
    const rec = recordTake({ stream, maxMs: TAKE_MS + 1500 })
    const listener = listenTake({ chunks: CHUNKS, stream, maxMs: TAKE_MS + 1500 })
    live.current = { rec, listener, ready, timer: setTimeout(stop, TAKE_MS) }
    setPhase('recording'); setStatus(`Говорите: ${PHRASE.replaceAll(' | ', ' ')} (запись ${TAKE_MS / 1000} с)…`)
  }

  async function stop() {
    const cur = live.current
    if (!cur) return
    live.current = null
    clearTimeout(cur.timer)
    setPhase('analyzing'); setStatus('Разбираю дубль…')
    cur.listener.stop()
    let take = null
    let error = null
    try { take = await cur.rec.stop() } catch (e) { error = e?.code || 'failed' }
    const heard = await cur.listener.done
    closeGameMic() // микрофон закрыт: звук дубля остался в памяти страницы
    await cur.ready
    const dictor = { ...dictorFromLibrary(CHUNKS, { cache: lib }), rms: await libraryRms(CHUNKS, { cache: lib }) }
    const uniform = !!take && !heard.words.length
    const student = take ? { url: take.url, durationMs: take.durationMs, rms: take.rms, words: uniform ? uniformWords(CHUNKS, take.durationMs) : heard.words } : undefined
    const raw = student ? measureTake({ dictor, student, chunks: CHUNKS }) : null
    const measure = raw && uniform ? { ...raw, tempo: null, pauses: [], gaps: [] } : raw // равномерные тайминги подставные: темп и паузы по ним не судим
    show({ dictor, student, measure, note: measure ? noteFor(measure, CHUNKS) : undefined,
      info: error ? `запись не получилась (${error})` : `дубль ${take.durationMs} мс, RMS ${take.rms.toFixed(3)}; слова: ${uniform ? `ПОДСТАВНЫЕ равномерные (Vosk: ${heard.reason ?? 'слов не дал'})` : `Vosk, ${heard.words.length} шт.`}; диктор: ${dictor.words.length} слов, RMS ${dictor.rms?.toFixed(3) ?? '—'}` })
    setPhase('idle'); setStatus('')
  }

  function example(student) {
    const full = { ...student, url: silentWavUrl(student.durationMs) }
    const measure = measureTake({ dictor: DICTOR, student: full, chunks: CHUNKS })
    show({ dictor: fakeDictor(), student: full, measure, note: noteFor(measure, CHUNKS), info: 'пример: подставные тайминги, звук записи — тишина' })
  }

  const busy = phase !== 'idle'
  return (
    <section className="aspBlock" data-testid="mirror-demo-block">
      <h3 className="aspH">Зеркало (демо): «Дубль и зеркало»</h3>
      <p className="aspHint">Фраза «{PHRASE}»: запись дубля 4 с, Vosk даёт слова с таймингами, диктор — куски библиотеки слов. Запись нигде не сохраняется. Vosk: {vosk.status}. Временный блок.</p>
      <div className="aspRow">
        <button type="button" className="aspSay" onClick={record} disabled={busy} data-testid="mirror-demo-record">Записать дубль</button>
        <button type="button" className="aspChip" onClick={stop} disabled={phase !== 'recording'} data-testid="mirror-demo-stop">Стоп</button>
      </div>
      <div className="aspRow">
        <span className="aspHint">Примеры без микрофона:</span>
        <button type="button" className="aspChip" onClick={() => example(STUDENT_CLEAN)} disabled={busy} data-testid="mirror-demo-clean">Чисто</button>
        <button type="button" className="aspChip" onClick={() => example(STUDENT_MISSING)} disabled={busy} data-testid="mirror-demo-missing">Пропуск</button>
        <button type="button" className="aspChip" onClick={() => example(STUDENT_PAUSE)} disabled={busy} data-testid="mirror-demo-pause">Долгая пауза</button>
      </div>
      {status && <p className="aspHint" role="status">{status}</p>}
      {shown && (
        <>
          <div className="wlMirDemoFrame">
            <WordLaneMirror dictor={shown.dictor} student={shown.student} chunks={CHUNKS} measure={shown.measure} note={shown.note} onDone={() => show(null)} />
          </div>
          <p className="aspHint" data-testid="mirror-demo-info">{shown.info}{shown.measure ? ` · измерения: ${JSON.stringify({ tempo: shown.measure.tempo, missing: shown.measure.missing, extra: shown.measure.extra, orderOk: shown.measure.orderOk, pauses: shown.measure.pauses, loud: shown.measure.loud })}` : ''}</p>
        </>
      )}
    </section>
  )
}
