type LoadingIndicatorProps = {
  label: string
  className?: string
  textOnly?: boolean
}

function LoadingIndicator({
  label,
  className = '',
  textOnly = false,
}: LoadingIndicatorProps) {
  return (
    <span
      aria-label={textOnly ? undefined : label}
      className={`loading-indicator${textOnly ? ' loading-text-only' : ''} ${className}`.trim()}
      role="status"
    >
      {textOnly ? label : <span className="loading-spinner" aria-hidden="true" />}
    </span>
  )
}

export default LoadingIndicator
