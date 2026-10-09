import { Trophy } from 'lucide-react'
import { formatCount, daysLabel } from '../../shared/lib/ratingStats.js'

// Нижняя часть попапа игрока: плитки «знает слов» / «выучено фраз», строка
// «Достижений: N из M» (если сервер прислал) и подвал с рекордом серии. Все состояния
// (каркас, ошибка, «нет данных») занимают тот же блок .rpBody — окно не прыгает.

function Skeleton() {
  return (
    <div className="rpSkel" aria-hidden="true">
      <div className="rpTiles"><i className="rpSkelTile" /><i className="rpSkelTile" /></div>
      <i className="rpSkelLine" />
      <i className="rpSkelLine rpSkelLine--foot" />
    </div>
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

function Stats({ stats }) {
  return (
    <>
      <div className="rpTiles">
        <div className="rpTile rpTile--perm">
          <b>{formatCount(stats.perm)}</b>
          <span>Знает слов</span>
          <small>в постоянной памяти</small>
        </div>
        <div className="rpTile rpTile--phr">
          <b>{formatCount(stats.phrases)}</b>
          <span>Выучено фраз</span>
          <small>целиком</small>
        </div>
      </div>
      {stats.achievements != null && (
        <div className="rpAch">
          <Trophy size={16} aria-hidden="true" />
          <span>Достижений</span>
          <b>{stats.achievements} из {stats.achievementsTotal}</b>
        </div>
      )}
      <p className="rpFoot">
        {stats.longestStreak > 0 && <>Рекорд серии: {formatCount(stats.longestStreak)} {daysLabel(stats.longestStreak)}</>}
      </p>
    </>
  )
}

export default function UserStatsBody({ res, retry }) {
  return (
    <div className="rpBody">
      {res === null ? <Skeleton />
        : res.state === 'ok' ? <Stats stats={res.stats} />
        : <Note res={res} retry={retry} />}
    </div>
  )
}
