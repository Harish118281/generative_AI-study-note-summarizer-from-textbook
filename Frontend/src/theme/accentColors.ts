export type AccentColor = 'teal' | 'blue' | 'violet' | 'rose' | 'orange' | 'green'

export const accentColorOptions: {
  value: AccentColor
  label: string
  color: string
  strong: string
  soft: string
  tint: string
}[] = [
  { value: 'teal', label: 'Teal', color: '#147a63', strong: '#0b5d4c', soft: '#9fe2cf', tint: '#ecf7f3' },
  { value: 'blue', label: 'Blue', color: '#2563eb', strong: '#1d4ed8', soft: '#bfdbfe', tint: '#eff6ff' },
  { value: 'violet', label: 'Violet', color: '#7c3aed', strong: '#6d28d9', soft: '#ddd6fe', tint: '#f5f3ff' },
  { value: 'rose', label: 'Rose', color: '#e11d48', strong: '#be123c', soft: '#fecdd3', tint: '#fff1f2' },
  { value: 'orange', label: 'Orange', color: '#ea580c', strong: '#c2410c', soft: '#fed7aa', tint: '#fff7ed' },
  { value: 'green', label: 'Green', color: '#4d7c0f', strong: '#3f6212', soft: '#d9f99d', tint: '#f7fee7' },
]

export function isAccentColor(value: string | null): value is AccentColor {
  return accentColorOptions.some((option) => option.value === value)
}
