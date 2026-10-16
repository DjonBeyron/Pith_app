import { levelVar, levelTitle } from '../../../shared/lib/memory/memoryLevels.js'

// Цветной кружок уровня памяти (цвет и название — только из memoryLevels.js). Нужен в блоке «Слова пользователя»
// и в песочнице; подпись — в title, кружок декоративный
export default function LevelDot({ level }) {
  return <span className="scbLvlDot" style={{ background: levelVar(level) }} title={levelTitle(level)} aria-hidden="true" />
}
