import { dur } from './timelineFormat.js'
import { actTitle } from './timelineStageNames.js'

// Сводка по этапам под лентой и под списком пауз: длительность этапа, сколько говорил каждый ведущий, сколько игра молчала (⚠N — долгих пауз). Названия этапов — для админа (actTitle).
export default function TimelineActs({ sum }) {
  return (
    <section className="tlBox" data-testid="tl-acts">
      <h4 className="tlH">По этапам</h4>
      <div className="tlActs">
        <div className="tlAct tlActHead"><span>этап</span><span>длит.</span><span>Пит</span><span>Мия</span><span>диктор</span><span>молчит</span></div>
        {sum.acts.map((a, i) => (
          <div key={i} className="tlAct" data-long={a.longCount ? '1' : '0'}>
            <span className="tlActName">{actTitle(a.act)}</span><span>{dur(a.dur)}</span><span>{dur(a.speak.pit)}</span><span>{dur(a.speak.mia)}</span><span>{dur(a.speak.dictor)}</span><span className="tlActDead">{dur(a.dead)}{a.longCount ? ` ⚠${a.longCount}` : ''}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
