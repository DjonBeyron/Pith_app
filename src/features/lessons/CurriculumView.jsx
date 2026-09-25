import { useState, useEffect, useRef } from 'react'
import { Sparkles } from 'lucide-react'
import { useCurriculumLessons } from './useCurriculumLessons.js'
import { useModuleAnalysis } from './useModuleAnalysis.js'
import ModuleTitleEditor from '../admin/ModuleTitleEditor.jsx'
import ModuleGraph from './ModuleGraph.jsx'
import ProModuleLessons from './ProModuleLessons.jsx'
import LessonLaunchCard from './LessonLaunchCard.jsx'
import LessonPlayer from '../player/LessonPlayer.jsx'
import { getCompletedLessons, markLessonCompleted } from '../../shared/lib/completedLessons.js'
import { seedGuestWordOf } from '../../shared/lib/memory/guestMemory.js'
import { refreshProfile, getCachedProfile } from '../../shared/api/profileCache.js'
import ProPaywall from '../pro/ProPaywall.jsx'
import { startLesson } from '../../shared/api/profileApi.js'
import EnergyPaywall from './EnergyPaywall.jsx'
import ModuleVideoPanel from './ModuleVideoPanel.jsx'
import { markModuleStarted } from '../../shared/api/moduleSocialApi.js'
import { dbg } from '../../shared/lib/debug.js'
import PriorityLegend from './PriorityLegend.jsx'
import StreakStartOverlay from '../streak/StreakStartOverlay.jsx'
import { takeFirstDay } from '../streak/firstDaySignal.js'
import BackButton from '../../shared/ui/BackButton.jsx'
import { useAdmin } from '../../app/AdminContext.jsx'
import { useAuth } from '../../shared/lib/useAuth.js'
import { weekKey, MODULE_DONE_WEEK_KEY } from '../race/useRaceState.js'
import { getLastEditorMode } from '../../shared/lib/lastEditorMode.js'
import { isModuleUnlocked, unlockModule } from '../../shared/lib/moduleUnlock.js'
import { useModuleAdminActions } from './useModuleAdminActions.js'
import { LEGEND_SEEN_KEY } from './priorityLegendSeen.js'

// Экран одного модуля: схема Старт → уроки → Финал, запуск уроков через
// карточку прогрева, плеер, приоритеты анализа знаний. Используется и во
// вкладке «Уроки» (старая оболочка), и из ленты по «Изучить фразу» (ui v2).
// isPro — про-модуль (супер-урок гонки): вместо графа простой список уроков,
// без Старта/Финала, без экзамена и без маркера «модуль пройден».
export default function CurriculumView({ curriculumId, curriculumTitle, isPro = false, onBack, onOpenCanvas, onOpenProduction }) {
  const {
    lessons, loading, creating, error, isDirty,
    bulkCreate, addBeforeFinal, addLast, renameLesson, removeLesson, moveLesson, saveStructure, togglePublished,
  } = useCurriculumLessons(curriculumId)

  // ⚙ открывает граф или продакшен — какой использовали последним
  // (lastEditorMode.js). Оба редактора работают над одними и теми же
  // данными урока — это не переключатель «навсегда», просто открывается то,
  // чем пользовались только что
  function openEditor(id) {
    const payload = {
      id,
      moduleLessons: lessons.map(l => ({ id: l.id, title: l.title })),
      // Откуда пришли: «назад» из редактора вернёт в схему этого модуля
      module: { id: curriculumId, title, isPro },
    }
    if (getLastEditorMode() === 'production') onOpenProduction(payload)
    else onOpenCanvas(payload)
  }

  // Название модуля наверху схемы: локальная копия (админ может
  // переименовать прямо здесь; родитель перечитает при выходе). Правка — в
  // попапе ModuleTitleEditor: название + полный перевод + перевод по словам
  const [title,        setTitle]        = useState(curriculumTitle)
  const [titleEditing, setTitleEditing] = useState(false)
  const [launchId,        setLaunchId]        = useState(null)
  const [playerData,      setPlayerData]      = useState(null)
  const [playingLessonId, setPlayingLessonId] = useState(null)
  const [completedIds,    setCompletedIds]    = useState(() => getCompletedLessons())
  // Только что пройденный урок — для анимации прилёта XP в графе модуля.
  const [justCompleted,   setJustCompleted]   = useState(null)
  // Окно «Путь начался» — только после анимации графа (см. firstDaySignal.js)
  const [firstDayOpen,    setFirstDayOpen]    = useState(false)
  // Легенда «Приоритеты уроков» поверх затемнённой схемы (этап 5)
  const [showLegend,      setShowLegend]      = useState(false)
  // Попап только что закрыт — отложенная анимация графа идёт с половинным офсетом
  const [postLegend,      setPostLegend]      = useState(false)
  // Отказ start_lesson: показать экран «Энергия закончилась» ({ nextAt })
  const [noEnergy,        setNoEnergy]        = useState(null)
  // Мягкое предложение Pro после первого прохождения Финала (момент успеха)
  const [proOffer,        setProOffer]        = useState(false)
  // Уроки открыты без диагностики (решение по этому модулю, см. moduleUnlock.js)
  const [unlocked, setUnlocked] = useState(() => isModuleUnlocked(curriculumId))
  const didInitRef = useRef(false)
  const { isAdmin } = useAdmin()
  const { user } = useAuth()

  // Приоритеты уроков (анализ знаний) + звёзды + память слов — useModuleAnalysis.js
  const { priorities, stars, memory, prioritiesReady, starsReady, readyTimeout, refreshPriorities, refreshStars } =
    useModuleAnalysis({ isPro, lessons, user })

  // Тест-инструменты админа (сброс, «пометить пройденным») и 💾 структуры —
  // useModuleAdminActions.js
  const {
    saving, saveMsg, handleResetProgress, handleResetLesson, handleMarkAllDone, handleMarkLessonDone, handleSave,
  } = useModuleAdminActions({
    curriculumId, lessons, isPro, saveStructure, setCompletedIds, setUnlocked, refreshPriorities,
  })

  // Регистрация посреди урока (нода в плеере): гостевая сессия start_lesson
  // была пустой — без пересоздания под новым пользователем complete_lesson
  // вернёт 0 XP, а модуль не попадёт в «Мои уроки»
  useEffect(() => {
    if (!user || !playingLessonId) return
    startLesson(playingLessonId)
    if (lessons.length > 0 && playingLessonId === lessons[0].id) {
      markModuleStarted(curriculumId)
    }
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Возвращает promise с картой приоритетов — вызывающий может дождаться
  // пересчёта до показа графа и решить, показывать ли легенду
  function closeLegend() {
    localStorage.setItem(LEGEND_SEEN_KEY, '1')
    setShowLegend(false)
    setPostLegend(true) // анимация после попапа — с половинным офсетом
  }

  useEffect(() => {
    // Прогрев кэша профиля: вкладка «Профиль» откроется сразу со свежим XP.
    refreshProfile()
  }, [])

  useEffect(() => {
    // Авто-создание уроков в пустом модуле — только у админа (запись в БД).
    // Про-модуль стартует с одного урока (Старта и Финала у него нет).
    if (isAdmin && !loading && !creating && lessons.length === 0 && !didInitRef.current) {
      didInitRef.current = true
      bulkCreate(isPro ? ['Урок 1'] : ['Старт', 'Урок', 'Финал'])
    }
  }, [isAdmin, loading, creating, lessons.length]) // eslint-disable-line react-hooks/exhaustive-deps


  if (playerData) {
    return (
      <LessonPlayer
        nodes={playerData.nodes}
        files={playerData.files}
        lessonTitle={playerData.title}
        lessonXp={playerData.lessonXp ?? 0}
        lessonId={playingLessonId}
        teacherName={playerData.teacherName}
        teacherLogo={playerData.teacherLogo}
        teacherLogoCrop={playerData.teacherLogoCrop}
        videoAutoSound={playerData.videoAutoSound ?? false}
        initialBlobMap={playerData.blobMap}
        startNodeId={playerData.startNodeId ?? null} historyIds={playerData.historyIds ?? null} resumedXp={playerData.resumedXp ?? 0}
        /* Финал модуля (залогинен, не про-модуль): панель подсказок + золотой билет */
        finalTicket={!isPro && user && lessons.length > 0 &&
          playingLessonId === lessons[lessons.length - 1].id
          ? { moduleId: curriculumId } : null}
        /* Обычный урок (между Стартом и Финалом): звёзды по ошибкам */
        starsEligible={!isPro && lessons.length > 2 &&
          playingLessonId !== lessons[0].id &&
          playingLessonId !== lessons[lessons.length - 1].id}
        onClose={() => setPlayerData(null)}
        onSummaryClose={async () => {
          if (playingLessonId) {
            const wasDone = completedIds.has(playingLessonId)
            markLessonCompleted(playingLessonId)
            setCompletedIds(getCompletedLessons())
            if (!wasDone) {
              const l = lessons.find(x => x.id === playingLessonId)
              if (l) setJustCompleted({ id: l.id, xp: l.lessonXp ?? 0 })
            }
            // Гость прошёл урок-слово — слово в его локальную память (у
            // залогиненного это делает серверный триггер)
            if (!user) seedGuestWordOf(lessons, playingLessonId)
            // Финальный урок = модуль пройден: пометка недели для попапа
            // «доступна супергонка». Про-модуль — не в счёт (он сам про гонку)
            if (!isPro && lessons.length > 0 && playingLessonId === lessons[lessons.length - 1].id) {
              localStorage.setItem(MODULE_DONE_WEEK_KEY, weekKey())
              // Момент успеха: первое прохождение Финала → мягкое предложение
              // Pro (только залогиненным без подписки и не админам)
              const p = getCachedProfile()
              if (!wasDone && p && !p.has_subscription && !p.is_admin) setProOffer(true)
            }
          }
          // Звёзды: локальный стор уже обновлён плеером — пересобрать карту
          refreshStars()
          // Ждём пересчёт приоритетов ДО закрытия плеера — граф отрисуется
          // сразу с готовыми полосками, без скачка UI на глазах пользователя
          const map = await refreshPriorities()
          // Легенда — когда диагностика впервые дала приоритеты (пересдача
          // теперь обычное прохождение: выбора «без записи» больше нет)
          const seen = !!localStorage.getItem(LEGEND_SEEN_KEY)
          dbg('[LEGEND] приоритетов:', map?.size ?? 'null', 'уже видел:', seen)
          if (map?.size > 0 && !seen) {
            setShowLegend(true)
          }
          setPlayerData(null)
          setPlayingLessonId(null)
        }}
      />
    )
  }

  return (
    <div className="lessonsMapPanel">
      <div className="lessonsMapToolbar">
        <BackButton onClick={onBack} />
        <span
          className="lessonMapTitle"
          onClick={isAdmin ? () => setTitleEditing(true) : undefined}
          style={isAdmin ? { cursor: 'pointer' } : undefined}
          title={isAdmin ? 'Название и перевод модуля' : undefined}>
          {title}{isAdmin && ' ✎'}
        </span>
        {titleEditing && (
          <ModuleTitleEditor
            moduleId={curriculumId}
            initialTitle={title}
            onClose={() => setTitleEditing(false)}
            onSaved={setTitle}
          />
        )}
        {error && <span className="errorText">{error}</span>}
        {saveMsg && <span className="dbSaveMsg">{saveMsg}</span>}
        {isAdmin && (
          <>
            <ModuleVideoPanel curriculumId={curriculumId} />
            <button className="saveBtn" onClick={handleResetProgress}
              disabled={loading || !lessons.length} title="Сбросить прохождение уроков модуля (локально)">
              ⟲
            </button>
            <button className="saveBtn" onClick={handleMarkAllDone}
              disabled={loading || !lessons.length} title="Тест: пометить все уроки модуля пройденными (без начисления XP)">
              ✔
            </button>
            <button className={`saveBtn${isDirty ? ' saveBtn--dirty' : ''}`}
              onClick={handleSave} disabled={saving || loading} title="Сохранить структуру на сервер">
              {saving ? '...' : '💾'}
              {isDirty && !saving && <span className="saveDirtyDot" />}
            </button>
            {!isPro && (
              <button className="primaryBtn" onClick={() => addBeforeFinal()} disabled={creating || loading}>
                {creating ? '...' : '+ Урок'}
              </button>
            )}
          </>
        )}
      </div>

      {loading || (creating && lessons.length === 0) ||
        (!isPro && lessons.length > 0 && (!prioritiesReady || !starsReady) && !readyTimeout) ? (
        <div className="lessonsMapLoader"><span className="lessonsMapSpinner" /></div>
      ) : isPro ? (
        <ProModuleLessons
          lessons={lessons}
          completedIds={completedIds}
          creating={creating}
          onPlay={id => setLaunchId(id)}
          onEdit={openEditor}
          onDelete={removeLesson}
          onRename={renameLesson}
          onAdd={() => addLast(`Урок ${lessons.length + 1}`)}
        />
      ) : (
        <ModuleGraph
          lessons={lessons}
          completedIds={completedIds}
          priorities={priorities}
          stars={stars}
          memory={memory}
          unlocked={unlocked}
          onUnlock={() => { unlockModule(curriculumId); setUnlocked(true) }}
          animHold={showLegend} /* пока попап открыт — вся анимация графа на паузе */
          animShort={postLegend}
          justCompleted={justCompleted}
          onFlightDone={() => {
            setJustCompleted(null)
            setPostLegend(false)
            if (takeFirstDay()) setFirstDayOpen(true)
          }}
          onResetLesson={handleResetLesson}
          onMarkDoneLesson={handleMarkLessonDone}
          onPlay={id => setLaunchId(id)}
          onEdit={openEditor}
          onDelete={removeLesson} onMove={moveLesson}
          onRename={renameLesson}
          onTogglePublished={togglePublished}
        />
      )}

      {launchId && (
        <LessonLaunchCard
          lessonId={launchId}
          /* Название уже известно схеме — карточка покажет его сразу, не дожидаясь
             загрузки сценария по сети */
          lessonTitle={lessons.find(l => l.id === launchId)?.title ?? ''}
          retake={completedIds.has(launchId)}
          examIntro={!isPro && lessons.length > 0 && launchId === lessons[lessons.length - 1].id}
          /* Старт и Финал модуля сервер не тарифицирует — надпись о стоимости честная */
          energyFree={lessons.length > 0 &&
            (launchId === lessons[0].id || launchId === lessons[lessons.length - 1].id)}
          onStart={async (data) => {
            // Энергия: сервер решает, бесплатный урок или -1; при нуле —
            // пейволл вместо плеера
            const res = await startLesson(launchId)
            if (res?.ok === false) {
              setLaunchId(null)
              setNoEnergy({ nextAt: res.next_at })
              return
            }
            refreshProfile() // молнии в профиле — свежие
            // «Начал модуль» для «Моих уроков»: только залогиненный и только
            // при запуске стартового урока (первого в схеме)
            if (lessons.length > 0 && launchId === lessons[0].id) {
              markModuleStarted(curriculumId)
            }
            setPlayingLessonId(launchId)
            setLaunchId(null)
            setPlayerData(data)
          }}
          onClose={() => setLaunchId(null)}
        />
      )}

      {firstDayOpen && <StreakStartOverlay onClose={() => setFirstDayOpen(false)} />}

      {noEnergy && (
        <EnergyPaywall nextAt={noEnergy.nextAt} onClose={() => setNoEnergy(null)} />
      )}

      {proOffer && (
        <ProPaywall heading={<>Модуль пройден! <Sparkles size={20} style={{ verticalAlign: '-3px' }} /></>} onClose={() => setProOffer(false)} />
      )}

      {showLegend && (
        <PriorityLegend
          lessons={lessons}
          priorities={priorities}
          moduleTitle={curriculumTitle}
          onClose={closeLegend}
        />
      )}

    </div>
  )
}
