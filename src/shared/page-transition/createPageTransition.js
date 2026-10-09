import gsap from "gsap"
import { CustomEase } from "gsap/CustomEase"

gsap.registerPlugin(CustomEase)

CustomEase.create("heroCircleOut", "0.025, 0.99, 0.08, 1")

const DEFAULT_TRANSITION_COLOR = "cream"

const TRANSITION_CORNER_RADIUS =
  "var(--page-transition-radius-x) var(--page-transition-radius-y)"

function applyTransitionRadius(transition, side) {
  const leftRadius = side === "left" ? TRANSITION_CORNER_RADIUS : "0"
  const rightRadius = side === "right" ? TRANSITION_CORNER_RADIUS : "0"

  transition.style.borderTopLeftRadius = leftRadius
  transition.style.borderBottomLeftRadius = leftRadius
  transition.style.borderTopRightRadius = rightRadius
  transition.style.borderBottomRightRadius = rightRadius
}

function normalizeTransitionColor(color) {
  return color === "dark" ? "dark" : DEFAULT_TRANSITION_COLOR
}

function applyTransitionColor(transition, color) {
  const normalizedColor = normalizeTransitionColor(color)

  transition.classList.remove("page-transition--cream", "page-transition--dark")

  transition.classList.add(`page-transition--${normalizedColor}`)

  return normalizedColor
}

function getOrCreateTransitionElement() {
  let transition = document.querySelector(".page-transition")

  if (transition) {
    return transition
  }

  transition = document.createElement("div")
  transition.classList.add("page-transition")
  transition.setAttribute("aria-hidden", "true")

  document.body.appendChild(transition)

  return transition
}

function waitForNextPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve)
    })
  })
}

export function createPageTransition({
  initiallyCovered = false,
  color = DEFAULT_TRANSITION_COLOR,
} = {}) {
  const transition = getOrCreateTransitionElement()

  let currentColor = applyTransitionColor(transition, color)

  let isTransitioning = initiallyCovered

  applyTransitionRadius(transition, initiallyCovered ? "right" : "left")

  gsap.set(transition, {
    xPercent: initiallyCovered ? 0 : 100,
    pointerEvents: initiallyCovered ? "auto" : "none",
  })

  function setColor(color) {
    currentColor = applyTransitionColor(transition, color)

    return currentColor
  }

  function cover() {
    if (isTransitioning) return Promise.resolve(false)

    isTransitioning = true

    return new Promise((resolve) => {
      gsap.to(transition, {
        xPercent: 0,
        duration: 0.85,
        ease: "expo.inOut",
        pointerEvents: "auto",

        onComplete: () => {
          resolve(true)
        },
      })
    })
  }

  async function reveal({ mode = "slide" } = {}) {
    await waitForNextPaint()

    if (mode === "circle") {
      applyTransitionRadius(transition, "none")

      gsap.set(transition, {
        xPercent: 0,
        clipPath: "circle(100vmax at 50% 50%)",
      })

      return new Promise((resolve) => {
        gsap.to(transition, {
          clipPath: "circle(0vmax at 50% 50%)",
          duration: 0.8,
          ease: "heroCircleOut",

          onComplete: () => {
            applyTransitionRadius(transition, "left")

            gsap.set(transition, {
              xPercent: 100,
              clipPath: "none",
              pointerEvents: "none",
            })

            isTransitioning = false
            resolve(true)
          },
        })
      })
    }

    applyTransitionRadius(transition, "right")

    return new Promise((resolve) => {
      gsap.to(transition, {
        xPercent: -100,
        duration: 0.75,
        ease: "power4.out",

        onComplete: () => {
          applyTransitionRadius(transition, "left")

          gsap.set(transition, {
            xPercent: 100,
            pointerEvents: "none",
          })

          isTransitioning = false
          resolve(true)
        },
      })
    })
  }

  async function run(onCovered, { mode = "slide" } = {}) {
    const didCover = await cover()

    if (!didCover) return false

    if (typeof onCovered === "function") {
      await onCovered()
    }

    await reveal({ mode })

    return true
  }

  async function transitionTo(onCovered, { color = DEFAULT_TRANSITION_COLOR } = {}) {
    const transitionColor = setColor(color)

    const didCover = await cover()

    if (!didCover) return false

    sessionStorage.setItem("pageTransitionPending", "true")
    sessionStorage.setItem("pageTransitionColor", transitionColor)

    if (typeof onCovered === "function") {
      await onCovered()
    }

    return true
  }

  function navigateTo(url, options) {
    return transitionTo(() => {
      window.location.href = url
    }, options)
  }

  function reset() {
    gsap.killTweensOf(transition)

    applyTransitionRadius(transition, "left")

    gsap.set(transition, {
      xPercent: 100,
      pointerEvents: "none",
    })

    isTransitioning = false
  }

  return {
    element: transition,
    cover,
    reveal,
    reset,
    run,
    navigateTo,
    transitionTo,
    setColor,
  }
}

export function createIncomingPageTransition() {
  const shouldRevealTransition = sessionStorage.getItem("pageTransitionPending") === "true"

  const storedColor = sessionStorage.getItem("pageTransitionColor")

  sessionStorage.removeItem("pageTransitionPending")
  sessionStorage.removeItem("pageTransitionColor")

  const transitionColor = normalizeTransitionColor(storedColor)

  const pageTransition = createPageTransition({
    initiallyCovered: shouldRevealTransition,
    color: transitionColor,
  })

  return {
    pageTransition,
    shouldRevealTransition,
    transitionColor,
  }
}
