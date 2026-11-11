import { useState } from 'react'
import { REPS, parseWords } from './voiceSetPlan.js'
import { mb } from './voiceSetExport.js'
import { PART_MAX } from './voiceSetManifest.js'

// Первый вид «Записи набора»: начатый набор («Продолжить набор (сделано 120 из 255)» / «Собрать архив» / «Начать заново») либо настройки нового — слова через запятую, повторов 1 / 2 / 3,
// «ещё раз на вытянутой руке» — и «Начать запись» (микрофон открывается из этого нажатия). Оценка: сколько клипов, минут и мегабайт. Состояние — useVoiceSet.
const MIC_NOTE = { denied: 'Нет доступа к микрофону — разреши его для сайта в настройках и нажми ещё раз', unavailable: 'Микрофон недоступен', nostream: 'Микрофон не отдал поток — нажми ещё раз' }
const mins = ms => Math.max(1, Math.round(ms / 60000))
const when = iso => { try { return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) } catch { return '' } }

export default function VoiceSetSetup({ v }) {
  const [sure, setSure] = useState(false)
  const { saved, info, stats, prefs, settings } = v
  const parts = Math.max(1, Math.ceil(stats.bytes / (PART_MAX - 524288)))
  const size = `${stats.count} клипов · ≈ ${mins(stats.totalMs)} мин записи · архив ≈ ${mb(stats.bytes)}${parts > 1 ? ` (${parts} части)` : ''}`
  const busy = v.mic === 'asking'
  return (
    <div className="vsBody" data-testid="vs-setup">
      {!v.ready && <p className="vsDim">Проверяю, есть ли начатый набор…</p>}
      {v.ready && !v.persistent && <p className="vsWarn">Хранилище браузера недоступно (частный доступ?) — набор не переживёт перезагрузку страницы.</p>}
      {v.ready && saved && (
        <div className="vsCard" data-testid="vs-saved">
          <b>Начатый набор от {when(saved.meta.createdAt)}</b>
          <p>Записано <b>{info.done}</b> из {info.total}{info.skipped ? `, пропущено ${info.skipped}` : ''} · {mb(info.bytes)}</p>
          <p className="vsDim">Слова: {settings.words.join(', ')} · повторов {settings.reps}{settings.far ? ' · + на вытянутой руке' : ''}</p>
          {info.next != null && <button type="button" className="vsBig" disabled={busy} onClick={() => v.begin(false)} data-testid="vs-resume">▶ Продолжить набор (сделано {info.done} из {info.total})</button>}
          <button type="button" className="vsBtn" disabled={!info.done} onClick={v.toDone} data-testid="vs-to-done">📦 Собрать архив</button>
          <button type="button" className="vsBtn vsBtn--danger" onClick={() => (sure ? (setSure(false), v.remove()) : setSure(true))} data-testid="vs-restart">{sure ? 'Точно стереть записанное? Нажми ещё раз' : 'Начать заново (стереть набор)'}</button>
        </div>
      )}
      {v.ready && !saved && (
        <>
          <label className="vsLabel" htmlFor="vs-words">Слова через запятую</label>
          <textarea id="vs-words" className="vsWords" rows={4} value={prefs.words} onChange={e => v.setPrefs({ words: e.target.value })} spellCheck={false} autoCapitalize="off" autoCorrect="off" data-testid="vs-words" />
          <p className="vsDim">Слов: {parseWords(prefs.words).length}. Для каждого — пять видов: целиком, тихо, быстро, без последнего звука, только начало.</p>
          <div className="vsRow">
            <span className="vsLabel">Повторов на вид</span>
            <span className="psSeg" role="group" data-testid="vs-reps">{REPS.map(n => <button key={n} type="button" className="psSegBtn vsSegBtn" data-on={prefs.reps === n ? '1' : undefined} aria-pressed={prefs.reps === n} onClick={() => v.setPrefs({ reps: n })} data-testid={`vs-reps-${n}`}>{n}</button>)}</span>
          </div>
          <label className="vsCheck"><input type="checkbox" checked={prefs.far} onChange={e => v.setPrefs({ far: e.target.checked })} data-testid="vs-far" /> ещё раз на вытянутой руке (целиком и без последнего звука)</label>
          <p className="vsSize" data-testid="vs-size">{size}</p>
          <p className="vsDim">Плюс тишина и фон по 20 с, кашель, «э-э», стук и три фразы. Держи телефон как в игре. Говори, когда побежит полоса; стенд сам переходит дальше и не издаёт звуков.{v.wakeOk ? '' : ' Экран может погаснуть — касайся его иногда.'}</p>
          <button type="button" className="vsBig" disabled={busy} onClick={() => v.begin(true)} data-testid="vs-start">{busy ? 'Открываю микрофон…' : '🎙 Начать запись'}</button>
        </>
      )}
      {v.mic && !busy && <p className="vsWarn" data-testid="vs-mic-note">{MIC_NOTE[v.mic] ?? v.mic}</p>}
    </div>
  )
}
