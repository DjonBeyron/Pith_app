// Громкость голоса (0…1) → форма рта кота-маскота (closed / half / open, mouthDriver.setMouth). Пороги с запасом: тихий шум рот не открывает, обычная речь — половина, громкая — широко.
export const OPEN_AT = 0.42
export const HALF_AT = 0.12

export const mouthShape = level => (level >= OPEN_AT ? 'open' : level >= HALF_AT ? 'half' : 'closed')
