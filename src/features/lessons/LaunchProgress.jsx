// Блок прогресса карточки запуска: жёлоб с заливкой + подпись под ним.
// Вынесено из LaunchPreloader.jsx (тот подходил к мягкому лимиту).
//
// choosing — карточка с чекпойнтом, выбор «Продолжить / Сначала» ещё не
// сделан: нужные файлы ещё не греются, и процент показывать нечего — вместо
// бара небольшой спиннер (CSS-анимация, без JS). Бар с процентами — только
// после выбора, когда прогрев целится в выбранную точку. Ряд спиннера той же
// высоты, что жёлоб (6px, launch-progress.css), сам кружок центрирован и
// выступает в зазоры — высота карточки при смене спиннер→бар не меняется.
//
// Ширину заливки и цифру ведёт useSmoothPct прямо в DOM (barRef/textRef),
// покадрово и без ре-рендеров; в JSX — только стартовые «0%», React их не
// перезаписывает. Без transition: покадровая запись сама и есть анимация.
// Слово то же, что в каркасе до загрузки сценария («Загрузка урока…»):
// подмена «Загрузка» → «Подготовка» на полпути читалась как смена этапа
export default function LaunchProgress({ choosing, canStart, barRef, textRef }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {choosing ? (
        <div className="launchSpinnerRow"><span className="launchSpinner" /></div>
      ) : (
        <div style={{ height: 6, borderRadius: 3, background: '#333', overflow: 'hidden' }}>
          <div ref={barRef} style={{ height: '100%', borderRadius: 3, width: '0%', background: '#b6fe3b' }} />
        </div>
      )}
      <span style={{ color: '#888', fontSize: 12 }}>
        {choosing
          ? 'Продолжить с того места или начать заново?'
          : canStart
            ? 'Урок готов к запуску'
            : <>Загрузка урока: <span ref={textRef}>0%</span></>}
      </span>
    </div>
  )
}
