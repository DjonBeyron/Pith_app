// Высота растушёвки нижнего края чата (.lessonPlayer::after, styles/player/layout.css).
//
// Читается из самого CSS, а не считается заново: формула там завязана на
// env(safe-area-inset-bottom) и --wait-slot, и повторить её в JS значит завести
// третье место, которое обязано меняться синхронно с двумя другими.
//
// Нужна салюту на верный ответ: без неё частицы рождаются за нижним краем
// экрана и пролетают мимо растушёвки, а должны выныривать из-под неё.
export function chatFadeHeight() {
  const player = typeof document !== 'undefined' && document.querySelector('.lessonPlayer')
  if (!player) return 0
  return parseFloat(getComputedStyle(player, '::after').height) || 0
}
