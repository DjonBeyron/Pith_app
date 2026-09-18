// Единый нижний блок карточки запуска: строка о прошлом прогрессе + полоса +
// основная кнопка + кнопка-призрак «Начать заново». Раньше это было ДВЕ
// разные вёрстки (одна кнопка «Начать урок» инлайн-стилями / отдельная
// ResumeChoiceRow с 4 элементами) плюс попытка сравнять их высоту числом
// (CTA_MIN_HEIGHT) — число регулярно расходилось с тем, что реально рисовал
// браузер (шрифт/переносы), карточка всё равно «прыгала». Теперь используется
// ОДНА и та же структура/классы — и в каркасе (LaunchSkeleton, пока не
// известно, будет ли «Продолжить»), и в готовом содержимом (что бы ни
// решилось) — высота совпадает пиксель-в-пиксель, потому что это буквально
// один и тот же DOM, не подогнанная под него оценка. Второй ряд (строка
// процента + полоса + кнопка-призрак) — showSecondRow=false прячет его через
// visibility:hidden (не display:none — место всё равно остаётся занятым)
export default function LaunchCtaSlot({
  showSecondRow = false, pctLabel = '', pct = 0,
  primaryLabel, primaryClassName, primaryStyle, primaryDisabled = false, onPrimary,
  onGhost, ghostLabel = 'Начать заново',
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* nowrap+ellipsis — не про красоту, а про высоту: без этого строка
          «В прошлый раз ты дошёл примерно до X%» переносится на 2 строки на
          узких карточках, а короткая заглушка каркаса — в 1, и высота блока
          расходится (та же ловушка, что уже была с пустым pctLabel) */}
      <span style={{
        color: '#9aa0b4', fontSize: 13, visibility: showSecondRow ? 'visible' : 'hidden',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {pctLabel}
      </span>
      <div className="resumeLessonBar" style={{ visibility: showSecondRow ? 'visible' : 'hidden' }}>
        <div className="resumeLessonBarFill" style={{ width: `${pct}%` }} />
      </div>
      <button
        className={primaryClassName}
        onClick={onPrimary}
        disabled={primaryDisabled}
        style={primaryStyle}
      >
        {primaryLabel}
      </button>
      <button
        className="resumeLessonBtnGhost"
        onClick={onGhost}
        style={{ visibility: showSecondRow ? 'visible' : 'hidden' }}
      >{ghostLabel}</button>
    </div>
  )
}
