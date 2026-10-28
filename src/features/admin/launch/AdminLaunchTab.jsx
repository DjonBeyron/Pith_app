import { useState, useEffect } from 'react'
import { loadLaunchData } from './launchLoad.js'
import { buildLaunchStats } from './launchStats.js'
import LaunchRow from './LaunchRow.jsx'
import '../../../styles/admin-launch.css'

// Админ → «Запуск»: готово ли наполнение, чтобы приложение жило для новых пользователей. Одна сводка сверху
// («Готово к запуску: N из M условий») и список условий: сколько есть, сколько нужно минимум, сколько не хватает
// и зачем это нужно; при нехватке раскрывается список конкретных фраз/слов. Пороги — launchThresholds.js,
// подсчёт — launchStats.js (тот же отчёт печатает scripts/launch-stats.mjs для GitHub Actions).
export default function AdminLaunchTab() {
  const [res, setRes] = useState(null) // null — загрузка; { stats } | { error }
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    loadLaunchData()
      .then(d => ({ stats: buildLaunchStats(d) }))
      .catch(e => ({ error: e?.message || String(e) }))
      .then(r => { if (!cancelled) setRes(r) })
    return () => { cancelled = true }
  }, [tick])

  function reload() {
    setRes(null)
    setTick(t => t + 1)
  }

  const stats = res?.stats
  const summary = stats?.summary
  const tone = !summary ? '' : summary.ready ? ' lnSumOk' : summary.passed < summary.total ? ' lnSumBad' : ' lnSumWarn'

  return (
    <div className="aeWrap lnWrap">
      <div className="aeHead">
        <span className="aeTitle">Запуск</span>
        <button className="aeRefresh" onClick={reload} disabled={res === null}>Обновить</button>
      </div>

      {res === null && <p className="aeHint">Считаем наполнение…</p>}
      {res?.error && <p className="aeError">Не удалось посчитать: {res.error}</p>}

      {summary && (
        <>
          <div className={`lnSummary${tone}`}>
            <span className="lnSumText">{summary.text}</span>
            <span className="lnSumSub">
              {summary.ready ? 'Наполнения хватает: приложение живёт для новичка.' : 'Раскройте красные строки — там конкретные фразы и слова.'}
            </span>
          </div>
          <div className="lnList">
            {stats.rows.map(r => <LaunchRow key={r.id} row={r} />)}
          </div>
        </>
      )}
    </div>
  )
}
