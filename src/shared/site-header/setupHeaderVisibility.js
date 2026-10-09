import gsap from "gsap"

import { prefersReducedMotion } from "../motion/preference"

export function setupHeaderVisibility(lenis) {
  const header = document.querySelector(".site-header")

  if (!header) return

  const topThreshold = 80
  const hideDistance = 48
  const showDistance = 20
  const minimumDelta = 0.5

  let lastScroll = lenis.animatedScroll
  let scrollDirection = 0
  let accumulatedDistance = 0
  let isHeaderHidden = false

  function resetTracking(scroll = lenis.animatedScroll) {
    lastScroll = scroll
    scrollDirection = 0
    accumulatedDistance = 0
  }

  function setHeaderHidden(hidden, { immediate = false } = {}) {
    if (hidden === isHeaderHidden) return

    isHeaderHidden = hidden

    gsap.to(header, {
      yPercent: hidden ? -110 : 0,
      duration: prefersReducedMotion || immediate ? 0 : hidden ? 0.6 : 0.3,
      ease: "power3.inOut",
      overwrite: true,
    })
  }

  lenis.on("scroll", (scrollState) => {
    const currentScroll = scrollState.animatedScroll
    const delta = currentScroll - lastScroll

    lastScroll = currentScroll

    const mustStayVisible =
      currentScroll <= topThreshold || scrollState.userData?.keepHeaderVisible === true

    if (mustStayVisible) {
      resetTracking(currentScroll)
      setHeaderHidden(false)
      return
    }

    if (Math.abs(delta) < minimumDelta) return

    const nextDirection = Math.sign(delta)

    if (nextDirection !== scrollDirection) {
      scrollDirection = nextDirection
      accumulatedDistance = 0
    }

    const shouldHide = nextDirection > 0

    if (shouldHide === isHeaderHidden) {
      accumulatedDistance = 0
      return
    }

    accumulatedDistance += Math.abs(delta)

    const requiredDistance = shouldHide ? hideDistance : showDistance

    if (accumulatedDistance < requiredDistance) return

    resetTracking(currentScroll)
    setHeaderHidden(shouldHide)
  })

  header.addEventListener("focusin", () => {
    resetTracking()
    setHeaderHidden(false, { immediate: true })
  })
}
