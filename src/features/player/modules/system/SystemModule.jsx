import { useEffect } from 'react'

export default function SystemModule({ node, onDone }) {
  useEffect(() => { onDone?.() }, []) // eslint-disable-line
  const content = node.typeData?.system?.content ?? ''
  return (
    <div className="playerMsgRow pinSystemRow">
      <span className="pinSystemText">{content}</span>
    </div>
  )
}
