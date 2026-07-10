import { useState } from 'react'
import { useRaceState } from './useRaceState.js'
import RaceCountdown from './RaceCountdown.jsx'
import RaceRunner from './RaceRunner.jsx'
import RaceSummary from './RaceSummary.jsx'
import { finishRace, fetchMyRaceRank } from '../../shared/api/raceApi.js'
import { useAuth } from '../../shared/lib/useAuth.js'
import PushToggle from '../profile/PushToggle.jsx'
import CurriculumView from '../lessons/CurriculumView.jsx'

function fmtMs(ms) {
  const s = Math.round((ms ?? 0) / 1000)
  const m = Math.floor(s / 60)
  return m > 0 ? `${m} мин ${s % 60} сек` : `${s} сек`
}

// Страница супергонки: тема недели, XP-прогресс подготовки (порог 80%),
// список заданий-модулей, таймер и большая кнопка входа в супер-урок
// (про-модуль: уроки цепочкой, XP — после итогов).
export default function RacePage({ onBack }) {
  const {
    race, modules, raceModule, myEntry, loading, reload,
    totalXp, earnedXp, neededXp, unlocked, phase,
  } = useRaceState(true)
  const [openModule, setOpenModule] = useState(null)  // модуль подготовки (схема)
  const [runRace,    setRunRace]    = useState(false) // супер-урок в плеере
  const [summary,    setSummary]    = useState(null)  // итоги супер-урока { errors, timeMs, rank }
  const [notice,     setNotice]     = useState('')
  const { user } = useAuth()

  if (openModule) {
    return (
      <div className="feedModuleScreen">
        <CurriculumView
          curriculumId={openModule.id}
          curriculumTitle={openModule.title}
          onBack={() => { setOpenModule(null); reload() }}
          onOpenCanvas={() => {}}
        />
      </div>
    )
  }

  if (runRace && raceModule?.lessons?.length) {
    return (
      <RaceRunner
        lessonIds={raceModule.lessons.map(l => l.id)}
        onRaceFinish={async (totals) => {
          const res = await finishRace(race.id, totals.errors, totals.timeMs)
          setRunRace(false)
          if (res?.ok) {
            // Итоги супер-урока: время, ошибки, временное место
            const rank = await fetchMyRaceRank(race.id)
            setSummary({ ...totals, rank })
          } else {
            setNotice(res?.reason === 'already' ? 'Гонка уже пройдена — попытка одна'
              : res?.reason === 'closed' ? 'Время гонки вышло — результат не засчитан'
              : 'Не удалось записать результат')
          }
          reload()
        }}
        onClosed={() => { setRunRace(false); reload() }}
      />
    )
  }

  const pct = totalXp > 0 ? Math.min(100, Math.round((earnedXp / totalXp) * 100)) : 0
  const finished = !!myEntry?.finished_at

  return (
    <div className="racePage">
      <div className="raceHead">
        <button className="pvBack" onClick={onBack}>← Рейтинг</button>
      </div>

      {loading ? <div className="pvEmpty">Загрузка...</div> : !race ? (
        <div className="pvEmpty">Супергонка пока не объявлена — загляни позже</div>
      ) : (
        <>
          <div className="raceThemeCard">
            <div className="raceKicker">Еженедельная супергонка</div>
            <h2 className="raceTitle">{race.title || 'Тема недели'}</h2>
            {race.description && <p className="raceDesc">{race.description}</p>}
            <div className="raceWhen">
              {phase === 'upcoming' && <>Старт через <RaceCountdown to={race.starts_at} onZero={reload} /></>}
              {phase === 'running'  && <>Идёт! До конца <RaceCountdown to={race.ends_at} onZero={reload} /></>}
              {phase === 'ended'    && 'Гонка завершена'}
            </div>
          </div>

          {notice && <div className="raceNotice">{notice}</div>}

          {/* Большая кнопка входа в гонку; после финиша — свой результат
              (без временного места — оно было в итогах супер-урока) */}
          {finished ? (
            <div className="raceBigBtn raceBigBtnDone">
              🏁 Ты финишировал! Ошибок {myEntry.errors} · {fmtMs(myEntry.time_ms)}
              <span className="raceDoneSub">
                {phase === 'ended' && myEntry?.place ? `Место: ${myEntry.place}` : 'Финальные места и XP — в понедельник'}
              </span>
            </div>
          ) : phase === 'ended' ? (
            <div className="raceBigBtn raceBigBtnOff">Гонка завершена</div>
          ) : !user ? (
            <div className="raceBigBtn raceBigBtnOff">Войди в аккаунт, чтобы участвовать</div>
          ) : !unlocked ? (
            <div className="raceBigBtn raceBigBtnOff">
              🔒 Открой гонку — набери {neededXp} XP (80%) уроками ниже
            </div>
          ) : phase === 'running' ? (
            raceModule?.lessons?.length
              ? <button className="raceBigBtn raceBigBtnGo" onClick={() => setRunRace(true)}>
                  🏁 Начать супергонку
                </button>
              : <div className="raceBigBtn raceBigBtnOff">Супер-урок ещё не назначен</div>
          ) : (
            <div className="raceBigBtn raceBigBtnReady">
              ✓ Ты готов! Жди старта в субботу
            </div>
          )}

          {/* Прогресс подготовки: порог открытия — 80% от суммы XP */}
          <div className="pvCard">
            <div className="pvCardTop">
              <span>Подготовка (нужно {neededXp} XP)</span>
              <b>{earnedXp} / {totalXp} XP</b>
            </div>
            <div className="pvTrack"><div className="pvFill" style={{ width: `${pct}%` }} /></div>
          </div>

          {/* Список заданий — модули (Старт + уроки + Финал) */}
          <div className="raceLessons">
            {modules.map((m, i) => (
              <button key={m.id} className="raceLessonRow" onClick={() => setOpenModule(m)}>
                <span className={m.done ? 'raceLessonNum raceLessonNumDone' : 'raceLessonNum'}>
                  {m.done ? '✓' : i + 1}
                </span>
                <span className="raceLessonTitle">
                  {m.title}
                  <span className="raceLessonSub">{m.doneLessons}/{m.lessons.length} уроков</span>
                </span>
                <span className="raceLessonXp">{m.earnedXp}/{m.xp} XP</span>
              </button>
            ))}
            {modules.length === 0 && <div className="pvEmpty">Задания ещё не назначены</div>}
          </div>

          {/* Пуш о старте — для готовых к гонке */}
          {unlocked && phase === 'upcoming' && (
            <div className="racePushHint">
              <div className="racePushHintText">Включи уведомления — пришлём пуш на старте гонки</div>
              <PushToggle />
            </div>
          )}

          {/* Итоги супер-урока: время, ошибки, временное место */}
          {summary && (
            <RaceSummary
              errors={summary.errors}
              timeMs={summary.timeMs}
              rank={summary.rank}
              onClose={() => setSummary(null)}
            />
          )}
        </>
      )}
    </div>
  )
}
