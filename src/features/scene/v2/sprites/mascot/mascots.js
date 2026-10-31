import kit from './kit.json' with { type: 'json' }
import mia from './mia.json' with { type: 'json' }
import mia2 from './mia2.json' with { type: 'json' }

// Маскоты (скины персонажей конструктора сцен): пакеты из scripts/mascot → sprites/mascot/*.json.
// skin персонажа ('kit' | 'mia' | 'mia2') выбирает пакет вместо обычного кота; состояния мимики — это лицо целиком
// (глаза, брови, декор, рот в покое, наклон головы, реакция зрачка), реплика выбирает состояние полем face / react.
// Имена (решение владельца, 2026-10-31): 'mia' — прежняя серая кошка, теперь Кетти (id не менялся: он записан в сохранённых сценах); 'mia2' — новая Мия (серая кошка по чистому образцу).

export const MASCOT_PACKS = { kit, mia, mia2 }
export const SKINS = Object.keys(MASCOT_PACKS)
export const BASE_FACE = 'base'

// Цвет шерсти — для метки говорящего в сборщике (у маскота палитры нет)
export const SKIN_COLORS = { kit: '#bc82fa', mia: '#98a1b3', mia2: '#646774' }

export const SKIN_TITLES = { kit: 'Пит', mia: 'Кетти (светло-серая кошка)', mia2: 'Мия (тёмно-серая кошка)' }

// Что означает состояние — для подсказок в сборщике и легенде ИИ
export const FACE_NOTES = {
  kit: {
    base: 'обычное лицо',
    pretend: 'делает вид, что всё нормально (румянец, взгляд в сторону)',
    shy: 'отводит взгляд (смущён, румянец, капля)',
    love: 'влюблён (сердечки в зрачках, румянец, сердечки вокруг)',
    bliss: 'блаженство (закрытые глаза, румянец, сердечки)',
  },
  mia: {
    base: 'обычное лицо',
    roll: 'закатила глаза',
    smirk: 'ухмылка',
    pathos: 'пафос (приподнятые брови, довольный вид)',
    sneer: 'презрение (прищур, сжатый зрачок)',
    interest: 'увлечена (зрачок-щель расширяется)',
  },
  mia2: {
    base: 'обычное лицо',
    roll: 'закатила глаза',
    smirk: 'ухмылка',
    pathos: 'пафос (полуприкрытые веки, приподнятые брови, довольный вид)',
    sneer: 'презрение (прищур со скосом к носу, брови сдвинуты)',
    interest: 'увлечена (зрачок круглеет)',
  },
}

export function isSkin(v) { return typeof v === 'string' && Object.hasOwn(MASCOT_PACKS, v) }
export function facesOf(skin) { return isSkin(skin) ? Object.keys(MASCOT_PACKS[skin].states) : [] }
export function isFaceOf(skin, face) { return facesOf(skin).includes(face) }
