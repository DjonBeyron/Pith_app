import { stamp, dur } from './timelineFormat.js'
import { pauseWhere } from './timelineReport.js'

// Под лентой: «Самые долгие паузы» (игра молчит дольше порога; нажатие прокручивает ленту к паузе) и сводка по этапам — длительность, сколько говорил каждый ведущий, сколько игра молчала.
export default function TimelinePauses({ top, sum, onGo }) {
  return (
    <div className="tlUnder">
      <section className="tlBox" data-testid="tl-top">
        <h4 className="tlH">Самые долгие паузы — игра молчит</h4>
        {!top.length && <p className="tlMuted">Долгих пауз нет: никто не молчал дольше порога, когда игрока не ждали.</p>}
        {top.map((p, i) => (
          <button key={i} type="button" className="tlTopRow" onClick={() => onGo(p)}>
            <b className="tlTopMs">{dur(p.ms)}</b><span className="tlTopT">{stamp(p.t)}</span><span className="tlTopWhere">{pauseWhere(p)}</span>
          </button>
        ))}
      </section>
      <section className="tlBox" data-testid="tl-acts">
        <h4 className="tlH">По этапам</h4>
        <div className="tlActs">
          <div className="tlAct tlActHead"><span>этап</span><span>длит.</span><span>Пит</span><span>Мия</span><span>диктор</span><span>молчит</span></div>
          {sum.acts.map((a, i) => (
            <div key={i} className="tlAct" data-long={a.longCount ? '1' : '0'}>
              <span className="tlActName">{a.title || a.act || '—'}</span><span>{dur(a.dur)}</span><span>{dur(a.speak.pit)}</span><span>{dur(a.speak.mia)}</span><span>{dur(a.speak.dictor)}</span><span className="tlActDead">{dur(a.dead)}{a.longCount ? ` ⚠${a.longCount}` : ''}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
