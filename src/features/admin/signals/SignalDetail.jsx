import { weightShares } from './draftModel.js'
import { STATUS_LABEL, GROUP_COLORS, textsFor } from './signalTexts.js'

// Средняя колонка: карточка выбранного сигнала — что значит, откуда данные, как
// считается, чем рискует, текущее значение на ленте админа (signalStats), что будет,
// если усилить/ослабить. Тексты — signalTexts.js, факты — реестр (meta).
const pct = v => `${Math.round(v * 100)}%`

export default function SignalDetail({ meta, state, draft, stats, noMemory }) {
  if (!meta) return <p className="sdEmpty">Выбери сигнал в списке слева.</p>
  const t = textsFor(meta.id)
  const share = weightShares(draft).shares[meta.id] ?? 0
  const live = !meta.uiLocked

  return (
    <article className="sdCard" style={{ '--sl-color': GROUP_COLORS[meta.group] }} aria-labelledby="sdTitle">
      <header className="sdHead">
        <h2 id="sdTitle" className="sdTitle">{meta.title}</h2>
        <span className="sdGroup">{meta.groupTitle}</span>
        <span className={`slBadge slBadge-${meta.status}`}>{STATUS_LABEL[meta.status] ?? meta.status}</span>
      </header>

      <dl className="sdFacts">
        <dt>Что означает</dt><dd>{meta.description}</dd>
        <dt>Откуда данные</dt><dd><code className="sdCode">{meta.source}</code></dd>
        <dt>Как считается</dt><dd>{t.how}</dd>
        <dt>Чем рискует</dt><dd>{t.risk}</dd>
      </dl>

      <section className="sdBlock" aria-labelledby="sdNow">
        <h3 id="sdNow" className="sdSub">Сейчас в черновике</h3>
        {live ? (
          <p className="sdLine">
            {state?.enabled ? 'Включён' : 'Выключен'} · вес <b>{state?.weight ?? 0}</b> · доля в сумме <b>{pct(share)}</b>
            {!state?.enabled && ' — на порядок не влияет, пока выключен'}
          </p>
        ) : (
          <p className="sdLine sdMuted">Сигнал ещё не считается (нейтрален 0.5 у всех фраз). Вес-заготовка: {state?.weight ?? meta.defaultWeight}. Включить можно будет, когда он станет «в работе».</p>
        )}
      </section>

      <section className="sdBlock" aria-labelledby="sdValue">
        <h3 id="sdValue" className="sdSub">Значение на вашей ленте</h3>
        {!live && <p className="sdLine sdMuted">Появится, когда сигнал заработает.</p>}
        {live && noMemory && <p className="sdLine sdMuted">Память слов ещё не загружена — значение посчитать нельзя.</p>}
        {live && !noMemory && !stats && <p className="sdLine sdMuted">Нет опубликованных фраз.</p>}
        {live && stats && (
          <>
            <div className="sdMeter" role="img" aria-label={`Среднее значение ${stats.mean.toFixed(2)}`}>
              <span className="sdMeterFill" style={{ width: pct(stats.mean) }} />
            </div>
            <p className="sdLine">
              Среднее <b>{stats.mean.toFixed(2)}</b> из 1 · высоко (≥ 0.67) у <b>{stats.high}</b> из {stats.total} фраз · низко (≤ 0.33) у <b>{stats.low}</b>
            </p>
            {stats.reasons.length > 0 && (
              <ul className="sdReasons">
                {stats.reasons.map(r => <li key={r.text}><span className="sdReasonN">{r.n}</span> {r.text}</li>)}
              </ul>
            )}
          </>
        )}
      </section>

      <section className="sdBlock sdEffects" aria-labelledby="sdEffect">
        <h3 id="sdEffect" className="sdSub">Если изменить вес</h3>
        <p className="sdLine"><b className="sdUp">Усилить ↑</b> {t.up}</p>
        <p className="sdLine"><b className="sdDown">Ослабить ↓</b> {t.down}</p>
        <p className="sdLine sdMuted">Вес — относительный: 60 при сумме 100 решает больше, чем 60 при сумме 200. За одно сохранение вес меняется не больше чем на 20.</p>
      </section>
    </article>
  )
}
