// Голос Мии (прототип, 2026-11-14): второй аккаунт ElevenLabs (секреты ELEVENLABS_API_KEY_MIA и ELEVENLABS_VOICE_ID_MIA, edge-функция tts-elevenlabs, account 'mia').
// ID голоса задаёт СЕКРЕТ ELEVENLABS_VOICE_ID_MIA (менять голос можно в Supabase без выкладки сайта). Free-аккаунт через API пускает только стандартные (default) голоса:
// Elli (MF3mGyEYCl7XYWbV9V6O) оказалась «библиотечной» и дала 402 paid_plan_required, пробуем Sarah (EXAVITQu4vr4xnSDxMaL). Для пафосной манеры стабильность ниже
// (живее интонация), скорость чуть выше. Реплики Пита в эпизоде (pit_*) озвучиваются обычным голосом Пита. voiceOf(id) → настройки для generateSpeech или null.
import { isMiaLine } from './miaLines.js'
import { getAppSetting } from '../../../shared/api/appSettingsApi.js'

export const MIA_VOICE = { account: 'mia', modelId: 'eleven_multilingual_v2', voiceSettings: { stability: 0.4, similarity_boost: 0.8, speed: 1.05 } }
export const MIA_VOICE_KEY = 'race_mia_voice' // app_settings: { voiceId, name } — голос, выбранный в админке («Выбрать голос Мии»); главнее секрета ELEVENLABS_VOICE_ID_MIA

let chosen = null
/** Запомнить выбранный голос ({ voiceId, name } или null): им озвучиваются реплики Мии */
export const setMiaVoice = v => { chosen = v?.voiceId ? { voiceId: String(v.voiceId), name: v.name ?? '' } : null }
export const miaVoiceChosen = () => chosen
/** Прочитать выбранный голос из настроек приложения (ошибка чтения — остаёмся на секрете); → { voiceId, name } | null */
export async function loadMiaVoice(get = getAppSetting) {
  try { setMiaVoice(await get(MIA_VOICE_KEY)) } catch { /* нет доступа к настройкам — голос из секрета */ }
  return chosen
}
export const voiceOf = id => (isMiaLine(id) ? { ...MIA_VOICE, ...(chosen ? { voiceId: chosen.voiceId } : {}) } : null)

/** Голос, который на Free-аккаунте работает через API: стандартный (premade); библиотечные дают 402 paid_plan_required */
export const isFreeVoice = v => v?.category === 'premade'
