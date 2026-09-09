import { useEffect, useRef, useState } from 'react'
import { Bug, GripVertical, MapPin, Pause, Play, Rewind, FastForward, Download, X, Trash2 } from 'lucide-react'
import { snapshotElement } from './debugSelector.js'
import { downloadReport } from './debugReport.js'
import { supabase } from '../../shared/api/supabase.js'
import { pauseAll, playAll, stepAll } from './debugMedia.js'
import { useDraggablePosition } from './useDraggablePosition.js'
import { onDebugToolbarOpen } from './debugToolbarState.js'
import { onPlayerStepChange } from './debugPlayerStep.js'
import PlayerStepRow from './PlayerStepRow.jsx'

// Видео проекта рендерится в 30fps (tools/prepare-video.ps1) — один кадр
// это ~33мс, не 16 (16 — половина кадра при 30fps, браузер часто просто не
// перерисовывает такой маленький шаг, и кнопка выглядит "нерабочей")
const FRAME_MS = 33
const JUMP_MS = 100

// Плавающий дев-тулбар для покадровой отладки визуальных багов: пауза/шаг
// всего, что движется на странице (CSS-анимации + <video>/<audio> — см.
// debugMedia.js), плюс отметка проблемного места кликом с комментарием.
// Подключается только через mountDebugTools.jsx (dev-only, см. App.jsx);
// дополнительно открывается кнопкой 🐞 в шапке урока (PlayerTopBar.jsx).
export default function DebugToolbar() {
  const [open, setOpen] = useState(false)
  const [paused, setPaused] = useState(false)
  const [commentMode, setCommentMode] = useState(false)
  const [comments, setComments] = useState([])
  const [pending, setPending] = useState(null)
  const [authEmail, setAuthEmail] = useState(null)
  const [playerStep, setPlayerStep] = useState(null)
  const panelRef = useRef(null)
  const { style: panelStyle, dragHandleProps } = useDraggablePosition(panelRef)

  useEffect(() => onDebugToolbarOpen(() => setOpen(true)), [])
  useEffect(() => onPlayerStepChange(setPlayerStep), [])

  // Кнопка "назад" в PlayerStepRow сама ставит сценарий на паузу изнутри
  // (см. usePlayerStepControl.js:back), в обход этой кнопки — без этого
  // иконка сверху расходилась бы с реальностью: сценарий уже стоит, а тут
  // всё ещё "пауза". Вместо лишнего useEffect с setState — просто выводим
  // отображаемое "на паузе" из обоих источников сразу при рендере
  const displayPaused = paused || !!playerStep?.frozen

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setAuthEmail(session?.user?.email ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setAuthEmail(session?.user?.email ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!commentMode) return
    const onClick = e => {
      // Клики по самому тулбару/попапу — пропускаем как обычно, иначе
      // кнопка "сохранить" в попапе комментария перехватывалась бы этим же
      // слушателем раньше своего onClick (тот же capture-фаза документа)
      if (e.target.closest('.dbgToolbar, .dbgToolbarFab, .dbgCommentPopover')) return
      e.preventDefault()
      e.stopPropagation()
      setPending({ x: e.clientX, y: e.clientY, el: e.target })
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [commentMode])

  // Один тумблер держит в синхроне и сырое время (видео/CSS/переходы), и сам
  // сценарий урока, если он сейчас открыт (usePlayerStepControl.js) — раньше
  // это были две независимые паузы (в этом ряду и в PlayerStepRow), и жать
  // приходилось обе по отдельности, а они легко расходились
  function syncPlayerStep(next) {
    if (playerStep && playerStep.frozen !== next) playerStep.togglePause()
  }

  function togglePause() {
    // От displayPaused, не от паузы «нашей кнопки»: сценарий мог замереть
    // сам через "назад" в PlayerStepRow — тогда следующее нажатие здесь
    // должно ОТПУСКАТЬ, а не пытаться поставить на паузу второй раз
    const next = !displayPaused
    if (next) pauseAll(); else playAll()
    setPaused(next)
    syncPlayerStep(next)
  }

  function step(delta) {
    stepAll(delta)
    setPaused(true)
    syncPlayerStep(true)
    // Время двигаем целиком: не только видео/CSS, но и отсчёт самого сценария.
    // Иначе пойманный «печатает…» (у него анимация infinite) крутился бы
    // вечно — сколько ни жми «вперёд», следующее сообщение не приходило
    playerStep?.stepTime?.(delta)
  }

  function saveComment(text) {
    if (!pending) return
    setComments(list => [...list, {
      id: Date.now(),
      text,
      atMs: Math.round(performance.now()),
      target: snapshotElement(pending.el),
    }])
    setPending(null)
    setCommentMode(false)
  }

  if (!open) {
    return (
      <button className="dbgToolbarFab" onClick={() => setOpen(true)} title="Дебаг-инструменты" aria-label="Дебаг-инструменты">
        <Bug size={18} />
      </button>
    )
  }

  return (
    <div className="dbgToolbar" ref={panelRef} style={panelStyle}>
      <div className="dbgToolbarHandle" {...dragHandleProps} title="Потяни, чтобы передвинуть">
        <GripVertical size={14} />
        <span className="dbgToolbarHandleText">
          дебаг · {authEmail ? authEmail : 'гость'}
        </span>
        <button className="dbgToolbarClose" onClick={() => setOpen(false)} aria-label="Свернуть"><X size={14} /></button>
      </div>

      <div
        className="dbgToolbarRow"
        title="Пауза держит и ловит: замирает всё текущее + любая новая анимация/видео/переход, что стартует, пока не отпустишь — не нужно ловить момент вручную"
      >
        <button onClick={() => step(-JUMP_MS)} title={`-${JUMP_MS}мс`}><Rewind size={15} /></button>
        <button onClick={() => step(-FRAME_MS)} title={`-1 кадр (${FRAME_MS}мс)`}><Rewind size={13} />1</button>
        <button className="dbgToolbarPauseBtn" onClick={togglePause} title={displayPaused ? 'Продолжить (и видео, и сценарий урока)' : 'Пауза (и видео, и сценарий урока — держит и новые анимации тоже)'}>
          {displayPaused ? <Play size={16} /> : <Pause size={16} />}
        </button>
        <button onClick={() => step(FRAME_MS)} title={`+1 кадр (${FRAME_MS}мс)`}>1<FastForward size={13} /></button>
        <button onClick={() => step(JUMP_MS)} title={`+${JUMP_MS}мс`}><FastForward size={15} /></button>

        <span className="dbgToolbarDivider" />

        <button
          className={commentMode ? 'dbgToolbarMarkBtn dbgToolbarActive' : 'dbgToolbarMarkBtn'}
          onClick={() => setCommentMode(v => !v)}
          title={commentMode ? 'Кликни на проблемный элемент' : 'Отметить элемент комментарием'}
        >
          <MapPin size={15} />
          {comments.length > 0 && <span className="dbgToolbarBadge">{comments.length}</span>}
        </button>
        {comments.length > 0 && (
          <button onClick={() => setComments([])} title="Очистить комментарии"><Trash2 size={14} /></button>
        )}
        <button className="dbgToolbarGenerate" onClick={() => downloadReport(comments)} title="Сформировать дебаг-отчёт">
          <Download size={15} />
        </button>
      </div>

      <PlayerStepRow step={playerStep} />

      {pending && (
        <CommentPopover x={pending.x} y={pending.y} onSave={saveComment} onCancel={() => setPending(null)} />
      )}
    </div>
  )
}

function CommentPopover({ x, y, onSave, onCancel }) {
  const [text, setText] = useState('')
  const style = { left: Math.min(x, window.innerWidth - 260), top: Math.min(y, window.innerHeight - 140) }
  return (
    <div className="dbgCommentPopover" style={style}>
      <textarea
        autoFocus
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Что не так в этом месте?"
        onKeyDown={e => { if (e.key === 'Escape') onCancel() }}
      />
      <div className="dbgCommentPopoverRow">
        <button onClick={onCancel}>отмена</button>
        <button disabled={!text.trim()} onClick={() => onSave(text.trim())}>сохранить</button>
      </div>
    </div>
  )
}
