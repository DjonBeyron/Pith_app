// Счётчики под одной сценой стенда сравнения (данные — useStandMetrics.js): узлы, анимации в тишине и при речи, статус режиссёра.
// side — { nodes, mascot, anims, running, silence, speech, pitSilence, pitSpeech, status } | undefined (замер ещё не пришёл)
export default function StandCounters({ id, side }) {
  const s = side ?? { nodes: 0, mascot: 0, anims: 0, running: 0, silence: 0, speech: 0, pitSilence: 0, pitSpeech: 0, status: '…' }
  return (
    <dl className="cmpCounters" data-testid={`cmp-${id}-counters`}>
      <dt>Узлов в сцене / в Пите</dt><dd data-k="nodes">{s.nodes} / {s.mascot}</dd>
      <dt>Анимации Пита: тишина / речь</dt><dd data-k="pit">{s.pitSilence} / {s.pitSpeech}</dd>
      <dt>Анимации сцены: тишина / речь</dt><dd data-k="scene">{s.silence} / {s.speech}</dd>
      <dt>Сейчас (бегут / всего)</dt><dd data-k="now">{s.running} / {s.anims}</dd>
      <dt>Статус</dt><dd data-k="status">{s.status}</dd>
    </dl>
  )
}
