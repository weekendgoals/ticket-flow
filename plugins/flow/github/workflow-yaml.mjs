function scalar(raw) {
  const value = raw.trim()
  if (value.startsWith('[') && value.endsWith(']'))
    return value
      .slice(1, -1)
      .split(',')
      .map((item) => scalar(item))
      .filter((item) => item !== '')
  if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) return value.slice(1, -1)
  if (value === 'true' || value === 'false') return value === 'true'
  if (/^\d+$/.test(value)) return Number(value)
  return value
}

export function parseYaml(source) {
  const lines = source
    .split('\n')
    .map((line) => ({ indent: line.length - line.trimStart().length, text: line.trim() }))
    .filter((line) => line.text && !line.text.startsWith('#'))
  let index = 0
  const blockScalar = (parentIndent) => {
    const collected = []
    while (index < lines.length && lines[index].indent > parentIndent) collected.push(lines[index++].text)
    return collected.join('\n')
  }
  const value = (rest, indent) => {
    if (rest === '|' || rest === '>-' || rest === '>') return blockScalar(indent)
    if (rest === '') return index < lines.length && lines[index].indent > indent ? block(lines[index].indent) : null
    return scalar(rest)
  }
  const mappingEntry = (target, entryText, indent) => {
    const at = entryText.indexOf(':')
    const key = entryText.slice(0, at).trim()
    target[key] = value(entryText.slice(at + 1).trim(), indent)
  }
  const block = (indent) => {
    if (lines[index].text.startsWith('- ')) {
      const list = []
      while (index < lines.length && lines[index].indent === indent && lines[index].text.startsWith('- ')) {
        const itemText = lines[index].text.slice(2)
        index++
        if (/^[\w.-]+:(\s|$)/.test(itemText)) {
          const item = {}
          mappingEntry(item, itemText, indent + 2)
          while (index < lines.length && lines[index].indent === indent + 2) {
            const line = lines[index++]
            mappingEntry(item, line.text, indent + 2)
          }
          list.push(item)
        } else list.push(scalar(itemText))
      }
      return list
    }
    const mapping = {}
    while (index < lines.length && lines[index].indent === indent) {
      const line = lines[index++]
      mappingEntry(mapping, line.text, indent)
    }
    return mapping
  }
  return block(0)
}
