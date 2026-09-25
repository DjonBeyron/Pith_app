import { useState, useEffect } from 'react'
import { loadScript } from '../../shared/lib/lessonsApi.js'
import { getFilesByIds } from '../../shared/lib/filesApi.js'
import { getDefaultTeacher } from '../../shared/api/appSettingsApi.js'
import { resolveTeacher } from '../../shared/lib/teacherResolve.js'
import LaunchMotionAsk from './LaunchMotionAsk.jsx'
import ExamIntroDialog from './ExamIntroDialog.jsx'
import LaunchCtaSlot from './LaunchCtaSlot.jsx'
import LaunchDebugPanel from './LaunchDebugPanel.jsx'
import LaunchSkeleton from './LaunchSkeleton.jsx'
import LaunchPreloader from './LaunchPreloader.jsx'
import LaunchEnergyRow from './LaunchEnergyRow.jsx'
import { launchEnergyInfo } from './launchEnergy.js'
import { getLessonProgress, clearLessonProgress } from '../../shared/lib/lessonProgressApi.js'
import { getCompletedLessons } from '../../shared/lib/completedLessons.js'
import { extractFileIds } from './launchHelpers.js'

// retake=true — урок уже пройден (энергия: пересдача). Выбора «с обновлением
// анализа / без записи» больше нет — ответы только добавляются.
// examIntro=true (финальный урок): вместо кнопки старта — интро экзамена
// (правила, 3 подсказки, ключ).
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
  // точку входа, а не всегда в начало урока (см. LaunchPreloader.jsx).
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
            />
          </div>
        )}
      </div>
    </div>
  )
}
