import { useMemo, useRef, useState, useEffect } from 'react'
import { playSpans } from './mirrorSpans.js'
import { noteFor, FAIL_NOTE } from './mirrorNotes.js'
import { useMirrorPlayback } from './useMirrorPlayback.js'
import { DECEL_MS } from '../../player/modules/rotate-phone/wordLaneConveyor.js'

// «Дубль и зеркало» на дорожках (v3.3.86, акт 5): всё, что стадия mirror показывает сверх самих дорожек. Пилюли сравнения (две ленты Пит / ты) рисует движок пилюль — раскладка mirrorCompare.js, сцена
// wordLaneMirrorScene.js; здесь: проигрывание, заметка Пита и кнопки. Дорожки к этому моменту уже встали сами (конвейер тормозит, когда пилюль не осталось), Пит договорил реплику (RehearsalActs ждёт rh.quiet).
//  • проигрывание само начинается через AUTO_MS после остановки дорожек (DECEL_MS от начала стадии): сначала диктор, потом дубль (useMirrorPlayback); кнопка «Сравнить» / «Ещё раз» играет заново.
//    Пока звучит кусок, его пилюля на дорожках светится (sceneApi.current.lit: подсветка пилюли и вспышка дорожки);
//  • заметка Пита — ОДНА (note; нет — считается из measure) — подпись над дорожками на месте ярлыков (.rhNote), появляется, когда прослушали (запись не получилась — сразу); «Дальше» ведёт в итог;
//  • запись не получилась (student нет или без url) — только лента Пита, «Послушать» и заметка о сбое; «Дальше» доступна всегда.
// mirror = { dictor, student, measure, note }: dictor = { play(): Promise<void>, words: [{ word, start, end }] мс, durationMs, leadMs? }; student = { url (objectURL), blob, words, durationMs, unit }; since — старт стадии (performance.now()).
export const AUTO_MS = 400 // после остановки дорожек — столько мс тишины до голоса Пита

export default function MirrorCompare({ mirror, chunks, sceneApi = null, since = 0, onDone }) {
  const { dictor, student, measure, note } = mirror
  const failed = !student?.url
  const spans = useMemo(() => playSpans({ dictor, student: failed ? null : student, chunks }), [dictor, student, failed, chunks])
  const audioRef = useRef(null)
  const { phase, lit, start, problem } = useMirrorPlayback({ dictor, student, spans, audioRef })
  const canPlay = !!dictor?.play || !failed
  const [heard, setHeard] = useState(false) // сравнение прозвучало хотя бы раз
  const ran = useRef(false)
  const startRef = useRef(start)
  useEffect(() => { startRef.current = start })
  useEffect(() => { if (phase !== 'idle') ran.current = true; else if (ran.current) setHeard(true) }, [phase])
  useEffect(() => { sceneApi?.current?.lit?.(lit.d >= 0 ? 'pit' : lit.s >= 0 ? 'you' : null, lit.d >= 0 ? lit.d : lit.s) }, [lit, sceneApi]) // звучащий кусок светится на дорожках
  useEffect(() => { // дорожки встали (торможение DECEL_MS от начала стадии) — ещё AUTO_MS тишины, и играем
    const t = setTimeout(() => startRef.current(), Math.max(0, DECEL_MS - (performance.now() - since)) + AUTO_MS)
    return () => clearTimeout(t)
  }, [since])

  const shown = problem ? { key: 'error', text: problem } : failed ? FAIL_NOTE : (note?.text ? note : noteFor(measure, chunks))
  const label = phase !== 'idle' ? '…' : failed ? 'Послушать' : heard ? 'Ещё раз' : 'Сравнить'
  return (
    <>
      {(heard || failed || !canPlay || problem) && <p className="rhNote" key={shown.key} data-key={shown.key} data-testid="rh-mirror-note" role={problem ? 'alert' : undefined}>{shown.text}</p>}
      <div className="rhCmpBar" data-testid="rh-mirror" data-phase={phase} data-fail={failed || undefined}>
        {canPlay && <button type="button" className="rhCmpBtn" onClick={start} disabled={phase !== 'idle'} data-testid="rh-mirror-compare">{label}</button>}
        <button type="button" className="rhCmpBtn rhCmpBtn--main" onClick={onDone} data-testid="rh-mirror-done">Дальше</button>
      </div>
      {!failed && <audio ref={audioRef} src={student.url} preload="auto" />}
    </>
  )
}
