import { useState, lazy, Suspense } from 'react'
import { lazyRetry } from '../../../shared/lib/lazyRetry.js'
import { useFeedSignals } from '../../../shared/lib/ranking/feedSignalsStore.js'
import { liveSignals } from '../../../shared/lib/ranking/signalRegistry.js'
import { ENGINE_LABEL } from './signalTexts.js'
import '../../../styles/admin-signals.css'

// Код-сплиттинг: окно тянет предпросмотр и историю — грузится только по кнопке
const SignalsWindow = lazy(() => lazyRetry(() => import('./SignalsWindow.jsx'), 'signals-window'))

const fmt = iso => {
  if (!iso) return 'ещё не сохранялась (дефолт)'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Админ → «Сигналы»: карточка текущего состояния движка ленты и кнопка в
// полноэкранное окно «Сигналы ленты» (SignalsWindow). learnView — память админа из ShellV2.
export default function AdminSignalsTab({ learnView }) {
  const cfg = useFeedSignals()
  const [open, setOpen] = useState(false)
  const liveOn = liveSignals().filter(s => cfg.signals[s.id]?.enabled).length

  return (
    <div className="aeWrap">
      <div className="aeHead"><span className="aeTitle">Движок порядка ленты</span></div>
      <div className={`asCard${cfg.engine === 'weighted' ? ' asCardW' : ''}`}>
        <div className="asRow"><span className="asKey">Режим</span><span className="asVal"><b>{cfg.engine}</b> — {ENGINE_LABEL[cfg.engine]}</span></div>
        <div className="asRow"><span className="asKey">Версия</span><span className="asVal">{fmt(cfg.updatedAt)}{cfg.updatedBy ? ` · ${cfg.updatedBy}` : ''}</span></div>
        {cfg.note && <div className="asRow"><span className="asKey">Заметка</span><span className="asVal">«{cfg.note}»</span></div>}
        <div className="asRow"><span className="asKey">Сигналы</span><span className="asVal">включено живых {liveOn} из {liveSignals().length}</span></div>
        <button className="asOpen" onClick={() => setOpen(true)}>Открыть окно «Сигналы ленты»</button>
      </div>
      <p className="aeHint">В окне: все сигналы по группам с тумблерами и весами, карточка каждого, предпросмотр ленты по черновику, история версий и откат, JSON для правки нейросетью.</p>
      {open && (
        <Suspense fallback={<p className="aeHint">Загрузка окна…</p>}>
          <SignalsWindow learnView={learnView} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </div>
  )
}
