import { preloadSounds, unlockAudio } from './sounds.js'
import { primeAudio } from './primedAudio.js'

// Всё, что нужно сделать В САМОМ ЖЕСТЕ, открывающем урок без карточки
// запуска (канвас: ▶ в шапке и «играть с этой ноды», превью карточки
// повторения). Карточка запуска (LaunchPreloader.jsx) и повторение
// (reviewLaunch.js) делают то же у себя. Без этого на iOS звуки интерфейса
// (они идут из таймеров, не из жеста) и авто-таблица молчат весь урок
export function unlockLessonAudio() {
  preloadSounds()
  unlockAudio()
  primeAudio()
}
