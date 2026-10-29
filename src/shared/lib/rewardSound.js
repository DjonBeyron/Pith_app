// Настройки звука награды игры «Повтори за диктором» (лесенка из трёх тонов за принятые пилюли): что играть и насколько громко. Меняются в админке «Голос» → «Звуки игры» (GameSoundsBlock.jsx), читаются игрой (player/modules/rotate-phone/wordLaneNotes.js).
//  - `pithy_game_reward_sound_v1`: 'meow' (по умолчанию) — три «мяу» из public/sounds/meow-{1,2,3}.wav (их делает scripts/meow/make_meow.mjs; RMS вдвое ниже прежних нот), 'notes' — прежние синтез-ноты до-ми-соль, 'off' — тишина;
//  - `pithy_game_reward_volume_v1`: 0…1 (по умолчанию 0.5) → audio.volume. На iOS volume у <audio> игнорируется, поэтому там тише сами файлы мяу, а регулятор работает на Android и десктопе.
// Всё в try/catch (приватный режим, нет storage): без хранилища работают значения по умолчанию.
export const REWARD_SOUND_KEY = 'pithy_game_reward_sound_v1'
export const REWARD_VOLUME_KEY = 'pithy_game_reward_volume_v1'
export const REWARD_SOUNDS = ['meow', 'notes', 'off']
export const REWARD_SOUND_DEFAULT = 'meow'
export const REWARD_VOLUME_DEFAULT = 0.5

const readStore = key => { try { return localStorage.getItem(key) } catch { return null } }
const writeStore = (key, value) => { try { localStorage.setItem(key, String(value)) } catch { /* приватный режим */ } }
const snap = n => Math.min(1, Math.max(0, Math.round(n * 20) / 20)) // шаг 0.05

/** 'meow' | 'notes' | 'off'; мусор или пусто → по умолчанию */
export function getRewardSound() {
  const v = readStore(REWARD_SOUND_KEY)
  return REWARD_SOUNDS.includes(v) ? v : REWARD_SOUND_DEFAULT
}
export function setRewardSound(value) {
  if (REWARD_SOUNDS.includes(value)) writeStore(REWARD_SOUND_KEY, value)
}

/** Громкость 0…1 (шаг 0.05); нет значения или мусор → 0.5 */
export function getRewardVolume() {
  const raw = readStore(REWARD_VOLUME_KEY)
  const n = raw === null || raw === '' ? NaN : Number(raw)
  return Number.isFinite(n) ? snap(n) : REWARD_VOLUME_DEFAULT
}
export function setRewardVolume(value) {
  const n = Number(value)
  if (Number.isFinite(n)) writeStore(REWARD_VOLUME_KEY, snap(n))
}
