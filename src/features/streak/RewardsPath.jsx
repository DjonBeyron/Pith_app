import { useEffect, useRef } from 'react'
import { Lock, Check, Gift } from 'lucide-react'
import TicketIcon from '../../shared/ui/TicketIcon.jsx'

// Фиксированный набор дней для скелетона (ghost=true): пока вехи (milestones)
// не пришли с сервера, реальный статус дней посчитать нельзя — рисуем
// правдоподобный путь той же формы (обычные ступени + одна веха), чтобы блестели
// силуэты настоящих .rwBlock, а не отдельная скелетон-разметка.
const GHOST_DAYS = [
  { day: 1, xp: 5,  tickets: 0, milestone: false, status: 'done',   visited: true },
  { day: 2, xp: 5,  tickets: 0, milestone: false, status: 'done',   visited: true },
  { day: 3, xp: 20, tickets: 1, milestone: true,  status: 'ready',  visited: true },
  { day: 4, xp: 5,  tickets: 0, milestone: false, status: 'ready',  visited: true },
  { day: 5, xp: 5,  tickets: 0, milestone: false, status: 'locked', visited: false },
]

// Позиция ступени в «лесенке» (0 — левее всех, 2 — у правого края): влево → вправо → обратно, как ступени
// «Моей памяти»; сдвиг считает CSS (--k в rewards-ladder.css)
const SHIFTS = [0, 1, 2, 1]

// Подпись под наградой: что с этим днём
function subText(d, streak) {
  if (d.status === 'done') return 'получено'
  if (d.status === 'ready') return 'можно забрать'
  const left = d.day - streak
  return `через ${left} ${left === 1 ? 'день' : left < 5 ? 'дня' : 'дней'}`
}

// Путь дней окна наград — «лесенка» из крупных блоков, как ступени вкладки «Моя память»: каждая ступень сдвинута
// вправо/влево, от общего ствола слева к ней идёт провод с раздувом у входа в блок. Ствол и провода зелёные, пока вход
// в день уже совершён (day <= current_streak), дальше — серые. Окно начинается с max(1, nextClaimDay - 3), поэтому
// сверху видны до 3 уже полученных дней. Статус каждого дня (см. расчёт в RewardsPopup):
//   'done'   — day < nextClaimDay: награда получена — приглушённый блок с галочкой
//   'ready'  — nextClaimDay <= day <= current_streak: день прожит и ждёт забора — зелёные обводки со свечением и
//              подарок (ready-дней может быть несколько, если не заходил забирать)
//   'locked' — day > current_streak: день ещё не наступил (замок, «через N дн.»)
// Веха (day_number из streak_milestones) — золотые обводки (две, как у сильной ступени памяти) и билет.
//
// pointerIdx: строка, над которой рисуется указатель «ты здесь» (-1 — нет).
// focusDay: день, к которому путь автоматически скроллится при открытии (без плавности — иначе список «прыгает» на
// глазах). Обычно это current_streak; если его нет в окне — последний ready-день (см. RewardsPopup), либо null.
// streak — текущая серия: для подписи «через N дн.» у ещё не наступивших дней.
export default function RewardsPath({ days, focusDay, pointerIdx = -1, streak = 0, ghost = false }) {
  const nodeRefs = useRef({})
  const rows = ghost ? GHOST_DAYS : days
  // Номер последней ступени, в которую вход уже совершён: до неё ствол зелёный (CSS: --lime-n)
  const limeN = rows.reduce((n, d, i) => (d.visited ? i : n), -1)
  // Выше первой показанной ступени есть ещё полученные дни — ствол уходит вверх и растворяется, а не обрывается
  const moreAbove = !ghost && (rows[0]?.day ?? 1) > 1
  // Указатель «ты здесь» (индекс считает RewardsPopup через pointerIndex, правило — в streakClaim.js): впереди последнего
  // полученного / доступного к получению дня

  useEffect(() => {
    if (ghost) return // скелетон никуда не скроллим — ждём реальные данные
    const target = focusDay != null ? nodeRefs.current[focusDay] : null
    target?.scrollIntoView({ block: 'center' })
    // Скроллим только один раз, сразу после того как путь впервые
    // отрисовался с реальными данными (родитель форсирует новый mount при
    // переходе скелетон → контент через key, см. RewardsPopup).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className={`rwPath${ghost ? ' rwGhost' : ''}`}>
      <div className="rwPathList" style={{ '--lime-n': limeN, '--more-above': moreAbove ? 1 : 0 }}>
        {rows.map((d, i) => (
          <div
            key={d.day}
            className={`rwStep rwStep--${d.status}${d.milestone ? ' rwStep--gold' : ''}${d.visited ? ' rwStep--on' : ''}`}
            style={{ '--k': SHIFTS[i % SHIFTS.length] }}
            ref={el => { if (el) nodeRefs.current[d.day] = el }}
          >
            <div
              className="rwBlock"
              data-current={d.status === 'ready' || undefined}
            >
              <span className="rwNum">
                <i>день</i>
                {d.day}
              </span>
              <span className="rwBody">
                <b className="rwReward">
                  {d.milestone ? (
                    // Две части награды (XP и билеты) — отдельные куски: на узком экране или при большой награде (1000 XP + 50 🎫 у
                    // вехи «год») вторая уходит на новую строку, а не обрезается многоточием
                    <>
                      {d.xp > 0 && <span className="rwRewardPart">{d.xp} XP</span>}
                      {d.xp > 0 && d.tickets > 0 && ' '}
                      {d.tickets > 0 && <span className="rwRewardPart">{d.xp > 0 && '+ '}{d.tickets} <TicketIcon className="rwRewardTicket" /></span>}
                    </>
                  ) : `+${d.xp} XP`}
                </b>
                <span className="rwSub">{ghost ? '' : subText(d, streak)}</span>
              </span>
              <span className="rwMark" aria-hidden="true">
                {d.status === 'done' && <Check size={20} strokeWidth={3} />}
                {d.status === 'ready' && (d.milestone ? <TicketIcon className="rwMarkTicket" /> : <Gift size={20} />)}
                {d.status === 'locked' && (d.milestone ? <TicketIcon className="rwMarkTicket" /> : <Lock size={17} />)}
              </span>
            </div>
          </div>
        ))}
        {!ghost && pointerIdx > 0 && <div className="rwNow" style={{ '--now': pointerIdx }} aria-hidden="true" />}
      </div>
    </div>
  )
}
