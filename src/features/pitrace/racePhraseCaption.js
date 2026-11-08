// Подпись над лентой этапа «Фразы» (racePhraseScene.js): смысл, когда его озвучки нет, и подпись неозвученной реплики Пита. Один узел .racePhraseRu на сцену, меняется только текст и data-on (opacity, word-lane-wide.css).
/** Подпись смысла над лентой (один узел на сцену, только opacity) */
export function caption(root) {
  const doc = root?.ownerDocument
  const el = doc?.createElement?.('div')
  if (el) { el.className = 'racePhraseRu'; el.setAttribute('data-testid', 'race-phrase-ru'); root.appendChild(el) }
  return { show: text => { if (!el) return; el.textContent = text ?? ''; if (text) el.setAttribute('data-on', ''); else el.removeAttribute('data-on') }, remove: () => el?.remove() }
}
