import { useState } from 'react'

export const MEDIA_LABEL = {
  photo:            'Фото',
  video:            'Видео',
  circle:           'Видеосообщение',
  sticker:          'Стикер',
  audio:            'Голосовое сообщение',
  voice_record:     'Голосовое сообщение',
  word_choice:      'Выбор слова',
  photo_choice:     'Выбор фото',
  phrase_assembly:  'Собрать фразу',
}

const REPLY_THEME = {
  default:   { border: '#b6fe3b', bg: 'rgba(182,254,59,0.07)',  name: '#b6fe3b', text: null },
  correct:   { border: '#4ade80', bg: 'rgba(74,222,128,0.07)',  name: '#9aa0b4', text: '#4ade80' },
  incorrect: { border: '#f87171', bg: 'rgba(248,113,113,0.07)', name: '#9aa0b4', text: '#f87171' },
}

// Player frame reference dimensions
const PLAYER_FW      = 200
const PLAYER_FH_VID  = PLAYER_FW * 12 / 9
const PLAYER_FH_CIRC = PLAYER_FW

const THUMB_H = 36
function thumbDims(type) {
  if (type === 'circle' || type === 'sticker') return { w: THUMB_H, h: THUMB_H }
  return { w: Math.round(THUMB_H * 9 / 12), h: THUMB_H }
}
function playerFH(type) {
  return type === 'circle' ? PLAYER_FH_CIRC : PLAYER_FH_VID
}
function cropK(type) { return THUMB_H / playerFH(type) }

function getThumbSrc(node, lessonFiles) {
  if (!node) return null
  const fileId = node.typeData?.[node.type]?.file_id
  if (!fileId) return null
  const file = lessonFiles.find(f => f.id === fileId)
  if (!file) return null
  if (node.type === 'photo') return file.blobUrl ?? file.r2Url ?? null
  return file.posterUrl ?? file.blobUrl ?? file.r2Url ?? null
}

function ReplyThumb({ type, src, crop = { x: 0, y: 0, scale: 1 } }) {
  const [natural, setNatural] = useState(null)
  const isSticker = type === 'sticker'
  const isCircle  = type === 'circle'
  const dims      = thumbDims(type)
  const K         = cropK(type)
  const radius    = isCircle ? '50%' : isSticker ? 4 : 5

  function imgStyle() {
    if (isSticker || !natural) {
      return { width: '100%', height: '100%', objectFit: isSticker ? 'contain' : 'cover' }
    }
    const ma = natural.w / natural.h
    const fa = dims.w / dims.h
    const d  = ma > fa
      ? { w: dims.h * ma, h: dims.h }
      : { w: dims.w, h: dims.w / ma }
    return {
      position: 'absolute', left: '50%', top: '50%',
      width: d.w, height: d.h,
      transform: `translate(calc(-50% + ${crop.x * K}px), calc(-50% + ${crop.y * K}px)) scale(${crop.scale})`,
      transformOrigin: 'center center',
    }
  }

  return (
    <div style={{ width: dims.w, height: dims.h, flexShrink: 0, overflow: 'hidden', position: 'relative', borderRadius: radius }}>
      <img src={src} alt="" onLoad={e => setNatural({ w: e.target.naturalWidth, h: e.target.naturalHeight })} style={imgStyle()} />
    </div>
  )
}

// For phrase_assembly: pick the correct attempt if exists, otherwise last wrong.
function resolvePhraseAttempt(attempts) {
  if (!attempts?.length) return { text: null, result: null }
  const correct = attempts.find(a => a.result === 'correct')
  if (correct) return correct
  return attempts[attempts.length - 1]
}

// Resolves display properties for a reply block given the target node and choice states.
export function resolveReply(replyNode, teacherName, allWordChoiceStates, allPhotoChoiceStates, allPhraseStates) {
  if (!replyNode) return null
  const rType = replyNode.type
  if (rType === 'word_choice') {
    const st = allWordChoiceStates?.[replyNode.id]
    return {
      name:  'Вы:',
      label: st?.text || MEDIA_LABEL.word_choice,
      theme: st?.result === 'correct' ? REPLY_THEME.correct
           : st?.result === 'wrong'   ? REPLY_THEME.incorrect
           : REPLY_THEME.default,
      thumbSrc: null, crop: null,
    }
  }
  if (rType === 'phrase_assembly') {
    const attempt = resolvePhraseAttempt(allPhraseStates?.[replyNode.id])
    return {
      name:  'Вы:',
      label: attempt.text || MEDIA_LABEL.phrase_assembly,
      theme: attempt.result === 'correct' ? REPLY_THEME.correct
           : attempt.result === 'wrong'   ? REPLY_THEME.incorrect
           : REPLY_THEME.default,
      thumbSrc: null, crop: null,
    }
  }
  if (rType === 'photo_choice') {
    const st = allPhotoChoiceStates?.[replyNode.id]
    return {
      name:  'Вы:',
      label: MEDIA_LABEL.photo_choice,
      theme: st?.result === 'correct' ? REPLY_THEME.correct
           : st?.result === 'wrong'   ? REPLY_THEME.incorrect
           : REPLY_THEME.default,
      thumbSrc: null, crop: null,
    }
  }
  return {
    name:     teacherName || 'Учитель',
    label:    MEDIA_LABEL[rType] ?? replyNode.typeData?.[rType]?.content ?? '',
    theme:    REPLY_THEME.default,
    thumbSrc: null,
    crop:     replyNode.typeData?.[rType]?.crop ?? { x: 0, y: 0, scale: 1 },
  }
}

// Renders the reply preview block (green left-bar style).
export default function ReplyPreview({ replyNode, lessonFiles, teacherName, allWordChoiceStates, allPhotoChoiceStates, allPhraseStates }) {
  if (!replyNode) return null
  const r = resolveReply(replyNode, teacherName, allWordChoiceStates, allPhotoChoiceStates, allPhraseStates)
  if (!r) return null
  const thumbSrc = r.thumbSrc ?? getThumbSrc(replyNode, lessonFiles)
  return (
    <div className="playerReply" style={{ borderLeftColor: r.theme.border, background: r.theme.bg }}>
      <div className="playerReplyContent">
        <span className="playerReplyName" style={{ color: r.theme.name }}>{r.name}</span>
        <p className="playerReplyText" style={r.theme.text ? { color: r.theme.text } : undefined}>{r.label}</p>
      </div>
      {thumbSrc && <ReplyThumb type={replyNode.type} src={thumbSrc} crop={r.crop} />}
    </div>
  )
}
