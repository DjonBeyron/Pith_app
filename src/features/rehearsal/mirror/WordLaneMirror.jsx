import { useMemo, useRef } from 'react'
import MirrorLane from './MirrorLane.jsx'
import { buildMirrorView } from './mirrorLane.js'
import { noteFor, FAIL_NOTE } from './mirrorNotes.js'
import { useMirrorPlayback } from './useMirrorPlayback.js'

// «Дубль и зеркало» (акт 5 репетиции): экран сравнения. Две полосы одна под другой — «Пит» (диктор) и «Ты» (дубль), пилюли кусков по таймингам на общей шкале; «Сравнить» играет диктора, потом дубль;
// под полосами — ОДНА заметка Пита (из note; нет — считается из measure) и «Дальше». Запись не получилась (student нет или без url) — только полоса диктора, заметка «Запись не получилась…», «Дальше» доступна.
// dictor = { play(): Promise<void> (играет диктора, резолвится по концу), words: [{ word, start, end }] мс, durationMs, leadMs? (через сколько мс после play() зазвучит голос; по умолчанию 0) }
// student = { url (objectURL дубля), words (Vosk stats.words: секунды от старта записи; unit: 'ms' — уже мс), durationMs }. Запись никуда не уходит: звук играет из памяти, объект освобождает releaseTake.
export default function WordLaneMirror({ dictor, student, chunks, measure, note, onDone }) {
  const failed = !student?.url
  const view = useMemo(() => buildMirrorView({ dictor, student: failed ? null : student, chunks, measure }), [dictor, student, failed, chunks, measure])
  const audioRef = useRef(null)
  const { phase, lit, start } = useMirrorPlayback({ dictor, student, view, audioRef })
  const shown = failed ? FAIL_NOTE : (note?.text ? note : noteFor(measure, chunks))
  const canPlay = !!dictor?.play || !failed
  return (
    <div className="wlMirror" data-testid="wl-mirror" data-phase={phase} data-fail={failed || undefined}>
      <MirrorLane who="Пит" side="dictor" lane={{ ...view.dictor, lit: lit.d }} />
      {view.student && <MirrorLane who="Ты" side="student" lane={{ ...view.student, lit: lit.s }} />}
      {canPlay && <button type="button" className="wlMirBtn" onClick={start} disabled={phase !== 'idle'} data-testid="wl-mirror-compare">{phase !== 'idle' ? '…' : failed ? 'Послушать' : 'Сравнить'}</button>}
      <p className="wlMirNote" data-key={shown.key} data-testid="wl-mirror-note">{shown.text}</p>
      <button type="button" className="wlMirBtn wlMirBtn--main" onClick={onDone} data-testid="wl-mirror-done">Дальше</button>
      {!failed && <audio ref={audioRef} src={student.url} preload="auto" />}
    </div>
  )
}
