// Голос Мии (прототип, 2026-11-14): второй аккаунт ElevenLabs (секреты ELEVENLABS_API_KEY_MIA / ELEVENLABS_VOICE_ID_MIA, edge-функция tts-elevenlabs, account 'mia'),
// голос Elli (бесплатный premade, русский читает с акцентом моделью Multilingual v2). Для пафосной манеры стабильность ниже (живее интонация), скорость чуть выше. Реплики Пита
// в эпизоде (pit_*) озвучиваются обычным голосом Пита. voiceOf(id) → настройки голоса для generateSpeech или null (голос по умолчанию).
import { isMiaLine } from './miaLines.js'

export const ELLI_VOICE_ID = 'MF3mGyEYCl7XYWbV9V6O'
export const MIA_VOICE = { account: 'mia', voiceId: ELLI_VOICE_ID, modelId: 'eleven_multilingual_v2', voiceSettings: { stability: 0.4, similarity_boost: 0.8, speed: 1.05 } }
export const voiceOf = id => (isMiaLine(id) ? MIA_VOICE : null)
