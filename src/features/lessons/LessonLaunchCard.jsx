import { useState, useEffect, useRef } from 'react'
import { loadScript } from '../../shared/lib/lessonsApi.js'
import { getFilesByIds } from '../../shared/lib/filesApi.js'
import { getDefaultTeacher } from '../../shared/api/appSettingsApi.js'
import { resolveTeacher } from '../../shared/lib/teacherResolve.js'
import { usePlayerPreload } from '../player/usePlayerPreload.js'
import { preloadSounds, unlockAudio } from '../../shared/lib/sounds.js'
import { primeAudio } from '../../shared/lib/primedAudio.js'
import { motionNeedsAsk } from '../../shared/lib/motionPermission.js'
import LaunchMotionAsk from './LaunchMotionAsk.jsx'
import { useAdmin } from '../../app/AdminContext.jsx'
import RetakeDialog from './RetakeDialog.jsx'
import ExamIntroDialog from './ExamIntroDialog.jsx'
import LaunchCtaSlot from './LaunchCtaSlot.jsx'
import LaunchDebugPanel from './LaunchDebugPanel.jsx'
import LaunchSkeleton from './LaunchSkeleton.jsx'
import LaunchEnergyRow from './LaunchEnergyRow.jsx'
import { launchEnergyInfo } from './launchEnergy.js'
import { hasStatBindings } from '../player/useAnswerStats.js'
import { getLessonProgress, clearLessonProgress } from '../../shared/lib/lessonProgressApi.js'
import { getCompletedLessons } from '../../shared/lib/completedLessons.js'
import { extractFileIds, isWeakDevice } from './launchHelpers.js'
import useSmoothPct from './useSmoothPct.js'

const WARMUP_TARGET = 5

// retake=true (урок уже пройден): если в сценарии есть привязки «→ Урок»,
// вместо кнопки старта — выбор режима пересдачи (RetakeDialog).
// examIntro=true (финальный урок): вместо кнопки старта — интро экзамена
// (правила, 3 подсказки, ключ); имеет приоритет над retake.
// energyFree=true — сервер не спишет энергию (Старт/Финал модуля); клиенту
// нужно только для честной надписи о стоимости, решает всё равно сервер.
// allowResume=false — гонка (RaceRunner.jsx): там своя механика прохождения
// уроков цепочкой, «Продолжить» посреди гонки не имеет смысла.
export default function LessonLaunchCard({ lessonId, lessonTitle = '', retake = false, examIntro = false, energyFree = false, allowResume = true, onStart, onClose }) {
  const [lessonData, setLessonData] = useState(null)
  const [error, setError]           = useState(null)
  // Момент открытия карточки: по нему считается энергия. Ленивый инициализатор —
  // Date.now() импьюрный, а живой таймер тут не нужен, карточка живёт секунды
  const [openedAt] = useState(() => Date.now())
  // Растворение последней ячейки энергии при старте. Живёт здесь, а не в
  // предзагрузчике: сама строка энергии рисуется с первого кадра, ещё до него
  const [dissolving, setDissolving] = useState(false)
  // Не зависит от сценария — профиль уже в кэше, остальное пропсы
  const info = launchEnergyInfo({ retake, energyFree, openedAt })

  // Минимум 1.2с каркаса (LaunchSkeleton), даже если всё готово раньше:
  // без этого на лёгком уроке (файлов почти нет) кнопка «мигала» — успевала
  // побывать «Загрузка...» и тут же смениться на «Начать урок»/«Продолжить»
  // за доли секунды, читалось как дефект, а не как загрузка
  const [minTimeElapsed, setMinTimeElapsed] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setMinTimeElapsed(true), 1200)
    return () => clearTimeout(t)
  }, [])

  // Чекпойнт «Продолжить урок» — проверяем ПАРАЛЛЕЛЬНО с загрузкой сценария,
  // а не внутри уже открытого плеера (как раньше, ResumeLessonPopup.jsx):
  // решение «продолжить или заново» нужно ДО прогрева, чтобы он целился в
  // точку входа, а не всегда в начало урока (см. LaunchPreloader ниже).
  // undefined — ещё проверяем, null — нет чекпойнта (или не участвует).
  // Тот же гейт, что раньше был в useLessonResume.js: пересдача (retake) и
  // уже отмеченный как пройденный урок — «Продолжить» не предлагаем вовсе.
  // Ленивый инициализатор — та же синхронная (localStorage) проверка, что
  // и там, не побочный эффект
  const skipResumeCheck = !allowResume || retake || getCompletedLessons().has(lessonId)
  const mayResume = !skipResumeCheck
  const [resumeOffer, setResumeOffer] = useState(() => skipResumeCheck ? null : undefined)

  useEffect(() => {
    loadScript(lessonId)
      .then(async raw => {
        // Сервер не отдал урок — его сняли с публикации (или удалили), пока
        // приложение было открыто: RLS такой урок ученику не показывает.
        // Список на экране мог остаться старым, поэтому говорим прямо, а не
        // прячем это под «не удалось загрузить» (похоже на сбой сети)
        if (!raw) { setError('Этот урок сейчас закрыт'); return }
        const nodes = raw?.script?.nodes ?? []
        const ids   = extractFileIds(nodes)
        const files = ids.length ? await getFilesByIds(ids) : []
        // Учитель: свой у урока либо общий из app_settings (кэш на сессию)
        const teacher = resolveTeacher(raw?.script, await getDefaultTeacher())
        setLessonData({
          nodes,
          files,
          // Надпись в шапке чата: своя из настроек урока, иначе его название.
          // Отсюда её получают все три запуска — модуль, отдельный урок и
          // гонка: playerData у них общий, собирается здесь
          title:           (raw?.script?.chatTitle || '').trim() || raw?.title || '',
          // Название самого урока — на случай, когда его не передали пропсом
          // (запуск не из схемы модуля): иначе заголовок карточки был бы пуст
          name:            raw?.title ?? '',
          teacherName:     teacher.name,
          teacherLogo:     teacher.logo,
          teacherLogoCrop: teacher.crop,
          videoAutoSound:  raw?.script?.videoAutoSound ?? false,
          lessonXp:        raw?.script?.lessonXp ?? 0,
        })
      })
      .catch(() => setError('Не удалось загрузить урок'))
    if (!skipResumeCheck) {
      getLessonProgress(lessonId)
        .then(p => setResumeOffer(p?.nodeId ? p : null))
        .catch(() => setResumeOffer(null))
    }
  }, [lessonId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Готово к ПОКАЗУ — не к монтированию: ждём сценарий, чекпойнт И минимум
  // 1.2с каркаса разом, иначе карточка успевала показать «нет чекпойнта»
  // (узкую «Начать урок»), а через мгновение — резко расшириться под
  // «Продолжить», плюс на лёгком уроке кнопка «мигала» загрузкой. Ширина
  // меняется РОВНО один раз, вместе с самим переключением каркас→содержимое
  const ready = !!lessonData && resumeOffer !== undefined && minTimeElapsed

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div className="launchCard" style={{
        borderRadius: 16, padding: 32,
        // Шире, когда чекпойнт в принципе возможен (mayResume, известно
        // синхронно, до сети) — двум кнопкам и строке прогресса тесно в
        // обычных 420px без переноса текста. Раньше ширина зависела от
        // ready && resumeOffer — а это как раз МОМЕНТ раскрытия содержимого:
        // каркас всегда рисовался узким (420), и если чекпойнт находился,
        // карточка скакала на 460 РОВНО когда показывались кнопки. Теперь
        // и каркас, и содержимое смотрят на один и тот же mayResume — ширина
        // решена ещё до того, как есть что показывать, скакать нечему
        minWidth: 300, maxWidth: mayResume ? 460 : 420, width: '90%',
        display: 'flex', flexDirection: 'column', gap: 20,
        position: 'relative',
      }}>
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 12, right: 16,
            background: 'none', border: 'none', color: '#888',
            fontSize: 20, cursor: 'pointer', lineHeight: 1,
          }}
        >×</button>

        {error && <p style={{ color: '#ff7070', margin: 0 }}>{error}</p>}

        {!error && !ready && <LaunchSkeleton title={lessonTitle} info={info} mayResume={mayResume} />}

        {/* Монтируется, как только есть lessonData — НЕ ждёт ready: сама
            предзагрузка (usePlayerPreload внутри) должна стартовать раньше
            всех, а не терять минимум 1.2с впустую. Скрыт (не размонтирован)
            до ready — только чтобы не было видно ни его роста, ни мигания.
            display:contents, а не блок: блок-обёртка «съедала» flex-колонку
            карточки — дети стояли вплотную без gap:20, и содержимое было
            плотнее/ниже каркаса, который рендерится фрагментом прямо в ней */}
        {lessonData && (
          <div style={{ display: ready ? 'contents' : 'none' }}>
            <LaunchPreloader
              lessonData={lessonData}
              retakeChoice={retake && hasStatBindings(lessonData.nodes)}
              retake={retake}
              examIntro={examIntro}
              energyFree={energyFree}
              resumeOffer={resumeOffer}
              visible={ready}
              mayResume={mayResume}
              onRestartProgress={() => { clearLessonProgress(lessonId); setResumeOffer(null) }}
              title={lessonTitle}
              info={info}
              dissolving={dissolving}
              onDissolve={() => setDissolving(true)}
              onStart={onStart}
              onClose={onClose}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function LaunchPreloader({
  lessonData, title, info, dissolving, onDissolve, retakeChoice = false, examIntro = false,
  resumeOffer = null, mayResume = false, visible = false, onRestartProgress, onStart, onClose,
}) {
  // title приходит из схемы модуля и уже нарисован скелетоном — берём его, а не
  // lessonData.title: тот может оказаться своей надписью для шапки чата, и
  // заголовок карточки на полпути подменился бы
  const { nodes, files, title: chatTitle, name, teacherName, teacherLogo, teacherLogoCrop, videoAutoSound, lessonXp } = lessonData
  // Через контекст, а не useIsAdmin напрямую: иначе дебаг-панель предзагрузки
  // пережила бы «режим пользователя» (и это был лишний запрос getProfile)
  const { isAdmin } = useAdmin()

  // Энергия и стоимость посчитаны в LessonLaunchCard и уже показаны — здесь
  // только флаг, нужна ли анимация списания при старте
  const { payingCase } = info

  // Weak device → smaller in-memory buffer during lesson (2 past + 2 ahead vs 5 + 3)
  const weak       = isWeakDevice()
  const bufferSize = weak ? 3 : 5

  // Точка входа — начало урока по умолчанию, а если есть чекпойнт (resumeOffer)
  // — точка возобновления: прогрев (usePlayerPreload) целится именно туда,
  // а не всегда в начало (тот же приоритет по nodeIdx, что чинили в
  // самом плеере — см. PROJECT.md, «гейт предзагрузки не открывался до
  // точки возобновления»). Если студент всё же нажмёт «Начать заново» —
  // прогрев для начала урока НЕ был готов заранее, это осознанный компромисс:
  // «Продолжить» — основная, зелёная кнопка, более вероятный выбор
  const resumeEntryNode = resumeOffer?.nodeId ? nodes.find(n => n.id === resumeOffer.nodeId) : null
  const { blobMap, readyNodeIds, warmupNodeIds, warmupPct, initialized, debugItems, releaseBlobs } = usePlayerPreload(
    nodes, files, resumeEntryNode ? [resumeEntryNode] : [], { initialLookahead: WARMUP_TARGET, bufferSize }
  )

  // Start decoding UI sounds while lesson files are loading — no gesture needed for decode.
  // By the time the user taps "Start", AudioBuffers are ready and AudioContext just needs resume().
  useEffect(() => { preloadSounds() }, [])

  // Preload teacher logo separately (not part of the node graph)
  const logoBlobRef             = useRef(null) // holds blob URL so cleanup can revoke it
  const [, setLogoBlobUrl] = useState(null) // ре-рендер, когда лого докачалось
  const [logoReady,   setLogoReady]   = useState(!teacherLogo) // no logo → already "ready"

  useEffect(() => {
    // Нет лого → сразу «готово»; осознанный setState в эффекте загрузки
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!teacherLogo) { setLogoReady(true); return }
    let cancelled = false
    const controller = new AbortController()
    fetch(teacherLogo, { signal: controller.signal })
      .then(r => r.blob())
      .then(blob => {
        if (cancelled) return
        const url = URL.createObjectURL(blob)
        logoBlobRef.current = url
        setLogoBlobUrl(url)
        setLogoReady(true)
      })
      .catch(() => { if (!cancelled) setLogoReady(true) }) // skip logo on error, don't block
    return () => {
      cancelled = true
      controller.abort()
      // revoke only if not yet handed off to the player (releaseLogo clears the ref)
      if (logoBlobRef.current) { URL.revokeObjectURL(logoBlobRef.current); logoBlobRef.current = null }
    }
  }, [teacherLogo])  

  // Готовность — по нодам; бар — по скачанным байтам warmup-файлов (честный и плавный).
  // initialized=false until the hook has built its queue — prevents false "ready" flash.
  const nodeTotal   = warmupNodeIds.length
  const nodeReady   = warmupNodeIds.filter(id => readyNodeIds.has(id)).length
  const loaded      = initialized && logoReady && (nodeReady >= nodeTotal || nodeTotal === 0)
  // Показанный процент — плавный (не быстрее 1 с на всю шкалу, useSmoothPct)
  // и крутится только когда карточка видна (visible), не за каркасом.
  // Кнопка открывается вместе с ним: «Начать урок» при баре на 40 % — тот
  // же «мгновенный» скачок, только другой стороной
  const { barRef, textRef, reached } = useSmoothPct(loaded ? 100 : Math.min(warmupPct, 99), visible)
  const canStart    = loaded && reached

  // Стиль обычной кнопки старта — общий для LaunchCtaSlot (mayResume) и для
  // простой <button> (когда «Продолжить» в принципе невозможно)
  const startBtnStyle = {
    padding: '14px 0', borderRadius: 12, border: 'none',
    fontSize: 16, fontWeight: 600, cursor: canStart && !dissolving ? 'pointer' : 'default',
    background: canStart ? '#b6fe3b' : '#333',
    color: canStart ? '#0d1500' : '#666',
    transition: 'background 0.3s ease, color 0.3s ease',
  }

  // statsMode: null (первое прохождение) | 'update' | 'silent' (выбор пересдачи).
  // resume=true — жмут «Продолжить» в LaunchCtaSlot: payload несёт точку
  // входа и историю чата выше нее, LessonPlayer.jsx берёт их напрямую и не
  // гоняет свою собственную проверку чекпойнта (см. useLessonResume.js)
  function handleStart(statsMode = null, resume = false) {
    // Preload + unlock in the same gesture context so iOS Safari decodes audio immediately.
    // preloadSounds() creates Audio objects; unlockAudio() does play+pause on them.
    // Both must run here (not in useEffect) — iOS only allows audio decode within a gesture.
    preloadSounds()
    unlockAudio()
    // И прогреваем элемент под автозапуск таблиц: разрешение Safari даёт
    // конкретному <audio>, а у панели диктанта он рождается уже без жеста
    primeAudio()
    releaseBlobs()
    // Transfer logo blob ownership to player — clear ref so cleanup won't revoke it
    const logoForPlayer = logoBlobRef.current ?? teacherLogo
    logoBlobRef.current = null
    const payload = {
      nodes, files, blobMap, title: chatTitle, teacherName, teacherLogo: logoForPlayer, teacherLogoCrop, videoAutoSound, lessonXp,
      startNodeId: resume ? resumeOffer.nodeId : null,
      historyIds:  resume ? (resumeOffer.visitedIds ?? []).slice(0, -1) : null,
      resumedXp:   resume ? (resumeOffer.xp ?? 0) : 0,
    }

    if (payingCase) {
      // Платный случай: сперва показываем растворение мигающей ячейки —
      // пользователь видит, что энергия израсходована — и только потом
      // запускаем плеер. Реальное списание всё равно решает сервер (onStart→startLesson)
      onDissolve()
      setTimeout(() => onStart(payload, statsMode), 600)
    } else {
      onStart(payload, statsMode)
    }
  }

  return (
    <>
      <h2 style={{ margin: 0, color: '#fff', fontSize: 18, fontWeight: 600 }}>{title || name}</h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ height: 6, borderRadius: 3, background: '#333', overflow: 'hidden' }}>
          {/* Ширину и цифру ниже ведёт useSmoothPct прямо в DOM (ref),
              покадрово и без ре-рендеров; в JSX — только стартовые «0%»,
              React их не перезаписывает (значение в JSX не меняется).
              Без transition: покадровая запись сама и есть анимация */}
          <div ref={barRef} style={{ height: '100%', borderRadius: 3, width: '0%', background: '#b6fe3b' }} />
        </div>
        <span style={{ color: '#888', fontSize: 12 }}>
          {/* Слово то же, что в каркасе до загрузки сценария («Загрузка
              урока…»): подмена «Загрузка» → «Подготовка» на полпути читалась
              как смена этапа, хотя это одна и та же загрузка */}
          {canStart
            ? 'Урок готов к запуску'
            : <>Загрузка урока: <span ref={textRef}>0%</span></>}
        </span>
      </div>

      <LaunchEnergyRow info={info} dissolving={dissolving} />

      {/* Датчик движения — только уроку с нодой «переверни телефон» и только
          там, где его выдают по диалогу (iOS). Своим шагом, а не молча в
          handleStart: системный запрос без объяснения получает отказ, а
          отказ iOS помнит */}
      {nodes.some(n => n.type === 'rotate_phone') && motionNeedsAsk() && <LaunchMotionAsk />}

      {isAdmin && (
        <LaunchDebugPanel
          weak={weak}
          bufferSize={bufferSize}
          warmupNodeIds={warmupNodeIds}
          files={files}
          debugItems={debugItems}
        />
      )}

      {/* LaunchCtaSlot — одна и та же вёрстка для «Продолжить» и для обычного
          старта (showSecondRow включает вторую строку/кнопку), поэтому не
          нужно подгонять высоту числом (CTA_MIN_HEIGHT раньше расходился с
          реальным рендером шрифта) — см. LaunchCtaSlot.jsx. mayResume — та
          же синхронная проверка, что ушла в каркас (LaunchSkeleton): пока
          есть шанс на чекпойнт, даже обычная кнопка «Начать урок» держит то
          же место под вторую кнопку, что и каркас до неё — а когда его нет
          (пересдача/уже пройден/гонка), второй кнопки не будет никогда,
          и обычная кнопка не резервирует под неё пустое место */}
      {resumeOffer ? (
        <LaunchCtaSlot
          showSecondRow
          pctLabel={`Дошёл примерно до ${Math.round(resumeOffer.pct ?? 0)}%`}
          pct={Math.round(resumeOffer.pct ?? 0)}
          primaryClassName="resumeLessonBtnPrimary"
          primaryStyle={{ opacity: canStart ? 1 : 0.5, cursor: canStart ? 'pointer' : 'default' }}
          primaryLabel={canStart ? 'Продолжить' : 'Загрузка...'}
          primaryDisabled={!canStart}
          onPrimary={() => handleStart(null, true)}
          onGhost={() => { onRestartProgress(); handleStart() }}
        />
      ) : examIntro ? (
        <ExamIntroDialog canStart={canStart} onStart={() => handleStart()} />
      ) : retakeChoice ? (
        <RetakeDialog canStart={canStart} onPick={handleStart} onCancel={onClose} />
      ) : mayResume ? (
        <LaunchCtaSlot
          // pctLabel — см. LaunchSkeleton.jsx: пустая строка в скрытом <span>
          // даёт высоту 0, а не высоту строки текста, и блок оказывается на
          // ~17px ниже, чем у showSecondRow — та самая «растяжка» на глаз
          pctLabel="Загрузка..."
          primaryLabel={canStart ? '▶ Начать урок' : 'Загрузка...'}
          primaryDisabled={!canStart || dissolving}
          primaryStyle={startBtnStyle}
          onPrimary={() => handleStart()}
        />
      ) : (
        <button onClick={() => handleStart()} disabled={!canStart || dissolving} style={startBtnStyle}>
          {canStart ? '▶ Начать урок' : 'Загрузка...'}
        </button>
      )}
    </>
  )
}
