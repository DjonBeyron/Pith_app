import { useState, useEffect } from 'react'
import WordLaneCommentQuick from './WordLaneCommentQuick.jsx'
import { screenLine } from '../../../rehearsal/polish/commentSnapshot.js'
import { snapshotSettings } from '../../../rehearsal/polish/commentSettings.js'
import { makeComment, addComment, countComments, MAX_COMMENTS } from '../../../rehearsal/polish/rehearsalComments.js'

// Оверлей комментария к этапу репетиции («Шлифовка репетиции»): игра уже на паузе (f.pause('comment') из WordLaneCommentButton), HUD не открывается. Плотная подложка на весь экран (position: fixed, поверх кота и всего остального,
// как у WordLanePause), заголовок «Комментарий к этапу: акт / стадия», поле текста, «что на экране» (снимок в момент тапа — commentSnapshot.js), быстрые переключатели режимов (WordLaneCommentQuick — как в HUD), кнопки.
// «Сохранить и продолжить» — жест: pause.resume() (useWordLanePause) открывает микрофон и звук из тапа, ступень идёт сначала; пока микрофон открывается, оверлей остаётся, закрывается когда игра снова идёт.
// «Сохранить и выйти» — f.finish. Комментарий хранится в localStorage по этапу (rehearsalComments.js): текст, t (мс от старта игры до тапа), снимок экрана и настроек, что менял в окне, последние строки журнала игры.
const safeDump = dbg => { try { return dbg.dump() } catch { return null } }

export default function WordLaneComment({ f, pause, comment, rootRef, setTapMode = null, onClose }) {
  const { snap, at } = comment
  const act = snap.stage.act
  const [text, setText] = useState('')
  const [changes, setChanges] = useState([])
  const [error, setError] = useState('')
  const [resuming, setResuming] = useState(false)
  const [count, setCount] = useState(() => countComments(act))
  const [saved, setSaved] = useState(false) // уже записан (микрофон не открылся и человек нажал «Продолжить» ещё раз — второй копии не будет)
  const settings = comment.settings ?? snapshotSettings() // состояние в момент тапа (до паузы); нет его — по текущему
  const waiting = resuming && !pause.problem
  const canSave = !!text.trim() || changes.length > 0

  useEffect(() => { if (resuming && !f.paused) onClose() }, [resuming, f.paused, onClose]) // игра снова идёт (микрофон открылся, ступень сначала) — окно закрываем

  const onSetting = ch => { setChanges(list => [...list, { ...ch, t: Math.max(0, Date.now() - at) }]); f.dbg.event('comment-setting', { key: ch.key, from: ch.from, to: ch.to }) }
  /** Записать комментарий; false — хранилище браузера не приняло запись */
  function save() {
    if (saved) return true
    const dump = safeDump(f.dbg)
    const t = dump?.startedAtMs != null ? at - dump.startedAtMs : 0
    const res = addComment(act, makeComment({ text, snap, settings, changes, t, dump }))
    f.dbg.event('comment-save', { act, len: text.trim().length, changes: changes.length, ok: res.ok })
    if (!res.ok) { setError('Не получилось сохранить: браузер не принимает запись в хранилище.'); return false }
    setCount(res.count); setSaved(true); setError('')
    return true
  }
  function proceed() { // «Продолжить»: на паузе — жест (микрофон и звук из тапа), на финале пауза не ставилась — просто закрыть
    if (!f.paused) { onClose(); return }
    setResuming(true); pause.resume()
  }
  const saveAndGo = () => { if (save()) proceed() }
  const saveAndExit = () => { if (save()) { onClose(); f.finish() } }

  return (
    <div className="wlCmtBack" data-testid="wl-cmt-back">
      <div className="wlCmt" role="dialog" aria-label="Комментарий к этапу" data-testid="wl-cmt">
        <h2 className="wlCmtTitle" data-testid="wl-cmt-title">Комментарий к этапу: {snap.stage.actTitle} / {snap.stage.sid || snap.stage.name}</h2>
        <textarea className="wlCmtText" rows={4} value={text} onChange={e => setText(e.target.value)} placeholder="Что не так, что поправить" aria-label="Комментарий" data-testid="wl-cmt-text" />
        <div className="wlCmtMeta" data-testid="wl-cmt-count">Сохранено на этом этапе: {count} из {MAX_COMMENTS}{count >= MAX_COMMENTS ? ' (самый старый будет удалён)' : ''}</div>
        <details className="wlCmtScreen" open>
          <summary>Что на экране</summary>
          <ul data-testid="wl-cmt-screen">{screenLine(snap).split(' · ').map((x, i) => <li key={i}>{x}</li>)}</ul>
          <div className="wlCmtMeta" data-testid="wl-cmt-info">v{snap.version} · аудиосессия: <b>{settings.audioSession}</b> · дорожка: <b>{settings.mic}</b> · Vosk: <b>{settings.vosk}</b></div>
        </details>
        <div className="wlCmtHead">Режимы <em>вступают в силу после «Продолжить»</em></div>
        <WordLaneCommentQuick rootRef={rootRef} setTapMode={setTapMode} onChange={onSetting} />
        {changes.length > 0 && <div className="wlCmtMeta" data-testid="wl-cmt-changes">Менял: {changes.map(c => `${c.label} → ${c.to}`).join('; ')}</div>}
        {(error || pause.problem) && <p className="wlCmtErr" role="alert" data-testid="wl-cmt-error">{error || pause.problem}</p>}
        <div className="wlCmtBtns">
          <button type="button" className="wlFailBtn wlFailBtn--main" onClick={saveAndGo} disabled={!canSave || waiting} data-no-unlock="" data-testid="wl-cmt-save">{waiting ? '…' : 'Сохранить и продолжить'}</button>
          <button type="button" className="wlFailBtn" onClick={saveAndExit} disabled={!canSave || waiting} data-no-unlock="" data-testid="wl-cmt-exit">Сохранить и выйти</button>
          <button type="button" className="wlCmtSkip" onClick={proceed} disabled={waiting} data-no-unlock="" data-testid="wl-cmt-skip">Продолжить без комментария</button>
        </div>
      </div>
    </div>
  )
}
