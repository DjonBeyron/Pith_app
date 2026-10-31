// Полоса прогрева озвучки под карточкой игры: тонкий жёлоб с заливкой и подпись «Готовлю звук… 7/15». Вид — как у карточки запуска урока (LaunchProgress.jsx: жёлоб 6 px, заливка #b6fe3b), но свой компонент:
// у LaunchProgress подпись и бар привязаны к «Загрузка урока» и покадровому useSmoothPct. Когда у репетиции из «Памяти» появится LaunchPreloader, она подставит тот же счётчик (useWarmProgress).
export default function WordLaneWarmBar({ wp }) {
  const pct = wp.total ? Math.round((wp.done / wp.total) * 100) : 0
  return (
    <div className="playerRotateWarm" data-testid="rotate-warm" role="status" aria-live="polite">
      <div style={{ height: 6, borderRadius: 3, background: '#333', overflow: 'hidden', marginBottom: 6 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: '#b6fe3b', borderRadius: 3, transition: 'width 0.2s linear' }} />
      </div>
      {wp.label}
    </div>
  )
}
