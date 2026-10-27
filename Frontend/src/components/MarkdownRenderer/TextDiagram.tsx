import { memo, useMemo } from 'react'
import SvgDiagram from './SvgDiagram'

type TextDiagramProps = {
  source: string
}

type ParsedNode = {
  label: string
}

const connectorOnlyPattern = /^[\s/\\|+\-_=<>^vV.]+$/
const tokenPattern = /"[^"]+"|\S+(?:\s+\([^)]+\))?/g

function escapeSvgText(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function parseNodeLine(line: string) {
  const trimmedLine = line.trim()

  if (!trimmedLine || connectorOnlyPattern.test(trimmedLine)) {
    return []
  }

  return Array.from(line.matchAll(tokenPattern))
    .map((match) => match[0].trim())
    .filter(Boolean)
}

function parseTreeLevels(source: string) {
  return source
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(parseNodeLine)
    .filter((nodes) => nodes.length > 0)
    .map((nodes) => nodes.map((label) => ({ label })))
}

function nodeSize(label: string) {
  return {
    height: 46,
    width: Math.max(76, Math.min(180, label.length * 8.4 + 28)),
  }
}

function createTreeSvg(levels: ParsedNode[][]) {
  const maxNodes = Math.max(...levels.map((level) => level.length))
  const width = Math.max(560, maxNodes * 150 + 120)
  const levelGap = 88
  const top = 62
  const height = top * 2 + (levels.length - 1) * levelGap

  const positionedLevels = levels.map((level, levelIndex) => {
    const y = top + levelIndex * levelGap

    return level.map((node, nodeIndex) => ({
      ...node,
      x: ((nodeIndex + 1) * width) / (level.length + 1),
      y,
      ...nodeSize(node.label),
    }))
  })

  const lines: string[] = []

  for (let levelIndex = 1; levelIndex < positionedLevels.length; levelIndex += 1) {
    const previousLevel = positionedLevels[levelIndex - 1]
    const currentLevel = positionedLevels[levelIndex]

    currentLevel.forEach((node, nodeIndex) => {
      const parentIndex =
        currentLevel.length >= previousLevel.length
          ? Math.floor((nodeIndex * previousLevel.length) / currentLevel.length)
          : Math.min(nodeIndex, previousLevel.length - 1)
      const parent = previousLevel[parentIndex]

      lines.push(
        `<line x1="${parent.x.toFixed(1)}" y1="${(parent.y + parent.height / 2).toFixed(
          1,
        )}" x2="${node.x.toFixed(1)}" y2="${(node.y - node.height / 2).toFixed(
          1,
        )}" stroke="#111a16" stroke-width="3" stroke-linecap="round" />`,
      )
    })
  }

  const nodes = positionedLevels
    .flat()
    .map((node) => {
      const x = node.x - node.width / 2
      const y = node.y - node.height / 2

      return [
        `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${node.width.toFixed(
          1,
        )}" height="${node.height}" rx="14" fill="#e8f2ff" stroke="#111a16" stroke-width="3" />`,
        `<text x="${node.x.toFixed(1)}" y="${node.y.toFixed(
          1,
        )}" text-anchor="middle" dominant-baseline="middle" font-family="Inter, Arial, sans-serif" font-size="16" fill="#111a16">${escapeSvgText(
          node.label,
        )}</text>`,
      ].join('\n')
    })
    .join('\n')

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Generated diagram">
  <title>Generated diagram</title>
  ${lines.join('\n  ')}
  ${nodes}
</svg>
`.trim()
}

function createTextSvg(source: string) {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const fontSize = 15
  const lineHeight = 24
  const width = Math.max(520, Math.max(...lines.map((line) => line.length)) * 9 + 56)
  const height = Math.max(140, lines.length * lineHeight + 48)

  const textLines = lines
    .map(
      (line, index) =>
        `<text x="28" y="${36 + index * lineHeight}" font-family="Consolas, Menlo, monospace" font-size="${fontSize}" fill="#111a16">${escapeSvgText(
          line,
        )}</text>`,
    )
    .join('\n  ')

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Generated text diagram">
  <title>Generated text diagram</title>
  ${textLines}
</svg>
`.trim()
}

function createDiagramSvg(source: string) {
  const levels = parseTreeLevels(source)
  const nodeCount = levels.reduce((total, level) => total + level.length, 0)
  const hasTreeShape =
    levels.length >= 3 &&
    nodeCount >= 4 &&
    levels.some((level, index) => index > 0 && level.length > levels[index - 1].length)

  if (hasTreeShape) {
    return createTreeSvg(levels)
  }

  return createTextSvg(source)
}

function TextDiagram({ source }: TextDiagramProps) {
  const svgSource = useMemo(() => createDiagramSvg(source), [source])

  return <SvgDiagram source={svgSource} />
}

export default memo(TextDiagram)
