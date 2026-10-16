import { sha256Hex } from '../../../shared/lib/sha256.js'
import { isObj } from './sceneConstants.js'

// Голос озвучки в том виде, в каком он уходит в TTS и в hash (вынесено из sceneVoice.js: от него зависят и озвучка целых
// реплик, и озвучка частей шаблонов sceneSegmentsVoice.js). Подробности формата полей озвучки — sceneVoice.js.

export const TTS_MODEL = 'eleven_multilingual_v2'
// 'default' — голос из серверного секрета ELEVENLABS_VOICE_ID (voiceId у персонажа пуст)
export const DEFAULT_VOICE_ID = 'default'
export const VOICE_RANGE = { stability: [0, 1], similarity: [0, 1], speed: [0.7, 1.2] }
export const VOICE_DEFAULTS = { stability: 0.5, similarity: 0.75, speed: 1 }

const num = (v, [lo, hi], dflt) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt)
const str = v => (typeof v === 'string' && v.trim() ? v.trim() : null)

function specWith(v, voiceId) {
  return {
    voiceId,
    stability: num(v.stability, VOICE_RANGE.stability, VOICE_DEFAULTS.stability),
    similarity: num(v.similarity, VOICE_RANGE.similarity, VOICE_DEFAULTS.similarity),
    speed: num(v.speed, VOICE_RANGE.speed, VOICE_DEFAULTS.speed),
    model: TTS_MODEL,
  }
}

// Голос персонажа в том виде, в каком он уходит в TTS и в hash
export function voiceSpec(character) {
  const v = isObj(character?.voice) ? character.voice : {}
  return specWith(v, str(v.voiceId) ?? DEFAULT_VOICE_ID)
}

// Голос озвучки ПЕРЕВОДА: translationVoiceId персонажа → общий options.translationVoiceId сцены →
// 'default' (серверный секрет); настройки (stability/similarity/speed) — как у голоса персонажа
export function translationVoiceSpec(character, scene) {
  const v = isObj(character?.voice) ? character.voice : {}
  return specWith(v, str(v.translationVoiceId) ?? str(scene?.options?.translationVoiceId) ?? DEFAULT_VOICE_ID)
}

// Один и тот же текст тем же голосом с теми же настройками → тот же hash
export function audioHash(text, spec) {
  const s = spec ?? voiceSpec(null)
  return sha256Hex(JSON.stringify([String(text ?? '').trim(), s.voiceId, s.stability, s.similarity, s.speed, s.model]))
}
