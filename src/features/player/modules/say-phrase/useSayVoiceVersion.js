import { useSyncExternalStore } from 'react'
import { sayVoices } from '../../../../shared/lib/speech/sayVoiceStore.js'

// Подписка пузырей на реестр голосовых: клип выселен лимитом / отозван шагом назад / урок закрыт — пузыри перерисовываются и тихо становятся «только текст»
export const useSayVoiceVersion = () => useSyncExternalStore(sayVoices.subscribe, sayVoices.getVersion, sayVoices.getVersion)
