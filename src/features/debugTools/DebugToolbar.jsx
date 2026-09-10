// Стили тулбара едут вместе с ним, а не через index.css: так они попадают
// только в dev-чанк и не занимают место в прод-сборке
import '../../styles/debug-toolbar.css'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { GripVertical, X } from 'lucide-react'
import TimeControlRow from './TimeControlRow.jsx'
import CaptureRow from './CaptureRow.jsx'
import { pLog } from '../../shared/lib/debug.js'
import { snapshotElement } from './debugSelector.js'
import { saveReport } from './debugReport.js'
import { startRecording, stopRecording, onRecordingChange, markInRecording } from './debugRecorder.js'
import { supabase } from '../../shared/api/supabase.js'
import { pauseAll, playAll, stepAll } from './debugMedia.js'
import { pauseClock, resumeClock, tickClock, isClockInstalled, isClockRunning, subscribeClock } from './debugClock.js'
import { decideToggle, decideFollowScenario, decideStep } from './debugStepLogic.js'
import { useDraggablePosition } from './useDraggablePosition.js'
import { onDebugToolbarOpen } from './debugToolbarState.js'
import { onPlayerStepChange } from './debugPlayerStep.js'
import { runJitterProbe } from './debugJitter.js'
import PlayerStepRow from './PlayerStepRow.jsx'

// Видео проекта рендерится в 30fps (tools/prepare-video.ps1) — один кадр
// это ~33мс, не 16 (16 — половина кадра при 30fps, браузер часто просто не
// перерисовывает такой маленький шаг, и кнопка выглядит "нерабочей")
const FRAME_MS = 33
const JUMP_MS = 100

// Перетаскиваемый дев-тулбар для покадровой отладки визуальных багов: пауза и
// шаг всего, что движется (JS-время — debugClock.js, браузерное — debugMedia.js),
// отметка проблемного места комментарием, запись сессии.
// Монтируется через mountDebugTools.jsx за общим выключателем DEBUG_TOOLS_ON
// (shared/lib/debugToolsEnabled.js). Открывается ТОЛЬКО кнопкой 🐞 в шапке
// урока (PlayerTopBar.jsx) — своей плавающей кнопки у него больше нет.
export default function DebugToolbar() {
  const [open, setOpen] = useState(false)
  const [paused, setPaused] = useState(false)
  const [commentMode, setCommentMode] = useState(false)
  const [comments, setComments] = useState([])
  const [pending, setPending] = useState(null)
  const [authEmail, setAuthEmail] = useState(null)
  const [playerStep, setPlayerStep] = useState(null)
  const [recording, setRecording] = useState(false)
  // Идёт ли замер дрожания ленты (debugJitter.js) — на время замера кнопка
  // блокируется: экран трогать нельзя, иначе меряем не то
  const [jitter, setJitter] = useState(false)
  // Куда лёг последний файл — единственный ответ на вопрос «а сохранилось-то
  // куда?»: путь показывается прямо в ручке тулбара, его же называют Claude
  const [savedPath, setSavedPath] = useState(null)
  const panelRef = useRef(null)
  const { style: panelStyle, dragHandleProps } = useDraggablePosition(panelRef)

  useEffect(() => onDebugToolbarOpen(() => setOpen(true)), [])
  useEffect(() => onPlayerStepChange(setPlayerStep), [])
  useEffect(() => onRecordingChange(setRecording), [])

  // Сценарий умеет замирать и оживать САМ, минуя тулбар: «назад» в
  // PlayerStepRow внутри себя зовёт state.pause(), «вперёд» — unfreeze().
  // Без этой сцепки часы оставались в прежнем положении, и получалось два
  // независимых времени: сценарий стоит, а анимации и медиа едут дальше (или
  // наоборот). Именно из-за этого шаг переставал быть одним таймлайном.
  // Следим за paused, а не за frozen: сценарий стоит именно по нему
  const frozen = playerStep?.paused
  // Реагировать надо на ФАКТ смены, а не на текущее значение.
  // frozen приходит из другого компонента и обновляется на его рендере, то
  // есть с задержкой: сразу после «продолжить» часы уже идут, а frozen ещё
  // старый — эффект по значению видел «сценарий заморожен, а часы бегут» и
  // тут же их останавливал, отменяя нажатие. Гонка, из-за которой кнопка
  // «продолжить» не работала.
  const prevFrozen = useRef(frozen)
  useEffect(() => {
    const changed = prevFrozen.current !== frozen
    prevFrozen.current = frozen
    if (!changed) return
    const what = decideFollowScenario({ frozen, clockInstalled: isClockInstalled(), clockRunning: isClockRunning() })
    // Никакого setState здесь: кнопка и так следит за часами через
    // useSyncExternalStore, а лишний стейт снова развёл бы их между собой
    if (what === 'pause')  { pauseClock(); pauseAll() }
    if (what === 'resume') { resumeClock(); playAll() }
  }, [frozen])

  // Кнопка "назад" в PlayerStepRow сама ставит сценарий на паузу изнутри
  // (см. usePlayerStepControl.js:back), в обход этой кнопки — без этого
  // иконка сверху расходилась бы с реальностью: сценарий уже стоит, а тут
  // всё ещё "пауза". Вместо лишнего useEffect с setState — просто выводим
  // отображаемое "на паузе" из обоих источников сразу при рендере
  // Часы — источник правды об отображении паузы, а не React-стейт: сценарий
  // умеет останавливать время сам («назад» в PlayerStepRow), и своя копия
  // неизбежно от них отставала — кнопка показывала «идёт», когда всё стоит.
  // useSyncExternalStore подписывает рендер прямо на часы. paused/frozen
  // остаются запасным путём, когда часов нет (прод-превью).
  const clockRunning = useSyncExternalStore(subscribeClock, isClockRunning, () => true)
  const displayPaused = isClockInstalled() ? !clockRunning : (paused || !!playerStep?.frozen)

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
      if (e.target.closest('.dbgToolbar, .dbgCommentPopover')) return
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
    if (!playerStep) return
    // Сверяться надо с paused, а не с frozen: сценарий стоит именно по paused,
    // а frozen — лишь «молчит ли текущее сообщение». Шаг «вперёд» размораживает
    // одно и не трогает другое, и в состоянии «paused, но не frozen» проверка
    // по frozen решала, что синхронизировать нечего — сценарий залипал навсегда.
    // pause()/resume() выставляют оба флага явно, без переключателей
    if (next && !playerStep.paused) playerStep.pause?.()
    if (!next && playerStep.paused) playerStep.resume?.()
  }

  function togglePause() {
    // Решение принимают часы, а не React-стейт: рендер асинхронный, и пока он
    // не случился, замыкание кнопки держит устаревшее значение — нажатие тогда
    // делало ровно противоположное. Вся матрица состояний покрыта тестами,
    // см. debugStepLogic.test.js
    const next = decideToggle({
      clockInstalled: isClockInstalled(), clockRunning: isClockRunning(), displayPaused,
    }) === 'pause'
    // Часы держат JS-время (rAF, таймеры, silentClock), debugMedia — то, что
    // крутит сам браузер (CSS-анимации, <video>). Две разные среды, оба вызова
    if (next) { pauseClock(); pauseAll() } else { resumeClock(); playAll() }
    setPaused(next)
    syncPlayerStep(next)
  }

  function step(delta) {
    const plan = decideStep({ deltaMs: delta, clockInstalled: isClockInstalled() })
    if (plan.stepMedia) stepAll(delta)
    setPaused(true)
    syncPlayerStep(true)
    // Нужны ОБА механизма, и это не двойной шаг — они двигают разное.
    //
    // tickClock прогоняет живые setTimeout/rAF: анимации, полёты, беззвучные
    // часы таблицы. Но сценарий урока на паузе своих таймеров НЕ имеет —
    // useGraphPlayer.js:152 их уничтожает (`if (paused) { clearTimers() }`), а
    // остаток времени держит в pendingMsRef. Двигать часами там нечего, и
    // покадровый шаг упирался: время идёт, а следующее сообщение не приходит.
    // stepTime — единственный, кто вычитает из этого остатка.
    if (plan.tickClock) tickClock(delta)
    const moved = plan.stepScenario ? playerStep?.stepTime?.(delta) : undefined
    // Видно, дошёл ли шаг до сценария вообще: `stepTime=нет` означает, что
    // плеер не открыт или объект шага не долетел до тулбара, а `false` — что
    // сценарию сейчас нечего показывать (ничего не запланировано)
    pLog(`[dbg] шаг ${delta}мс | часы=${plan.tickClock ? 'да' : 'нет'}`
      + ` | сценарий=${playerStep?.stepTime ? (moved ? 'показал ноду' : 'ждёт') : 'нет'}`)
  }

  function saveComment(text) {
    if (!pending) return
    const comment = {
      id: Date.now(),
      text,
      atMs: Math.round(performance.now()),
      target: snapshotElement(pending.el),
    }
    setComments(list => [...list, comment])
    // Тот же комментарий — второй раз в ленту записи, если она идёт: тогда в
    // плеере видно не только что дёрнулось, но и в какой момент человек на это
    // указал (в отчёте он лежит отдельно, запись может и не вестись)
    markInRecording(comment)
    setPending(null)
    setCommentMode(false)
  }

  async function toggleRecording() {
    if (recording) {
      const res = await stopRecording({ url: location.href, comments })
      // Показываем выжимку, а не полную запись: именно её называют Claude —
      // полная лежит рядом под тем же именем и нужна плееру, не чтению
      if (res?.digestFile) setSavedPath(`${res.digestFile} · ${res.events} событий`)
    } else {
      setSavedPath(null)
      await startRecording()
    }
  }

  // Замер дрожания: пять секунд смотрим на ленту покадрово. Сводка сама
  // ложится в следующий отчёт (debugJitter.getJitterReport), поэтому дальше
  // достаточно нажать «сохранить»
  async function measureJitter() {
    setJitter(true)
    const res = await runJitterProbe(5)
    setJitter(false)
    setSavedPath(`дрожание: ${res.дрожат.length} из ${res.строк} строк — нажми «сохранить»`)
  }

  async function save() {
    const file = await saveReport(comments)
    setSavedPath(file || 'ушло в Downloads (dev-сервер не ответил)')
  }

  // Своей плавающей кнопки у тулбара нет: точка входа одна — 🐞 в шапке урока
  // (PlayerTopBar.jsx → openDebugToolbar). Две кнопки на одно действие путали,
  // а плавающая вдобавок висела поверх ленты и профиля, где дебажить нечего
  if (!open) return null

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
        <TimeControlRow
          frameMs={FRAME_MS} jumpMs={JUMP_MS}
          paused={displayPaused} onStep={step} onTogglePause={togglePause}
        />

        <CaptureRow
          commentMode={commentMode} comments={comments} recording={recording} jitter={jitter}
          onToggleCommentMode={() => setCommentMode(v => !v)}
          onClearComments={() => setComments([])}
          onToggleRecording={toggleRecording}
          onJitter={measureJitter}
          onSave={save}
        />
      </div>

      {savedPath && <div className="dbgToolbarSaved" title={savedPath}>{savedPath}</div>}

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
