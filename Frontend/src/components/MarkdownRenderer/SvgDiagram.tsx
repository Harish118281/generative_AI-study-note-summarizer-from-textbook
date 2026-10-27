import { memo, useMemo, useState, type ReactNode } from 'react'
import './SvgDiagram.css'

type SvgDiagramProps = {
  source: string
}

type SvgViewMode = 'preview' | 'source'

type SvgIconButtonProps = {
  children: ReactNode
  isActive?: boolean
  label: string
  onClick: () => void
}

const blockedSvgTags = [
  'audio',
  'canvas',
  'embed',
  'foreignobject',
  'iframe',
  'object',
  'script',
  'style',
  'video',
]

const allowedStyleProperties = new Set([
  'alignment-baseline',
  'dominant-baseline',
  'fill',
  'fill-opacity',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'marker-end',
  'marker-mid',
  'marker-start',
  'opacity',
  'rx',
  'ry',
  'stroke',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-opacity',
  'stroke-width',
  'text-anchor',
])

function isSafeStyleValue(value: string) {
  const normalizedValue = value.trim().toLowerCase()

  if (
    normalizedValue.includes('javascript:') ||
    normalizedValue.includes('expression(') ||
    normalizedValue.includes('<') ||
    normalizedValue.includes('>')
  ) {
    return false
  }

  if (normalizedValue.includes('url(')) {
    return /^url\(#[-\w:.]+\)$/i.test(value.trim())
  }

  return true
}

function sanitizeStyle(style: string) {
  return style
    .split(';')
    .map((declaration) => {
      const separatorIndex = declaration.indexOf(':')

      if (separatorIndex === -1) {
        return null
      }

      const property = declaration.slice(0, separatorIndex).trim().toLowerCase()
      const value = declaration.slice(separatorIndex + 1).trim()

      if (!allowedStyleProperties.has(property) || !value || !isSafeStyleValue(value)) {
        return null
      }

      return `${property}: ${value}`
    })
    .filter(Boolean)
    .join('; ')
}

function collectClassStyles(parsedDocument: Document) {
  const classStyles = new Map<string, string>()

  parsedDocument.querySelectorAll('style').forEach((styleElement) => {
    const cssText = styleElement.textContent ?? ''

    Array.from(cssText.matchAll(/\.([_a-zA-Z][-\w]*)\s*\{([^}]*)\}/g)).forEach(
      ([, className, declarations]) => {
        const sanitizedDeclarations = sanitizeStyle(declarations)

        if (!sanitizedDeclarations) {
          return
        }

        const existingDeclarations = classStyles.get(className)
        classStyles.set(
          className,
          existingDeclarations
            ? `${existingDeclarations}; ${sanitizedDeclarations}`
            : sanitizedDeclarations,
        )
      },
    )
  })

  return classStyles
}

function applyClassStyles(parsedDocument: Document, classStyles: Map<string, string>) {
  if (classStyles.size === 0) {
    return
  }

  parsedDocument.querySelectorAll('[class]').forEach((element) => {
    const className = element.getAttribute('class') ?? ''
    const stylesFromClasses = className
      .split(/\s+/)
      .map((item) => classStyles.get(item))
      .filter(Boolean)
      .join('; ')
    const existingStyle = element.getAttribute('style')
    const mergedStyle = [stylesFromClasses, existingStyle].filter(Boolean).join('; ')
    const sanitizedStyle = sanitizeStyle(mergedStyle)

    if (sanitizedStyle) {
      element.setAttribute('style', sanitizedStyle)
    }

    element.removeAttribute('class')
  })
}

function getStyleValue(element: Element, property: string) {
  const style = element.getAttribute('style')

  if (!style) {
    return ''
  }

  const matchingDeclaration = style
    .split(';')
    .map((declaration) => declaration.trim())
    .find((declaration) => declaration.toLowerCase().startsWith(`${property}:`))

  if (!matchingDeclaration) {
    return ''
  }

  return matchingDeclaration.slice(matchingDeclaration.indexOf(':') + 1).trim()
}

function getPresentationValue(element: Element, property: string) {
  return element.getAttribute(property) || getStyleValue(element, property)
}

function removeStyleProperty(element: Element, property: string) {
  const style = element.getAttribute('style')

  if (!style) {
    return
  }

  const nextStyle = style
    .split(';')
    .map((declaration) => declaration.trim())
    .filter((declaration) => !declaration.toLowerCase().startsWith(`${property}:`))
    .join('; ')

  if (nextStyle) {
    element.setAttribute('style', nextStyle)
  } else {
    element.removeAttribute('style')
  }
}

function isBlackLikeColor(value: string) {
  const normalizedValue = value.replace(/\s/g, '').toLowerCase()

  return [
    '#000',
    '#000000',
    'black',
    'rgb(0,0,0)',
    'rgba(0,0,0,1)',
  ].includes(normalizedValue)
}

function numberAttribute(element: Element, attribute: string) {
  const value = Number.parseFloat(element.getAttribute(attribute) || '')
  return Number.isFinite(value) ? value : null
}

function applyRootSizing(svgElement: Element) {
  const width = Number.parseFloat(svgElement.getAttribute('width') || '')
  const height = Number.parseFloat(svgElement.getAttribute('height') || '')

  if (!svgElement.getAttribute('viewBox') && width > 0 && height > 0) {
    svgElement.setAttribute('viewBox', `0 0 ${width} ${height}`)
  }

  svgElement.removeAttribute('width')
  svgElement.removeAttribute('height')
  svgElement.setAttribute('preserveAspectRatio', 'xMidYMid meet')
}

function improveNodeLabels(parsedDocument: Document) {
  const shapes = Array.from(parsedDocument.querySelectorAll('circle, ellipse')).map(
    (element) => {
      const cx = numberAttribute(element, 'cx')
      const cy = numberAttribute(element, 'cy')

      if (cx === null || cy === null) {
        return null
      }

      const rx =
        element.tagName.toLowerCase() === 'circle'
          ? numberAttribute(element, 'r')
          : numberAttribute(element, 'rx')
      const ry =
        element.tagName.toLowerCase() === 'circle'
          ? numberAttribute(element, 'r')
          : numberAttribute(element, 'ry')

      return {
        cx,
        cy,
        element,
        rx: rx ?? 24,
        ry: ry ?? 24,
      }
    },
  )

  parsedDocument.querySelectorAll('text').forEach((textElement) => {
    const x = numberAttribute(textElement, 'x')
    const y = numberAttribute(textElement, 'y')

    if (x === null || y === null) {
      return
    }

    const nearbyShape = shapes.find((shape) => {
      if (!shape) {
        return false
      }

      const horizontalDistance = Math.abs(shape.cx - x)
      const verticalDistance = Math.abs(shape.cy - y)

      return horizontalDistance <= shape.rx + 8 && verticalDistance <= shape.ry + 10
    })

    if (!nearbyShape) {
      return
    }

    const text = textElement.textContent?.trim() ?? ''
    const nextRadius = Math.min(48, Math.max(nearbyShape.rx, text.length * 3.9 + 12))

    if (nearbyShape.element.tagName.toLowerCase() === 'circle') {
      nearbyShape.element.setAttribute('r', nextRadius.toFixed(1))
    } else {
      nearbyShape.element.setAttribute('rx', nextRadius.toFixed(1))
      nearbyShape.element.setAttribute('ry', Math.max(nearbyShape.ry, 26).toFixed(1))
    }

    if (!getPresentationValue(textElement, 'text-anchor')) {
      textElement.setAttribute('text-anchor', 'middle')
    }

    if (
      !getPresentationValue(textElement, 'dominant-baseline') &&
      !getPresentationValue(textElement, 'alignment-baseline')
    ) {
      textElement.setAttribute('dominant-baseline', 'middle')
    }
  })
}

function applyShapeDefaults(parsedDocument: Document) {
  parsedDocument.querySelectorAll('line, polyline').forEach((element) => {
    if (!getPresentationValue(element, 'stroke')) {
      element.setAttribute('stroke', '#1f2a24')
    }

    if (!getPresentationValue(element, 'stroke-width')) {
      element.setAttribute('stroke-width', '2')
    }

    if (!getPresentationValue(element, 'stroke-linecap')) {
      element.setAttribute('stroke-linecap', 'round')
    }

    if (element.tagName.toLowerCase() === 'polyline' && !getPresentationValue(element, 'fill')) {
      element.setAttribute('fill', 'none')
    }
  })

  parsedDocument.querySelectorAll('path').forEach((element) => {
    if (!getPresentationValue(element, 'stroke') && !getPresentationValue(element, 'fill')) {
      element.setAttribute('stroke', '#1f2a24')
      element.setAttribute('stroke-width', '2')
      element.setAttribute('fill', 'none')
      element.setAttribute('stroke-linecap', 'round')
      element.setAttribute('stroke-linejoin', 'round')
    }
  })

  parsedDocument.querySelectorAll('rect').forEach((element) => {
    if (!getPresentationValue(element, 'fill')) {
      element.setAttribute('fill', '#f8fafc')
    }

    if (!getPresentationValue(element, 'stroke')) {
      element.setAttribute('stroke', '#cbd5e1')
    }

    if (!getPresentationValue(element, 'stroke-width')) {
      element.setAttribute('stroke-width', '2')
    }

    if (!getPresentationValue(element, 'rx')) {
      element.setAttribute('rx', '8')
    }

    if (!getPresentationValue(element, 'ry')) {
      element.setAttribute('ry', '8')
    }
  })

  parsedDocument.querySelectorAll('circle, ellipse').forEach((element) => {
    const fill = getPresentationValue(element, 'fill')

    if (!fill || isBlackLikeColor(fill)) {
      removeStyleProperty(element, 'fill')
      element.setAttribute('fill', '#e8f2ff')
    }

    if (!getPresentationValue(element, 'stroke')) {
      element.setAttribute('stroke', '#111a16')
    }

    if (!getPresentationValue(element, 'stroke-width')) {
      element.setAttribute('stroke-width', '2')
    }
  })

  parsedDocument.querySelectorAll('text').forEach((element) => {
    if (!getPresentationValue(element, 'fill')) {
      element.setAttribute('fill', '#111a16')
    }

    if (!getPresentationValue(element, 'font-family')) {
      element.setAttribute('font-family', 'Inter, Arial, sans-serif')
    }

    if (!getPresentationValue(element, 'font-size')) {
      element.setAttribute('font-size', '16')
    }
  })

  improveNodeLabels(parsedDocument)
}

function sanitizeSvg(source: string) {
  const trimmedSource = source.trim()

  if (!trimmedSource.includes('<svg')) {
    return null
  }

  const parser = new DOMParser()
  const parsedDocument = parser.parseFromString(trimmedSource, 'image/svg+xml')

  if (parsedDocument.querySelector('parsererror')) {
    return null
  }

  const svgElement = parsedDocument.documentElement

  if (svgElement.tagName.toLowerCase() !== 'svg') {
    return null
  }

  svgElement.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  applyRootSizing(svgElement)

  const classStyles = collectClassStyles(parsedDocument)
  applyClassStyles(parsedDocument, classStyles)

  for (const blockedTag of blockedSvgTags) {
    parsedDocument.querySelectorAll(blockedTag).forEach((element) => element.remove())
  }

  parsedDocument.querySelectorAll('*').forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase()
      const value = attribute.value.trim().toLowerCase()

      if (name === 'style') {
        const sanitizedStyle = sanitizeStyle(attribute.value)

        if (sanitizedStyle) {
          element.setAttribute('style', sanitizedStyle)
        } else {
          element.removeAttribute(attribute.name)
        }

        return
      }

      if (
        name.startsWith('on') ||
        value.startsWith('javascript:') ||
        ((name === 'href' || name === 'xlink:href') && !value.startsWith('#'))
      ) {
        element.removeAttribute(attribute.name)
      }
    })
  })

  applyShapeDefaults(parsedDocument)

  const title = svgElement.querySelector('title')?.textContent?.trim()
  const ariaLabel = svgElement.getAttribute('aria-label')?.trim()
  const label = title || ariaLabel || 'Generated SVG diagram'
  const svg = new XMLSerializer().serializeToString(svgElement)
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

  return {
    dataUrl,
    label,
    svg,
  }
}

function SvgIconButton({
  children,
  isActive = false,
  label,
  onClick,
}: SvgIconButtonProps) {
  return (
    <button
      aria-label={label}
      aria-pressed={isActive}
      className={isActive ? 'svg-diagram-action active' : 'svg-diagram-action'}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  )
}

function SvgFileIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18">
      <path
        d="M5 4.75A1.75 1.75 0 0 1 6.75 3h8.5L20 7.75v9.5A1.75 1.75 0 0 1 18.25 19h-4.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M15 3v4.25c0 .41.34.75.75.75H20"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M5.5 16.25 8 13.75l2.5 2.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M8 13.75V21"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  )
}

function CodeIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18">
      <path
        d="m9 8-4 4 4 4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path
        d="m15 8 4 4-4 4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  )
}

function PreviewIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18">
      <path
        d="M8 5.75v12.5L18 12 8 5.75Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  )
}

function OpenIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18">
      <path
        d="M14 5h5v5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path
        d="M13 11 19 5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path
        d="M10 5H6.75A1.75 1.75 0 0 0 5 6.75v10.5C5 18.22 5.78 19 6.75 19h10.5c.97 0 1.75-.78 1.75-1.75V14"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  )
}

function SvgDiagram({ source }: SvgDiagramProps) {
  const diagram = useMemo(() => sanitizeSvg(source), [source])
  const [viewMode, setViewMode] = useState<SvgViewMode>('preview')

  if (!diagram) {
    return null
  }

  function openDiagram() {
    if (!diagram) {
      return
    }

    window.open(diagram.dataUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <figure className="svg-diagram">
      <div className="svg-diagram-header">
        <figcaption className="svg-diagram-title">
          <SvgFileIcon />
          <span>SVG</span>
        </figcaption>

        <div className="svg-diagram-actions">
          <SvgIconButton
            isActive={viewMode === 'source'}
            label="Show SVG source"
            onClick={() => setViewMode('source')}
          >
            <CodeIcon />
          </SvgIconButton>
          <SvgIconButton
            isActive={viewMode === 'preview'}
            label="Show SVG preview"
            onClick={() => setViewMode('preview')}
          >
            <PreviewIcon />
          </SvgIconButton>
          <SvgIconButton label="Open SVG in new tab" onClick={openDiagram}>
            <OpenIcon />
          </SvgIconButton>
        </div>
      </div>

      <div
        className={
          viewMode === 'preview'
            ? 'svg-diagram-stage svg-diagram-stage-preview'
            : 'svg-diagram-stage svg-diagram-stage-source'
        }
      >
        {viewMode === 'preview' ? (
          <img
            alt={diagram.label}
            className="svg-diagram-image"
            decoding="async"
            src={diagram.dataUrl}
          />
        ) : (
          <pre className="svg-diagram-source">
            <code>{diagram.svg}</code>
          </pre>
        )}
      </div>
    </figure>
  )
}

export default memo(SvgDiagram)
