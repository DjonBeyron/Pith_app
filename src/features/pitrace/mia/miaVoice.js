// Голос Мии (прототип, 2026-11-14): второй аккаунт ElevenLabs (секреты ELEVENLABS_API_KEY_MIA и ELEVENLABS_VOICE_ID_MIA, edge-функция tts-elevenlabs, account 'mia').
// ID голоса задаёт СЕКРЕТ ELEVENLABS_VOICE_ID_MIA (менять голос можно в Supabase без выкладки сайта). Free-аккаунт через API пускает только стандартные (default) голоса:
// Elli (MF3mGyEYCl7XYWbV9V6O) оказалась «библиотечной» и дала 402 paid_plan_required, пробуем Sarah (EXAVITQu4vr4xnSDxMaL). Для пафосной манеры стабильность ниже
// (живее интонация), скорость чуть выше. Реплики Пита в эпизоде (pit_*) озвучиваются обычным голосом Пита. voiceOf(id) → настройки для generateSpeech или null.
import { isMiaLine } from './miaLines.js'

export const MIA_VOICE = { account: 'mia', modelId: 'eleven_multilingual_v2', voiceSettings: { stability: 0.4, similarity_boost: 0.8, speed: 1.05 } }
export const voiceOf = id => (isMiaLine(id) ? MIA_VOICE : null)
