import { useEffect, useMemo, useRef } from 'react'
import { listenBlocks } from './timelineListen.js'
import { useListenQueue } from './useListenQueue.js'
import { dur } from './timelineFormat.js'

// Вкладка «Прослушать» экрана «Таймлайн игры» (v3.3.357, владелец: «режим, в котором можно просто без пауз, чисто блоками прослушать озвучку в той последовательности, как они будут в игре; только для админа»):
// реплики «Встряхни память» по блокам (стадиям) в порядке прохождения; «▶ Блок» играет только этот блок, «▶ Весь сценарий» — всё подряд; клип стартует сразу после предыдущего (listenQueue.js), без пауз
// игры. Нажатие на реплику — играть блок с неё. Звук — из ТЕКУЩИХ настроек реплик и библиотеки слов (как карточка клипа), реплики без озвучки пропускаются и помечены. audio — useClipAudio (null — звука нет).
const WHO = { pit: 'Пит', mia: 'Мия', dictor: 'диктор' }
const RATES = [1, 1.25, 1.5]

export default function TimelineListen({ m, audio, make }) {
  const q = useListenQueue(make)
  const blocks = useMemo(() => listenBlocks(m, audio?.of), [m, audio?.of])
  const flat = useMemo(() => blocks.flatMap(b => b.items.filter(x => x.url).map(x => ({ key: x.key, url: x.url, block: b.key }))), [blocks])
  const live = q.st.status === 'playing' || q.st.status === 'loading' || q.st.status === 'paused'
  const nowRef = useRef(null)
  useEffect(() => { nowRef.current?.scrollIntoView?.({ block: 'nearest' }) }, [q.st.key])
  if (!audio) return <p className="tlMuted" data-testid="tl-listen-off">Звука на этом экране нет — прослушивание недоступно.</p>
  const playFrom = (items, key) => { audio.stop(); const i = key ? items.findIndex(x => x.key === key) : 0; q.start(items, Math.max(0, i)) }
  const blockItems = b => flat.filter(x => x.block === b.key)
  const total = blocks.reduce((a, b) => a + b.sec, 0)
  const nowIdx = q.st.index >= 0 ? q.st.index + 1 : 0
  return (
    <div className="tlListen" data-testid="tl-listen">
      <div className="tlListenBar">
        <button type="button" className="tlBtn" onClick={() => playFrom(flat)} disabled={!flat.length} data-testid="tl-listen-all">▶ Весь сценарий подряд ({dur(total * 1000)})</button>
        {live && <button type="button" className="tlBtn" onClick={() => (q.st.status === 'paused' ? q.resume() : q.pause())} data-testid="tl-listen-pause">{q.st.status === 'paused' ? '▶ Дальше' : '⏸ Пауза'}</button>}
        {live && <button type="button" className="tlBtn" onClick={q.prev} aria-label="Предыдущая реплика">⏮</button>}
        {live && <button type="button" className="tlBtn" onClick={q.next} aria-label="Следующая реплика">⏭</button>}
        {live && <button type="button" className="tlBtn" onClick={q.stop} data-testid="tl-listen-stop">■ Стоп (Esc)</button>}
        <span className="tlGroup" role="radiogroup" aria-label="Скорость">{RATES.map(r => <button key={r} type="button" role="radio" aria-checked={q.rate === r} className="tlChip" onClick={() => q.setRate(r)}>{String(r).replace('.', ',')}×</button>)}</span>
        {live && <span className="tlMuted" data-testid="tl-listen-now">реплика {nowIdx} из {q.st.total}</span>}
      </div>
      {q.st.status === 'error' && <p className="tlRed" role="status">{q.st.error}</p>}
      {q.st.skipped.length > 0 && <p className="tlRed" role="status">не загрузились и пропущены: {q.st.skipped.length}</p>}
      {!blocks.length && <p className="tlMuted">В этом прохождении нет реплик «Встряхни память» для прослушивания.</p>}
      {blocks.map(b => (
        <section key={b.key} className="tlLBlock" data-testid="tl-listen-block">
          <header className="tlLHead">
            <b>{b.title}</b>
            <span className="tlMuted">{b.playable} из {b.items.length} с озвучкой · {dur(b.sec * 1000)}</span>
            <button type="button" className="tlBtn tlLGo" disabled={!b.playable} onClick={() => playFrom(blockItems(b))} data-testid="tl-listen-block-play">▶ Блок</button>
          </header>
          <ol className="tlLList">
            {b.items.map(x => {
              const on = q.st.key === x.key && live
              return (
                <li key={x.key} ref={on ? nowRef : null} className={`tlLItem${on ? ' tlLOn' : ''}`} data-who={x.line.who} data-has={x.url ? '1' : '0'}>
                  <button type="button" className="tlLLine" disabled={!x.url} onClick={() => playFrom(blockItems(b), x.key)} title={x.url ? 'Играть блок с этой реплики' : x.why}>
                    <i className="tlLWho">{WHO[x.line.who]}</i> <span>{x.line.text || x.line.id}</span>
                    {!x.url && <em className="tlMuted"> · нет озвучки</em>}
                  </button>
                </li>
              )
            })}
          </ol>
        </section>
      ))}
    </div>
  )
}
