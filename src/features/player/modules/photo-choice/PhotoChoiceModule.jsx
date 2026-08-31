import { useState, useEffect, useRef } from 'react'
import Confetti from '../../../../shared/ui/Confetti.jsx'

const PHOTO_COLORS = [
  '#6366f1','#ec4899','#f59e0b','#10b981',
  '#3b82f6','#ef4444','#8b5cf6','#14b8a6',
  '#f97316','#06b6d4','#84cc16','#a855f7',
]

function usePhotoSrc(ph, lessonFiles = []) {
  const [src, setSrc] = useState(null)
  useEffect(() => {
    // Синхронизация src с файлом/blob-URL — осознанный setState в эффекте
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!ph) { setSrc(null); return }
    if (ph.fileId) {
      const f = lessonFiles.find(lf => lf.id === ph.fileId)
      if (f?.blobUrl) { setSrc(f.blobUrl); return }
      if (f?.localFile) {
        const u = URL.createObjectURL(f.localFile)
        setSrc(u)
        return () => URL.revokeObjectURL(u)
      }
      if (f?.r2Url) { setSrc(f.r2Url); return }
    }
    if (ph.photoUrl) { setSrc(ph.photoUrl); return }
    setSrc(null)
  }, [ph, lessonFiles])
  return src
}

export default function PhotoChoiceModule({ node, lessonFiles, photoChoiceState, photoXpPending = 0, onPhotoXpFired }) {
  const photos   = node.typeData?.photo_choice?.photos ?? []
  const selected = photoChoiceState?.selected ?? null
  const photo    = selected != null ? (photos[selected] ?? null) : null
  const src      = usePhotoSrc(photo, lessonFiles)  // must be before any early return
  const photoRef = useRef(null)
  const xpFired  = useRef(false)

  // Fire XP from the photo bubble in the chat (not from the gallery tile)
  useEffect(() => {
    if (!photoChoiceState || photoChoiceState.result !== 'correct') return
    if (!photoXpPending || xpFired.current) return
    xpFired.current = true
    const rect = photoRef.current?.getBoundingClientRect()
    if (rect) onPhotoXpFired?.(rect)
  }, [photoChoiceState, photoXpPending]) // eslint-disable-line

  if (!photoChoiceState || selected == null) return null

  const { result } = photoChoiceState
  const isOk  = result === 'correct'

  return (
    <div className="playerMsgRow playerMsgRowRight">
      {/* Тот же салют, что у прочих верных ответов (Confetti.jsx) */}
      {isOk && <Confetti mode="burst" count={30} refill={false} size={4} />}
      <div>
        <div
          ref={photoRef}
          className={`pcAnswerPhoto ${isOk ? 'pcAnswerPhotoOk' : 'pcAnswerPhotoErr'}`}
          style={src ? {} : { background: PHOTO_COLORS[selected % PHOTO_COLORS.length] }}
        >
          {src
            ? <img src={src} className="pcAnswerImg" alt="" />
            : <span className="pcAnswerIdx">{selected + 1}</span>
          }
        </div>
      </div>
    </div>
  )
}
