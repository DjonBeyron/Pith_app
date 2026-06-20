import { createContext, useContext } from 'react'

// Provides registerForAudioUnlock(callback) to child modules.
// LessonPlayer calls all registered callbacks synchronously on the first
// user gesture (tap), giving them iOS user-gesture context for unmuted play.
export const MediaUnlockContext = createContext(null)
export const useMediaUnlock = () => useContext(MediaUnlockContext)
