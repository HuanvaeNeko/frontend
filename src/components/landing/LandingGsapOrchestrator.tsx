'use client'

import { useEffect } from 'react'

export default function LandingGsapOrchestrator() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let active = true
    const cleanups: Array<() => void> = []

    void (async () => {
      const gsapModule = await import('gsap')
      const scrollTriggerModule = await import('gsap/ScrollTrigger')
      if (!active) return

      const gsap = gsapModule.default
      const ScrollTrigger = scrollTriggerModule.ScrollTrigger
      gsap.registerPlugin(ScrollTrigger)

      const ctx = gsap.context(() => {
        const scroller = document.querySelector('#top') as HTMLElement | null
        if (scroller) {
          ScrollTrigger.defaults({ scroller })
        }

        const heroTl = gsap.timeline({ defaults: { ease: 'power3.out' } })
        heroTl
          .from('[data-gsap="hero-badge"]', { y: 24, autoAlpha: 0, duration: 0.7 })
          .from('[data-gsap="hero-title"]', { y: 42, autoAlpha: 0, duration: 0.9 }, '-=0.42')
          .from('[data-gsap="hero-description"]', { y: 28, autoAlpha: 0, duration: 0.8 }, '-=0.55')
          .from('[data-gsap="hero-actions"] > *', { y: 24, autoAlpha: 0, duration: 0.6, stagger: 0.1, clearProps: 'opacity,visibility,transform' }, '-=0.45')
          .from('[data-gsap="hero-orb"]', { scale: 0.72, autoAlpha: 0, duration: 1 }, '-=0.75')

        gsap.utils.toArray<HTMLElement>('[data-reveal]').forEach((el, index) => {
          gsap.fromTo(
            el,
            { y: 36, autoAlpha: 0, rotateX: 8 },
            {
              y: 0,
              autoAlpha: 1,
              rotateX: 0,
              duration: 0.8,
              delay: Math.min(index * 0.04, 0.22),
              ease: 'power3.out',
              scrollTrigger: {
                trigger: el,
                start: 'top 82%',
                once: true,
                invalidateOnRefresh: true,
              },
            }
          )
        })

        gsap.utils.toArray<HTMLElement>('[data-parallax]').forEach((el) => {
          gsap.to(el, {
            yPercent: -18,
            ease: 'none',
            scrollTrigger: {
              trigger: el,
              scrub: 1.2,
              start: 'top bottom',
              end: 'bottom top',
            },
          })
        })

        gsap.utils.toArray<HTMLElement>('[data-gsap="grid-card"]').forEach((card) => {
          const glow = card.querySelector('[data-gsap="grid-card-glow"]') as HTMLElement | null
          const onMove = (event: MouseEvent) => {
            const rect = card.getBoundingClientRect()
            const x = ((event.clientX - rect.left) / rect.width - 0.5) * 14
            const y = ((event.clientY - rect.top) / rect.height - 0.5) * 12
            gsap.to(card, { rotateY: x, rotateX: -y, transformPerspective: 900, duration: 0.35, ease: 'power2.out' })
            if (glow) {
              gsap.to(glow, {
                x: event.clientX - rect.left - rect.width / 2,
                y: event.clientY - rect.top - rect.height / 2,
                duration: 0.3,
                ease: 'power2.out',
              })
            }
          }
          const onLeave = () => {
            gsap.to(card, { rotateY: 0, rotateX: 0, duration: 0.45, ease: 'power3.out' })
            if (glow) gsap.to(glow, { x: 0, y: 0, duration: 0.45, ease: 'power3.out' })
          }
          card.addEventListener('mousemove', onMove)
          card.addEventListener('mouseleave', onLeave)
          cleanups.push(() => {
            card.removeEventListener('mousemove', onMove)
            card.removeEventListener('mouseleave', onLeave)
          })
        })

        gsap.utils.toArray<SVGPathElement>('[data-gsap="math-path"]').forEach((path, index) => {
          const length = path.getTotalLength()
          gsap.set(path, { strokeDasharray: length, strokeDashoffset: length * 0.18 })
          gsap.to(path, {
            strokeDashoffset: index % 2 === 0 ? -length * 0.82 : length * 0.82,
            duration: 8 + index * 2,
            repeat: -1,
            ease: 'none',
          })
        })

        gsap.utils.toArray<SVGPathElement>('[data-gsap="abstract-path"]').forEach((path, index) => {
          const length = path.getTotalLength()
          gsap.set(path, { strokeDasharray: length, strokeDashoffset: length * (index % 2 === 0 ? 0.25 : -0.25) })
          gsap.to(path, {
            strokeDashoffset: index % 2 === 0 ? -length * 0.75 : length * 0.75,
            duration: 10 + index * 2,
            repeat: -1,
            ease: 'none',
          })
        })

        gsap.utils.toArray<SVGCircleElement>('[data-gsap="abstract-node"]').forEach((node, index) => {
          gsap.to(node, {
            attr: { r: 5.5 + (index % 3) * 1.8 },
            duration: 1.2 + index * 0.2,
            yoyo: true,
            repeat: -1,
            ease: 'sine.inOut',
          })
        })

        gsap.utils.toArray<HTMLElement>('[data-gsap="drift"]').forEach((el, index) => {
          gsap.to(el, {
            x: index % 2 === 0 ? 32 : -28,
            y: index % 2 === 0 ? -18 : 22,
            duration: 9 + index * 2,
            ease: 'sine.inOut',
            yoyo: true,
            repeat: -1,
          })
        })

        gsap.utils.toArray<SVGCircleElement>('[data-gsap="math-node"]').forEach((node, index) => {
          gsap.to(node, {
            attr: { r: 6 + (index % 3) * 1.6 },
            duration: 1.4 + index * 0.18,
            yoyo: true,
            repeat: -1,
            ease: 'sine.inOut',
          })
        })

        gsap.utils.toArray<HTMLElement>('[data-gsap="math-panel"]').forEach((panel, index) => {
          gsap.fromTo(
            panel,
            { y: 16, autoAlpha: 0 },
            {
              y: 0,
              autoAlpha: 1,
              duration: 0.7,
              delay: 0.1 + index * 0.08,
              ease: 'power3.out',
              scrollTrigger: {
                trigger: panel,
                start: 'top 85%',
                once: true,
              },
            }
          )
        })

        gsap.utils.toArray<HTMLElement>('[data-magnetic]').forEach((button) => {
          const isHidden = () => button.style.visibility === 'hidden' || button.style.opacity === '0'
          const onMove = (event: MouseEvent) => {
            if (isHidden()) return
            const rect = button.getBoundingClientRect()
            const x = (event.clientX - rect.left - rect.width / 2) * 0.16
            const y = (event.clientY - rect.top - rect.height / 2) * 0.16
            gsap.to(button, { x, y, duration: 0.25, ease: 'power2.out', overwrite: false })
          }
          const onLeave = () => {
            gsap.to(button, { x: 0, y: 0, duration: 0.35, ease: 'power3.out', overwrite: false })
          }
          button.addEventListener('mousemove', onMove)
          button.addEventListener('mouseleave', onLeave)
          cleanups.push(() => {
            button.removeEventListener('mousemove', onMove)
            button.removeEventListener('mouseleave', onLeave)
          })
        })

        ScrollTrigger.refresh()

        // Dev/HMR race fallback: ensure CTA buttons never stay hidden
        window.setTimeout(() => {
          document.querySelectorAll<HTMLElement>('[data-gsap="hero-actions"] > *').forEach((el) => {
            if (el.style.visibility === 'hidden' || el.style.opacity === '0') {
              gsap.set(el, { autoAlpha: 1, y: 0, clearProps: 'opacity,visibility,transform' })
            }
          })
        }, 1400)
      })

      cleanups.push(() => {
        ctx.revert()
        ScrollTrigger.defaults({}) 
        ScrollTrigger.getAll().forEach((t) => t.kill())
      })
    })()

    return () => {
      active = false
      cleanups.forEach((fn) => fn())
      document.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => {
        el.style.removeProperty('opacity')
        el.style.removeProperty('visibility')
        el.style.removeProperty('transform')
      })
    }
  }, [])

  return null
}
