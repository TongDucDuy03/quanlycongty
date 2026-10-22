import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

/** Progressive scroll reveal: content stays visible until the visitor really scrolls; only blocks fully below the fold are then faded in as they approach. */
export function useReveal(root: RefObject<HTMLElement | null>, enabled: boolean, refresh: string) {
  const armed = useRef(false)
  useEffect(() => {
    if (!enabled || !('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const observer = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { const element = entry.target; element.classList.add('pub-in'); element.setAttribute('data-revealed', ''); observer.unobserve(element); setTimeout(() => element.classList.remove('pub-rv', 'pub-in'), 1600) } }))
    const arm = () => {
      armed.current = true
      root.current?.querySelectorAll('[data-reveal]:not([data-revealed])').forEach(element => {
        if (element.classList.contains('pub-rv')) observer.observe(element)
        else if (element.getBoundingClientRect().top >= window.innerHeight) { element.classList.add('pub-rv'); observer.observe(element) }
      })
    }
    if (armed.current) arm()
    else { const first = () => { window.removeEventListener('scroll', first); arm() }; window.addEventListener('scroll', first, { passive: true }); return () => { window.removeEventListener('scroll', first); observer.disconnect() } }
    return () => observer.disconnect()
  }, [root, enabled, refresh])
}
