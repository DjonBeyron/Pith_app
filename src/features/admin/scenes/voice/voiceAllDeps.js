// Общие для useSceneVoice/useVoiceAll реэкспорты, чтобы оба хука брали генерацию и порядок
// наборов из одного места (react-refresh: хуки экспортируют только хуки)
export { generateSetAudio, removeOrphan, clearAudioPatch, defaultDeps, ttsRequest } from './voiceGenerate.js'
export const AUDIO_SETS_ORDER = ['original', 'translation']
