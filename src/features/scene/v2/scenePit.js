import { PALETTE_PRESETS, isObj } from './sceneConstants.js'

// Сцена с ОДНИМ котом — «Пит» (имя рабочее). Формат: characters: { a } без b
// (не флаг): старые сцены с двумя котами не меняются, а одиночная узнаётся по
// отсутствию b. Одиночный кот — всегда персонаж a; все реплики — who: 'a'
// (who: 'b' у одиночной сцены — ошибка валидатора). Где используется: кружок Пита
// открывает и закрывает урок (1–2 реплики, mode 'circle' ноды scene; план Б1/Б2 в PROJECT.md).

// Внешность и голос Пита по умолчанию = умолчания персонажа a (sceneSchemaV2.normalizeCharacter)
export const PIT = Object.freeze({
  kind: 'cat', gender: 'male', name: 'Пит',
  palette: { ...PALETTE_PRESETS.ginger }, stripes: true,
  voice: { pitch: 1, rate: 1 },
})

// Копия Пита для черновика (не замороженная — формы сборщика правят поля)
export function pitCharacter() {
  return { ...PIT, palette: { ...PIT.palette }, voice: { ...PIT.voice } }
}

// Одиночная сцена: characters — объект с a и БЕЗ b. Пустой объект / не объект → не одиночная
// (нормализация достроит обоих котов, как раньше; валидатор ругнётся сам)
export function isSolo(scene) {
  const chars = scene?.characters
  return isObj(chars) && chars.a !== undefined && chars.b === undefined
}

// Кто может говорить в сцене: ['a'] у одиночной, ['a', 'b'] у обычной
export function speakersOf(scene) {
  return isSolo(scene) ? ['a'] : ['a', 'b']
}
