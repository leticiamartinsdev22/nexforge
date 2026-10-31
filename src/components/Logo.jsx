import { useId } from 'react'

// Hexágono com "N" — versão refinada: contorno em gradiente, hexágono interno, diagonal azul e brilho.
export default function Logo({ size = 46, className = '' }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} fill="none" className={className}
      style={{ filter: 'drop-shadow(0 0 10px rgba(108,123,255,.4))', flex: 'none' }}>
      <defs>
        <linearGradient id={`g${id}`} x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8fb0ff" /><stop offset=".5" stopColor="#6c7bff" /><stop offset="1" stopColor="#9a6bff" />
        </linearGradient>
        <linearGradient id={`w${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#ffffff" /><stop offset="1" stopColor="#b8c6ff" />
        </linearGradient>
        <radialGradient id={`f${id}`} cx=".5" cy=".4" r=".7">
          <stop stopColor="#141c3e" /><stop offset="1" stopColor="#070b1c" />
        </radialGradient>
      </defs>
      <path d="M32 2.5 58 17.2v29.6L32 61.5 6 46.8V17.2z" fill={`url(#f${id})`} stroke={`url(#g${id})`} strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M32 8.6 52.7 20.3v23.4L32 55.4 11.3 43.7V20.3z" stroke="rgba(143,176,255,.22)" strokeWidth="1" />
      <path d="M19.5 44.5V19.5h5.6L39 36V19.5h5.5v25h-5.6L25 28v16.5z" fill={`url(#w${id})`} />
      <path d="M25.1 19.5 39 36l-.1 8.5L25 28z" fill={`url(#g${id})`} />
      <path d="M45.5 14.5 50 17" stroke="#8fb0ff" strokeWidth="1.6" strokeLinecap="round" opacity=".7" />
    </svg>
  )
}
