import { stepBars, formatCount, wordsLabel, daysLabel } from '../../shared/lib/ratingStats.js'

// Нижняя часть попапа игрока: плитки «слов знает» / «фраз выучено», ступени
// памяти цветными полосками (цвета «Моей памяти») и подвал. Все состояния
// (каркас, ошибка, «нет данных») занимают тот же блок .rpBody — окно не прыгает.

function Skeleton() {
  return (
    <div className="rpSkel" aria-hidden="true">
      <div className="rpTiles"><i className="rpSkelTile" /><i className="rpSkelTile" /></div>
      <i className="rpSkelLine rpSkelLine--title" />
      {[0, 1, 2, 3].map(i => <i key={i} className="rpSkelLine" />)}
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
  const bars = stepBars(stats)
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
      <p className="rpCap">Ступени памяти</p>
      <div className="rpSteps">
        {bars.map((b, i) => (
          <div key={b.key} className="rpStep" style={{ '--c': b.color, '--i': i }} data-empty={b.count === 0 ? '1' : undefined}>
            <span className="rpStepName">{b.label}</span>
            <span className="rpTrack"><i className="rpFill" style={{ width: `${b.share * 100}%` }} /></span>
            <b className="rpStepN">{formatCount(b.count)}</b>
          </div>
        ))}
      </div>
      <p className="rpFoot">
        Всего в памяти: {formatCount(stats.total)} {wordsLabel(stats.total)}
        {stats.longestStreak > 0 && <> · рекорд серии {formatCount(stats.longestStreak)} {daysLabel(stats.longestStreak)}</>}
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
