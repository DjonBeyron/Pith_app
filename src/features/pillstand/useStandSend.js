import { useState, useCallback, useMemo } from 'react'
import { gameJournal } from '../../shared/lib/gameJournal.js'
import { SAVE_HOW, saveDebugFile } from '../player/modules/rotate-phone/wordLaneDebugExport.js'
import { buildPack } from './pillStandReport.js'
import { emptyForm, spanKind, markAt } from './pillStandSendForm.js'
import { sendPack } from './standSend.js'
import { copyText } from './standExport.js'

// Окно «📤 Отправить» стенда пилюль (CONCEPT_PILLSTAND.md, «Отправка по теме»): открыто ли и откуда (живой экран — «сейчас» = trace.now(); плеер — кадр), форма (держится между открытиями — черновик
// комментария не теряется), метки кадров (по шкале текущей трассы: после «Сброс» старые не показываются), итог отправки, файл звука для второго нажатия. Данные для отчёта: трасса (в плеере после «Сброс» —
// события записи), кадры и звук записи, журнал игры (gameJournal: строки с меткой performance.now → мс сессии), A–B плеера. → состояние и команды для PillStandSend.jsx.
const mb = n => `${(n / 1048576).toFixed(n > 1048576 ? 1 : 2).replace('.', ',')} МБ`

export default function useStandSend({ trace, meta, rec = null, ab = null }) {
  const [ctx, setCtx] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [marks, setMarks] = useState({ t0: null, list: [] })
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [later, setLater] = useState(null)
  const t0 = trace.started()
  const list = useMemo(() => (marks.t0 === t0 ? marks.list : []), [marks, t0])

  const open = useCallback((c = {}) => { setCtx({ from: c.from ?? 'live', at: c.at ?? trace.now(), frame: c.frame ?? null }); setNote(''); setLater(null) }, [trace])
  const close = useCallback(() => setCtx(null), [])
  const addMark = useCallback(() => {
    if (!ctx) return
    const m = markAt(ctx.at, rec?.frames ?? [], ctx.frame)
    setMarks(old => ({ t0: trace.started(), list: [...(old.t0 === trace.started() ? old.list : []), m].sort((a, b) => a.t - b.t) }))
    trace.push('mark-add', { at: m.t, i: m.i })
  }, [ctx, rec, trace])
  const unmark = useCallback(i => setMarks(old => ({ ...old, list: old.list.filter((_, k) => k !== i) })), [])

  const build = useCallback(() => {
    const evs = trace.events()
    const events = rec?.events?.length && !evs.includes(rec.events.at(-1)) ? rec.events : evs // «Сброс» после записи: в трассе её уже нет — берём события записи
    return buildPack({
      topics: form.topics, span: { kind: spanKind(form, ab), sec: form.sec }, ab, at: ctx?.at ?? trace.now(), comment: form.comment, marks: list, meta: meta(),
      events, frames: rec?.frames ?? [], audio: rec?.audio ?? null, sound: form.sound, journal: { lines: gameJournal.lines(), t0abs: trace.started(), dropped: gameJournal.dropped() },
    })
  }, [trace, rec, form, ab, ctx, list, meta])

  const send = useCallback(async () => {
    setBusy(true)
    try {
      const p = build()
      const got = await sendPack(p, rec?.audio ?? null)
      setLater(got.later)
      setNote(`${SAVE_HOW[got.how] ?? got.how}: ${p.name}, ${mb(p.bytes)}${got.audioHow ? ` + звук ${p.audioName}` : ''}${got.later ? ' — звук: нажмите «📎 Звук»' : ''}${p.warn ? ` · ⚠ ${p.warn}` : ''}`)
      trace.push('export', { what: 'отправка', topics: form.topics, span: p.span.kind, how: got.how, bytes: p.bytes, audio: got.audioHow ?? (got.later ? 'вторым нажатием' : null) })
      if (globalThis.__pillStand?.trace === trace) globalThis.__pillStand.lastPack = { name: p.name, text: p.text, audioName: p.audioName } // автопроверка отправки
    } catch (e) { setNote(`Не получилось собрать отчёт: ${e?.message ?? e}`) } finally { setBusy(false) }
  }, [build, rec, trace, form.topics])

  const copy = useCallback(async () => {
    try {
      const p = build()
      const ok = await copyText(p.copy)
      setNote(ok ? `Отчёт скопирован текстом: ${p.copy.split('\n').length} строк${p.copy !== p.text.split('\n---JSON---')[0] ? ' (без таблиц кадров — слишком длинный)' : ''}` : 'Не получилось скопировать — используйте «Отправить файлом»')
      trace.push('export', { what: 'отправка текстом', topics: form.topics, ok, chars: p.copy.length })
    } catch (e) { setNote(`Не получилось собрать отчёт: ${e?.message ?? e}`) }
  }, [build, trace, form.topics])

  const sendAudio = useCallback(async () => {
    if (!later) return
    const how = await saveDebugFile(later)
    setNote(`${SAVE_HOW[how] ?? how}: ${later.name}`)
    if (how !== 'cancelled') setLater(null)
  }, [later])

  return { ctx, open, close, form, setForm, marks: list, addMark, unmark, note, busy, later, send, copy, sendAudio }
}
