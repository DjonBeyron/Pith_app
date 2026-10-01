import { preloadSounds, unlockAudio } from '../../shared/lib/sounds.js'
import { primeAudio } from '../../shared/lib/primedAudio.js'

// Звук iOS разрешает только из жеста пользователя. Раньше это делала кнопка «Начать» во
// вступлении повторения; вступления больше нет — зовём в самом тапе, который открывает
// повторение («Повторить», «Закрепить фразу», «Начать повторение» в админке), как
// «Начать урок». Экран повторения грузится лениво и появляется уже после жеста
export function unlockReviewAudio() {
  preloadSounds()
  unlockAudio()
  primeAudio()
}
