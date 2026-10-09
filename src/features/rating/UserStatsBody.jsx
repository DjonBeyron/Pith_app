import { Trophy } from 'lucide-react'
import { formatCount, daysLabel } from '../../shared/lib/ratingStats.js'
import { isWeakDevice } from '../../shared/lib/deviceTier.js'

// Нижняя часть попапа игрока: плитки «знает слов» / «выучено фраз», строка
// «Достижений: N из M» (если сервер прислал) и подвал с рекордом серии.
// Вёрстка (плитки, подписи, строка достижений, подвал) полностью готова с первого
// кадра и не зависит от ответа сервера: пока данных нет, на месте ЗНАЧЕНИЯ лежит
// плашка с блеском (.shim, shimmer.css), пришли — значение проявляется opacity, плашка
// тает, ничего не двигается (из кэша окно открывается сразу с числами: transition
// срабатывает только на смене состояния, на первом кадре его нет). Ошибка и «нет данных» занимают тот же блок .rpBody.

// Слабое устройство — плашка без бегущей полосы (статичная серая)
const shimClass = () => (isWeakDevice() ? 'shim shim--still' : 'shim')

// Поле значения: плашка + значение друг над другом в одной ячейке. ready=false —
// блестит плашка, значение прозрачно; ready — наоборот (смена — transition в CSS)
function Fld({ ready, plate, children }) {
  return (
    <span className="rpFld" data-ready={ready ? '' : undefined}>
      <i className={`${shimClass()} ${plate}`} aria-hidden="true" />
      <span className="rpVal">{ready ? children : null}</span>
    </span>
  )
}

function Stats({ stats }) {
  const ok = stats != null
  return (
    <>
      <div className="rpTiles">
        <div className="rpTile rpTile--perm">
          <b><Fld ready={ok} plate="rpPlate--num">{ok && formatCount(stats.perm)}</Fld></b>
          <span>Знает слов</span>
          <small>в постоянной памяти</small>
        </div>
        <div className="rpTile rpTile--phr">
          <b><Fld ready={ok} plate="rpPlate--num">{ok && formatCount(stats.phrases)}</Fld></b>
          <span>Выучено фраз</span>
          <small>целиком</small>
        </div>
      </div>
      {/* Сервер без поля achievements (миграция не применена) — строки нет, пока идёт загрузка она на месте */}
      {(!ok || stats.achievements != null) && (
        <div className="rpAch">
          <Trophy size={16} aria-hidden="true" />
          <span>Достижений</span>
          <b><Fld ready={ok} plate="rpPlate--ach">{ok && `${stats.achievements} из ${stats.achievementsTotal}`}</Fld></b>
        </div>
      )}
      <p className="rpFoot">
        <Fld ready={ok} plate="rpPlate--foot">
          {ok && stats.longestStreak > 0 && `Рекорд серии: ${formatCount(stats.longestStreak)} ${daysLabel(stats.longestStreak)}`}
        </Fld>
      </p>
    </>
  )
}

function Note({ res, retry }) {
  const text = res.state === 'error' ? 'Не удалось загрузить'
    : res.state === 'denied' ? 'Войди в аккаунт, чтобы увидеть, сколько слов знает игрок'
    : 'Подробности об игроке пока недоступны'
  return (
    <div className="rpNote" role="status">
      <p>{text}</p>
      {res.state === 'error' && <button type="button" className="rpRetry" onClick={retry}>Повторить</button>}
    </div>
  )
}

export default function UserStatsBody({ res, retry }) {
  const showNote = res !== null && res.state !== 'ok'
  return (
    <div className="rpBody" aria-busy={res === null}>
      {showNote ? <Note res={res} retry={retry} /> : <Stats stats={res?.stats ?? null} />}
    </div>
  )
}
