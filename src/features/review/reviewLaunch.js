import { preloadSounds, unlockAudio } from '../../shared/lib/sounds.js'
import { primeAudio } from '../../shared/lib/primedAudio.js'

// Что нужно сделать до того, как повторение откроется, — в самом тапе, который его открывает
// («Повторить», «Закрепить фразу», «Повторить сейчас», «Начать повторение» в админке).
//
// Звук iOS разрешает только из жеста пользователя: раньше это делала кнопка «Начать» во
// вступлении, вступления больше нет. Экран повторения грузится лениво и появляется уже после жеста.
export function unlockReviewAudio() {
  preloadSounds()
  unlockAudio()
  primeAudio()
}

// Чанк экрана повторения тяжёлый (в нём весь плеер): по тапу он качался несколько секунд, и
// на экране ничего не происходило. Теперь его подтягивают заранее, как только открыта вкладка
// «Память», а пока он всё же грузится — показывается ReviewLaunching («Ищу слова…»)
export const loadReviewScreen = () => import('./ReviewScreen.jsx')

export function prefetchReviewScreen() {
  const run = () => { loadReviewScreen().catch(() => {}) }
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 3000 })
  else setTimeout(run, 800)
}
