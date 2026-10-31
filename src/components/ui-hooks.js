import { useEffect, useState } from 'react'

const clamp = (value) => Math.max(1, Math.min(99, value))

export function useSeries(base, n = 30, jitter = 6) {
  const [series, setSeries] = useState(() => Array.from({ length: n }, () => clamp(base + (Math.random() - 0.5) * jitter * 2)))
  useEffect(() => {
    const id = setInterval(() => setSeries((previous) => [...previous.slice(1), clamp(base + (Math.random() - 0.5) * jitter * 2)]), 2000)
    return () => clearInterval(id)
  }, [base, jitter])
  return series
}
