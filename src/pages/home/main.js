import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import Lenis from "lenis"
import "lenis/dist/lenis.css"

import { createHomeLoader } from "./loader/createHomeLoader"
import { createI18n } from "../../shared/i18n"
import { setupPlaygroundLinkHover } from "../../shared/link-hover/setupPlaygroundLinkHover"
import { createSiteHeader } from "../../shared/site-header/createSiteHeader"
import { setupHeaderVisibility } from "../../shared/site-header/setupHeaderVisibility"
import { prefersReducedMotion } from "../../shared/motion/preference"
import { createIncomingPageTransition } from "../../shared/page-transition/createPageTransition"
import { setupCrossPageTransitions } from "../../shared/page-transition/setupCrossPageTransitions"

import { createThreeHero } from "./webgl/createThreeHero"
import { createToolkitCardReveal } from "./webgl/createToolkitCardReveal"
import { createTrajectoryBackground } from "./webgl/createTrajectoryBackground"
import {
  createProjectLetterPhysics,
  preloadProjectPhysicsModule,
} from "./projects/createProjectLetterPhysics"
import { preloadProjectImages, setupProjectImageHover } from "./projects/setupProjectImageHover"

let trajectoryBackground = null

const i18n = createI18n()

i18n.applyTranslations()

document.querySelectorAll(".trajectory-sentences__sentence > [data-i18n]").forEach((line) => {
  line.replaceWith(line.textContent)
})

// ----------------------
// Global setup
// ----------------------

// GSAP and shared interface
gsap.registerPlugin(ScrollTrigger)

createSiteHeader(i18n)
setupPlaygroundLinkHover()
setHeaderCapsuleVariant("soft-white")

// Home loader session
const shouldShowHomeLoader = document.documentElement.dataset.homeLoaderState === "pending"

// Scroll intent captured by the inline script in index.html
const homeScrollIntent = window.__homeScrollIntent ?? { hash: null, offset: 0 }
const isRestoringHomeScroll = document.documentElement.dataset.homeLoaderState === "restoring"

const homeLoader = createHomeLoader({
  enabled: shouldShowHomeLoader,
  minimumDuration: 2,
})

// Smooth scroll
const lenis = new Lenis({
  anchors: true,
})

lenis.on("scroll", ScrollTrigger.update)
setupHeaderVisibility(lenis)

// Drive Lenis from the GSAP ticker
gsap.ticker.add((time) => {
  lenis.raf(time * 1000)
})

gsap.ticker.lagSmoothing(0)

// Keep scroll locked while the home is preparing
let isHomePreparing = shouldShowHomeLoader

const syncHomeScrollState = () => {
  if (isHomePreparing) {
    lenis.stop()
    return
  }

  lenis.start()
}

syncHomeScrollState()

// Page and section navigation
const { pageTransition, shouldRevealTransition } = createIncomingPageTransition()

const shouldRevealIncomingTransition = shouldRevealTransition && !shouldShowHomeLoader

if (shouldShowHomeLoader && shouldRevealTransition) {
  pageTransition.reset()
}

const sectionNavigation = createSectionNavigation()

setupCrossPageTransitions({
  pageTransition,

  onNavigateStart: () => {
    lenis.stop()
  },

  onNavigateCancelled: () => {
    syncHomeScrollState()
  },
})

// Restore the correct scroll state around browser cache navigation
window.addEventListener("pagehide", () => {
  lenis.start()

  // Read back on the next reload only
  try {
    sessionStorage.setItem("homeScrollOffset", String(Math.round(window.scrollY)))
    sessionStorage.setItem("homeScrollTheme", document.body.dataset.interfaceColor ?? "cream")
  } catch (error) {
    // A missing sessionStorage only costs the restore
  }
})

window.addEventListener("pageshow", () => {
  syncHomeScrollState()
})

// ----------------------
// Scene scroll animation
// ----------------------
const homeReady = (async () => {
  try {
    const threeHero = await createThreeHero({
      autoStart: false,
      reducedMotion: prefersReducedMotion,

      onProgress: (progress) => {
        homeLoader.setProgress(progress)
      },
    })

    threeHero.setInteractive(false)

    await threeHero.ready

    const heroScrollTrigger = setupHeroScroll(threeHero)
    setupHeroToManifestoTransition(heroScrollTrigger)

    threeHero.setInteractive(false)

    return threeHero
  } catch (error) {
    console.error("Unable to prepare the Three.js hero.", error)

    document.querySelector(".webgl")?.remove()

    return null
  }
})()

const threeHero = await homeReady

await homeLoader.complete()

setupHeroRenderVisibility(threeHero)

await homeLoader.revealLogo()
await homeLoader.revealHero()

if (shouldShowHomeLoader) {
  document.documentElement.dataset.homeLoaderState = "ready"
}

homeLoader.dispose()

isHomePreparing = false
syncHomeScrollState()

threeHero?.setInteractive(true)

// ----------------------
// Sections Animations
// ----------------------
document.fonts.ready.then(() => {
  setupManifesto()
  setupTrajectory()
  setupTrajectorySentences()
  setupTrajectoryToToolkitTransition()
  setupToolkit()
  const { projectsTimeline, ensureProjectPhysics } = setupProjects()
  const nextSectionTrigger = setupNextSection()
  setupNextPlaygroundLinkCue()

  setupHeaderTheme()
  setupScrollIndicator()

  ScrollTrigger.refresh()

  // Update Lenis with final document height with GSAP pin spacers
  lenis.resize()

  setupDeferredHomeBackgrounds()

  sectionNavigation.init({
    projectsTimeline,
    ensureProjectPhysics,
    nextSectionTrigger,
  })
})

// ----------------------
// Helpers
// ----------------------
// Wrap letters in span
function wrapLettersInSpan(element) {
  if (!element || element.dataset.splitted === "true") return

  const lines = element.innerHTML.trim().split(/<br\s*\/?>/i)

  element.innerHTML = lines
    .map((line) =>
      line
        .trim()
        .split("")
        .map((char) =>
          char === " " ? "<span>&nbsp;</span>" : `<span class="letter">${char}</span>`,
        )
        .join(""),
    )
    .join("<br />")

  element.dataset.splitted = "true"
}

// Wrap project letters
function wrapProjectLetters(element) {
  const text = element.textContent.trim()

  element.setAttribute("aria-label", text)

  element.innerHTML = text
    .split("")
    .map((char) => {
      const content = char === " " ? "&nbsp;" : char

      return `
    <span class="project-letter" aria-hidden="true">
      <span class="project-letter__content">
        ${content}
      </span>
    </span>
    `
    })
    .join("")
}

// Convert progress into 0 -> 1 between two values
function getPhaseProgress(progress, start, end) {
  return gsap.utils.clamp(0, 1, (progress - start) / (end - start))
}

function getResponsiveFrameScaleX() {
  const sideInset = gsap.utils.clamp(8, 40, window.innerWidth * 0.025 - 8)

  return 1 - (sideInset * 2) / window.innerWidth
}

function getResponsiveHeroFrameInset() {
  return gsap.utils.clamp(8, 16, window.innerWidth * 0.025 - 8)
}

function getResponsiveHeroFrameScaleX() {
  const viewportWidth = window.innerWidth
  const initialInset = getResponsiveHeroFrameInset()
  const initialVisibleWidth = viewportWidth - initialInset * 2
  const sharedTargetWidth = viewportWidth * getResponsiveFrameScaleX()
  const extraSideInset = gsap.utils.clamp(8, 24, viewportWidth * 0.0125)
  const heroTargetWidth = sharedTargetWidth - extraSideInset * 2

  return heroTargetWidth / initialVisibleWidth
}

// Header body interface color
function setInterfaceColor(color) {
  if (document.body.dataset.interfaceColor === color) return
  document.body.dataset.interfaceColor = color
}

function setHeaderCapsuleVariant(variant = null) {
  if (variant) {
    document.body.dataset.headerCapsuleVariant = variant
    return
  }

  delete document.body.dataset.headerCapsuleVariant
}

// ----------------------
// Functions
// ----------------------
// Main page section navigation
function createSectionNavigation() {
  // ----------------------
  // 1. Navigation settings
  // ----------------------
  const supportedHashes = new Set([
    "#hero",
    "#manifesto",
    "#parcours",
    "#toolkit",
    "#projects",
    "#contact",
  ])

  const interfaceColorByHash = {
    "#hero": "cream",
    "#manifesto": "dark",
    "#parcours": "cream",
    "#toolkit": "cream",
    "#projects": "dark",
    "#contact": "cream",
  }

  const getTransitionDistanceThreshold = () => {
    return window.innerHeight * 3.5
  }

  // ----------------------
  // 2. Initial hash
  // ----------------------
  // index.html already stripped the fragment from the URL
  const initialHash = supportedHashes.has(homeScrollIntent.hash) ? homeScrollIntent.hash : null

  if (initialHash === "#projects" && !prefersReducedMotion) {
    void preloadProjectPhysicsModule().catch(() => {})
  }

  function loadSectionBackground(hash) {
    if (hash === "#parcours") {
      loadTrajectoryBackground()
    } else if (hash === "#contact") {
      loadFooterBackground()
    }
  }

  // ----------------------
  // 3. Calculate destination
  // ----------------------
  function getTargetScroll(hash, references) {
    const { projectsTimeline, nextSectionTrigger } = references

    if (hash === "#hero") {
      return 0
    }

    if (hash === "#projects") {
      const projectsVisibleScroll =
        projectsTimeline?.scrollTrigger?.labelToScroll("projects-visible")

      return projectsVisibleScroll == null ? null : projectsVisibleScroll - 1
    }

    if (hash === "#contact") {
      return nextSectionTrigger ? nextSectionTrigger.end - 1 : null
    }

    const targetElement = document.querySelector(hash)

    if (!targetElement) return null

    return targetElement.getBoundingClientRect().top + window.scrollY
  }

  // ----------------------
  // 4. Update URL
  // ----------------------
  function updateUrl(hash, historyMode) {
    const targetUrl = `${window.location.pathname}` + `${window.location.search}` + `${hash}`

    if (historyMode === "replace") {
      history.replaceState(null, "", targetUrl)
      return
    }

    if (window.location.hash !== hash) {
      history.pushState(null, "", targetUrl)
    }
  }

  // ----------------------
  // 5. Scroll to destination
  // ----------------------
  function scrollToSection(hash, references, { immediate = false, historyMode = "push" } = {}) {
    const targetScroll = getTargetScroll(hash, references)

    if (targetScroll == null) return false

    lenis.scrollTo(targetScroll, {
      immediate,
      force: true,
      userData: {
        keepHeaderVisible: true,
      },
    })

    // An immediate jump does not naturally pass through every theme trigger
    if (immediate) {
      ScrollTrigger.update()
      setInterfaceColor(interfaceColorByHash[hash])
      setHeaderCapsuleVariant(hash === "#hero" ? "soft-white" : null)
    }

    updateUrl(hash, historyMode)

    return true
  }

  // Undo the scroll performed by native navigation
  function resetNativeAnchorContainer(hash) {
    const targetElement = document.querySelector(hash)
    const scrollContainer = targetElement?.closest(".next-section__container")

    if (!scrollContainer) return

    scrollContainer.scrollTop = 0
    scrollContainer.scrollLeft = 0
  }

  // ----------------------
  // 6. Handle hero link
  // ----------------------
  function setupHeroLink() {
    const heroLinks = document.querySelectorAll(
      '.site-header__logo, .scroll-indicator__item[href="#hero"]',
    )

    if (!heroLinks.length) return

    async function handleHeroClick(event) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      const isAlreadyOnHero = window.scrollY <= 1

      if (isAlreadyOnHero) return

      pageTransition.setColor("cream")
      lenis.stop()

      try {
        await pageTransition.run(
          () => {
            lenis.scrollTo(0, {
              immediate: true,
              force: true,
              userData: {
                keepHeaderVisible: true,
              },
            })

            ScrollTrigger.update()
            setInterfaceColor("cream")
            setHeaderCapsuleVariant("soft-white")

            history.pushState(null, "", window.location.pathname + window.location.search)
          },
          {
            mode: "circle",
          },
        )
      } finally {
        lenis.start()
      }
    }

    heroLinks.forEach((link) => {
      link.addEventListener("click", handleHeroClick)
    })
  }

  // ----------------------
  // 6. Handle homepage links
  // ----------------------
  function setupInternalLinks(references) {
    const links = document.querySelectorAll("a[href]")

    links.forEach((link) => {
      const linkUrl = new URL(link.href, window.location.href)
      const hash = linkUrl.hash

      if (!supportedHashes.has(hash) || hash === "#hero") return

      link.addEventListener("click", async (event) => {
        if (
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return
        }

        const targetScroll = getTargetScroll(hash, references)

        if (targetScroll == null) return

        loadSectionBackground(hash)

        if (hash === "#projects") {
          preloadProjectImages()
          references.ensureProjectPhysics()
        }

        event.preventDefault()
        event.stopPropagation()

        const scrollDistance = Math.abs(targetScroll - window.scrollY)

        const shouldUseTransition = scrollDistance > getTransitionDistanceThreshold()

        // Close destination : lenis scroll
        if (!shouldUseTransition) {
          scrollToSection(hash, references)
          return
        }

        // Far destination : transition
        pageTransition.setColor(interfaceColorByHash[hash])

        lenis.stop()

        try {
          await pageTransition.run(() => {
            scrollToSection(hash, references, {
              immediate: true,
            })
          })
        } finally {
          lenis.start()
        }
      })
    })
  }

  // ----------------------
  // 7. Public initialization
  // ----------------------
  function init(references) {
    setupHeroLink()
    setupInternalLinks(references)

    window.addEventListener("hashchange", () => {
      const hash = window.location.hash

      if (!supportedHashes.has(hash)) return

      loadSectionBackground(hash)

      if (hash === "#projects") {
        preloadProjectImages()
        references.ensureProjectPhysics()
      }

      resetNativeAnchorContainer(hash)

      requestAnimationFrame(() => {
        scrollToSection(hash, references, {
          immediate: true,
          historyMode: "replace",
        })
      })
    })

    const initialScrollOffset = initialHash ? 0 : homeScrollIntent.offset

    function finishHomeStartup() {
      // Hand scroll restoration back to the browser, and to ScrollTrigger's snapshot
      ScrollTrigger.clearScrollMemory("auto")

      if (!isRestoringHomeScroll) return

      document.documentElement.dataset.homeLoaderState = "skipped"
    }

    if (!initialHash && initialScrollOffset <= 0) {
      finishHomeStartup()

      if (shouldRevealIncomingTransition) {
        pageTransition.reveal({
          mode: "circle",
        })
      }

      return
    }

    function restoreInitialScroll() {
      // Recalculate every pin after all page resources are loaded
      ScrollTrigger.refresh()
      lenis.resize()

      if (initialHash) {
        loadSectionBackground(initialHash)

        if (initialHash === "#projects") {
          preloadProjectImages()
          references.ensureProjectPhysics()
        }
      }

      // One frame so the refresh above is committed to layout
      requestAnimationFrame(async () => {
        try {
          if (initialHash) {
            scrollToSection(initialHash, references, {
              immediate: true,
              historyMode: "replace",
            })
          } else {
            lenis.scrollTo(initialScrollOffset, {
              immediate: true,
              force: true,
            })

            ScrollTrigger.update()
          }
        } finally {
          finishHomeStartup()
        }

        if (shouldRevealIncomingTransition) {
          await pageTransition.reveal(initialHash ? undefined : { mode: "circle" })
        }
      })
    }

    if (document.readyState === "complete") {
      restoreInitialScroll()
    } else {
      window.addEventListener("load", restoreInitialScroll, {
        once: true,
      })
    }
  }

  return {
    init,
  }
}

function loadTrajectoryBackground() {
  document.querySelector(".trajectory-sentences")?.classList.add("is-background-ready")
  void trajectoryBackground?.prepare()
}

function loadFooterBackground() {
  document.querySelector(".next-section")?.classList.add("is-background-ready")
}

function setupDeferredHomeBackgrounds() {
  const targets = [
    {
      element: document.querySelector(".trajectory-sentences"),
      load: loadTrajectoryBackground,
    },
    {
      element: document.querySelector(".next-section"),
      load: loadFooterBackground,
    },
  ].filter(({ element }) => element)

  if (!targets.length) return

  const loaders = new Map(targets.map(({ element, load }) => [element, load]))

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return

        loaders.get(entry.target)?.()
        observer.unobserve(entry.target)
      })
    },
    {
      rootMargin: "2000px 0px",
    },
  )

  targets.forEach(({ element }) => {
    observer.observe(element)
  })
}

function setupScrollIndicator() {
  const root = document.querySelector(".scroll-indicator")
  if (!root) return

  const items = [...root.querySelectorAll(".scroll-indicator__item")]

  const sections = [
    ".hero-three",
    ".manifesto",
    ".trajectory",
    ".toolkit",
    ".projects",
    ".next-section",
  ].map((selector) => document.querySelector(selector))

  if (!items.length || sections.some((section) => !section)) return

  let currentIndex = 0
  let hoveredIndex = null
  let isHidden = false

  function renderItems(displayedIndex) {
    items.forEach((item, index) => {
      const distanceFromActive = Math.abs(index - displayedIndex)
      const isActive = distanceFromActive === 0

      item.classList.toggle("is-active", isActive)
      item.classList.toggle("is-neighbor", distanceFromActive === 1)
    })
  }

  function setIndicatorHidden(shouldHide) {
    if (isHidden === shouldHide) return

    isHidden = shouldHide

    root.classList.toggle("is-hidden", shouldHide)
    root.toggleAttribute("inert", shouldHide)

    if (shouldHide) {
      hoveredIndex = null
      renderItems(currentIndex)
    }
  }

  function setActiveItem(activeIndex) {
    currentIndex = activeIndex

    items.forEach((item, index) => {
      const isActive = index === activeIndex

      if (isActive) {
        item.setAttribute("aria-current", "location")
      } else {
        item.removeAttribute("aria-current")
      }
    })

    renderItems(hoveredIndex ?? currentIndex)
  }

  sections.forEach((section, index) => {
    const nextSection = sections[index + 1]

    ScrollTrigger.create({
      trigger: section,
      start: "top center",
      endTrigger: nextSection,
      end: nextSection ? "top center" : "max",
      invalidateOnRefresh: true,

      onUpdate: (self) => {
        items[index].style.setProperty("--scroll-indicator-progress", self.progress)

        const isLastSection = index === sections.length - 1

        if (isLastSection) {
          const distanceFromPageEnd = ScrollTrigger.maxScroll(window) - window.scrollY

          setIndicatorHidden(distanceFromPageEnd <= 48)
        }
      },

      onEnter: () => {
        setActiveItem(index)
      },

      onEnterBack: () => {
        setActiveItem(index)
      },
    })
  })

  items.forEach((item, index) => {
    item.addEventListener("pointerenter", (event) => {
      if (event.pointerType === "touch") return

      hoveredIndex = index
      renderItems(hoveredIndex)
    })
  })

  root.addEventListener("pointerleave", () => {
    hoveredIndex = null
    renderItems(currentIndex)
  })

  setActiveItem(0)
}

// Header setup theme
function setupHeaderTheme() {
  // Hero to manifesto
  const manifesto = document.querySelector(".manifesto")

  ScrollTrigger.create({
    trigger: manifesto,
    start: "top -425px",

    onEnter: () => {
      setInterfaceColor("dark")
    },

    onEnterBack: () => {
      setInterfaceColor("dark")
    },

    onLeaveBack: () => {
      setInterfaceColor("cream")
    },

    markers: false,
  })

  // Manifesto to trajectory
  const trajectory = document.querySelector(".trajectory")

  ScrollTrigger.create({
    trigger: trajectory,
    start: "top 80px",

    onEnter: () => {
      setInterfaceColor("cream")
    },

    onEnterBack: () => {
      setInterfaceColor("cream")
    },

    onLeaveBack: () => {
      setInterfaceColor("dark")
    },

    markers: false,
  })

  // Project to next section
  const nextSection = document.querySelector(".next-section")

  ScrollTrigger.create({
    trigger: nextSection,
    start: "top 80px",

    onEnter: () => {
      setInterfaceColor("cream")
    },

    onEnterBack: () => {
      setInterfaceColor("cream")
    },

    onLeaveBack: () => {
      setInterfaceColor("dark")
    },
  })
}

// Hero render visibility
function setupHeroRenderVisibility(threeHero) {
  if (!threeHero) return

  const frame = document.querySelector(".hero-three__frame")

  if (!frame) {
    threeHero.start()
    return
  }

  const updateRendering = (isVisible) => {
    if (isVisible) {
      threeHero.start()
      return
    }

    threeHero.pause()
  }

  const observer = new IntersectionObserver(([entry]) => {
    updateRendering(entry.isIntersecting)
  })

  observer.observe(frame)

  // Sync immediately before the observer's first callback.
  const frameRect = frame.getBoundingClientRect()
  const isInitiallyVisible = frameRect.bottom > 0 && frameRect.top < window.innerHeight

  updateRendering(isInitiallyVisible)
}

// Scene Hero
function getHeroScrollDistance() {
  const isTouchDevice = window.matchMedia("(hover: none) and (pointer: coarse)").matches

  return isTouchDevice ? 2800 : 3500
}

function setupHeroScroll(threeHero) {
  return ScrollTrigger.create({
    trigger: ".hero-three",
    start: "top top",
    end: () => `+=${getHeroScrollDistance()}`,
    scrub: true,
    pin: true,
    invalidateOnRefresh: true,
    markers: false,

    onEnter: () => {
      setHeaderCapsuleVariant("soft-white")
      threeHero.setInteractive(true)
    },

    onEnterBack: () => {
      setHeaderCapsuleVariant("soft-white")
      threeHero.setInteractive(true)
    },

    onLeave: () => {
      setHeaderCapsuleVariant()
      threeHero.setInteractive(false)
    },

    onLeaveBack: () => {
      setHeaderCapsuleVariant("soft-white")
      threeHero.setInteractive(false)
    },

    onUpdate: (self) => {
      threeHero.setScrollProgress(self.progress, self.getVelocity())
    },
  })
}
// Hero to Manifesto transition
function setupHeroToManifestoTransition(heroScrollTrigger) {
  if (!heroScrollTrigger) return

  const getTransitionDistance = () => gsap.utils.clamp(500, 850, window.innerHeight * 0.85)

  gsap.to(".hero-three__frame", {
    scaleX: getResponsiveHeroFrameScaleX,
    scaleY: 0.9,
    ease: "power2.in",

    scrollTrigger: {
      trigger: ".hero-three",
      // Keep the frame untouched until the 3D scene has reached its final scroll state.
      start: () => heroScrollTrigger.end,
      end: () => heroScrollTrigger.end + getTransitionDistance(),
      scrub: true,
      invalidateOnRefresh: true,
      markers: false,
    },
  })
}

// Manifesto
function setupManifesto() {
  const text = document.querySelector(".manifesto .text")
  if (!text) return

  wrapLettersInSpan(text)

  const letters = document.querySelectorAll(".manifesto .letter")

  const getScrollDistance = () => {
    return text.clientWidth - document.body.clientWidth
  }

  const manifestoScrollRatio = 0.65
  const getScrollDuration = () => {
    return getScrollDistance() * manifestoScrollRatio
  }

  const getPinDistance = () => {
    const scrollDuration = getScrollDuration()
    const overlapDistance = Math.min(1175 * manifestoScrollRatio, scrollDuration * 0.2)

    return Math.max(scrollDuration - overlapDistance, 1)
  }

  // 1. Pin only
  ScrollTrigger.create({
    trigger: ".manifesto .container",
    start: "top top",
    end: () => `+=${getPinDistance()}`,
    pin: true,
    invalidateOnRefresh: true,
    markers: false,
  })

  // 2. Text horizontal animation
  const scrollTween = gsap.to(text, {
    x: () => -getScrollDistance(),
    ease: "none",
    scrollTrigger: {
      trigger: ".manifesto .container",
      start: "top top",
      end: () => `+=${getScrollDuration()}`,
      scrub: true,
      invalidateOnRefresh: true,
      markers: false,
    },
  })

  letters.forEach((letter) => {
    gsap.from(letter, {
      yPercent: (Math.random() - 0.5) * 400,
      rotation: (Math.random() - 0.5) * 60,
      ease: "elastic.out(1.2, 1)",
      scrollTrigger: {
        trigger: letter,
        containerAnimation: scrollTween,
        start: "left 100%",
        end: "left 0%",
        scrub: 0.5,
      },
    })
  })

  // Manifesto to trajectory transition
  const manifesto = document.querySelector(".manifesto")

  gsap.to(".manifesto .container", {
    scaleX: getResponsiveFrameScaleX,
    scaleY: 0.98,
    borderRadius: "0px 0px 32px 32px",
    ease: "none",

    scrollTrigger: {
      trigger: ".trajectory",
      start: "top bottom",
      end: "top 30%",
      scrub: true,
      invalidateOnRefresh: true,
      markers: false,

      onUpdate: (self) => {
        manifesto.classList.toggle("is-exiting", self.progress > 0)
      },

      onLeaveBack: () => {
        manifesto.classList.remove("is-exiting")
      },
    },
  })
}

// Trajectory title
function setupTrajectory() {
  const root = document.querySelector(".trajectory")
  root.querySelectorAll(".container").forEach((container) => {
    const title = container.querySelector(".title")
    wrapLettersInSpan(title)

    // Inner layer for the entry offset, the pinned h2 stays untouched
    const titleMotion = document.createElement("span")
    titleMotion.className = "trajectory-title__motion"
    titleMotion.append(...title.childNodes)
    title.append(titleMotion)

    const getDistance = () => {
      return Math.max(container.clientHeight - title.clientHeight, 1)
    }

    ScrollTrigger.create({
      trigger: container,
      pin: title,
      start: "top top",
      end: () => `+=${getDistance() * 1.2}`,
      invalidateOnRefresh: true,
    })

    // Bring the title closer during Manifesto to trajectory transition
    gsap.fromTo(
      titleMotion,
      {
        y: () => -getDistance() * 0.5,
      },
      {
        y: 0,
        ease: "none",
        scrollTrigger: {
          trigger: root,
          start: "top bottom",
          end: "top 30%",
          scrub: true,
          invalidateOnRefresh: true,
          markers: false,
        },
      },
    )

    const letters = titleMotion.querySelectorAll(".letter")
    letters.forEach((letter) => {
      const randomDistanceRatio = Math.random()
      const getRandomDistance = () => getDistance() * randomDistanceRatio

      gsap.from(letter, {
        y: getRandomDistance,
        ease: "none",
        scrollTrigger: {
          trigger: container,
          start: "top top",
          end: () => `+=${getRandomDistance()}`,
          scrub: true,
          invalidateOnRefresh: true,
        },
      })
    })

    gsap.to(title, {
      scale: 0.6,
      transformOrigin: "center center",
      ease: "none",
      scrollTrigger: {
        trigger: container,
        start: () => `top+=${getDistance() * 0.8} top`,
        end: () => `top+=${getDistance() * 1.5} top`,
        scrub: true,
        invalidateOnRefresh: true,
      },
    })

    const weightDuration = 200

    gsap.to(title, {
      fontWeight: 400,
      ease: "none",
      scrollTrigger: {
        trigger: container,
        start: () => `top+=${getDistance()} top`,
        end: () => `top+=${getDistance() + weightDuration} top`,
        scrub: true,
        invalidateOnRefresh: true,
        markers: false,
      },
    })
  })
}

// Trajectory sentences
function setupTrajectorySentences() {
  const supportsPointerInteraction = window.matchMedia("(hover: hover) and (pointer: fine)").matches

  const webglSequence = {
    idlePeak: 0.01,
    idleStable: 0.012,
    interactionMax: supportsPointerInteraction ? 1 : 0,
    zoomActive: 1.02,
    neutralHold: 0.08,
    wakeDuration: 0.4,
    wakePeakRatio: 0.5,
    playDuration: 0.42,
  }
  const shaderState = { idleStrength: 0, interactionStrength: 0, zoom: 1 }
  const root = document.querySelector(".trajectory-sentences")
  if (!root) return

  const pinHeight = root.querySelector(".trajectory-sentences__pin-height")
  const container = root.querySelector(".trajectory-sentences__container")
  const sentences = root.querySelectorAll(".trajectory-sentences__sentence")
  const finalSentence = sentences[sentences.length - 1]

  const visualLeft = root.querySelector(".trajectory-sentences__visual--left")
  const visualRight = root.querySelector(".trajectory-sentences__visual--right")

  trajectoryBackground = createTrajectoryBackground(root, { reducedMotion: prefersReducedMotion })

  // Initial visuals positions
  gsap.set(visualLeft, {
    xPercent: -101,
    yPercent: -50,
  })

  gsap.set(visualRight, {
    xPercent: 101,
    yPercent: -50,
  })

  sentences.forEach((sentence) => {
    wrapLettersInSpan(sentence)
  })

  const finalSentenceLetters = finalSentence.querySelectorAll("span")
  const firstSentence = sentences[0]
  const firstSentenceLetters = firstSentence.querySelectorAll("span")

  // Keep "D'abord" outside the frame until its dedicated entrance.
  gsap.set(firstSentence, {
    yPercent: 50,
    y: "50vh",
  })

  gsap.set(firstSentenceLetters, {
    yPercent: 50,
    y: "50vh",
  })

  // Pin full sequence
  ScrollTrigger.create({
    trigger: pinHeight,
    start: "top top",
    end: "bottom bottom",
    pin: container,
    markers: false,
  })

  // Timeline
  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: pinHeight,
      start: "top top",
      end: "bottom bottom",
      scrub: true,
      markers: false,
    },
  })

  // Give the trajectory title time to leave before revealing "D'abord".
  tl.to({}, { duration: 0.3 })

  tl.to(firstSentence, {
    yPercent: 0,
    y: 0,
    ease: "power3.out",
  })

  tl.to(
    firstSentenceLetters,
    {
      yPercent: 0,
      y: 0,
      ease: "power3.out",
      stagger: 0.02,
    },
    "<",
  )

  sentences.forEach((sentence, index) => {
    const nextSentence = sentences[index + 1]

    const isNextDialogue = nextSentence?.classList.contains("is-dialogue")
    const isNextBoth = nextSentence?.classList.contains("is-both")

    // Switch to cream theme "Aujourd'hui"
    if (isNextDialogue) {
      tl.set(
        [root],
        {
          backgroundColor: "var(--color-cream)",
        },
        "<+=0.2",
      )

      tl.set(
        sentences,
        {
          color: "var(--color-dark)",
        },
        "<",
      )

      tl.to(
        {},
        {
          duration: 0.0001,

          onStart: () => {
            setInterfaceColor("dark")
          },
          onReverseComplete: () => {
            setInterfaceColor("cream")
          },
        },
        "<",
      )
    }

    // Visuals enter
    if (isNextBoth) {
      tl.to(
        visualLeft,
        {
          xPercent: -30,
          opacity: 1,
          ease: "power3.out",
        },
        "<+=0.15",
      )

      tl.to(
        visualRight,
        {
          xPercent: 30,
          opacity: 1,
          ease: "power3.out",
        },
        "<",
      )
    }

    if (!nextSentence) return

    // Exit sentence
    tl.to(sentence, {
      yPercent: -50,
      y: "-50vh",
      ease: "power3.in",
    })

    // Exit letter stag
    tl.to(
      sentence.querySelectorAll("span"),
      {
        yPercent: -50,
        y: "-50vh",
        stagger: 0.02,
        ease: "power3.in",
      },
      "<+=0.1",
    )

    // Entry sentence
    tl.from(
      nextSentence,
      {
        yPercent: 50,
        y: "50vh",
        ease: "power3.out",
      },
      "<+=0.10",
    )

    // Entry letter stag
    tl.from(
      nextSentence.querySelectorAll("span"),
      {
        yPercent: 50,
        y: "50vh",
        ease: "power3.out",
        stagger: 0.02,
      },
      "<",
    )

    // Final image sequence "les deux"
    if (isNextBoth) {
      // 1 join
      tl.to(
        visualLeft,
        {
          xPercent: 0,
          width: "calc(50vw + 1px)",
          ease: "power3.inOut",
        },
        "<",
      )

      tl.to(
        visualRight,
        {
          xPercent: 0,
          width: "calc(50vw + 1px)",
          ease: "power3.inOut",
        },
        "<",
      )

      tl.set(
        nextSentence,
        {
          color: "var(--color-cream)",
        },
        ">-=0.05",
      )

      // 2 fullscreen
      tl.to(
        [visualLeft, visualRight],
        {
          height: "100vh",
          borderRadius: "0px",
          ease: "power3.inOut",
        },
        ">+=0.2",
      )

      tl.addLabel("trajectoryStaticHandoff", tl.recent().endTime())

      // Change header color over fullscreen visuals
      tl.to(
        {},
        {
          duration: 0.001,

          onStart: () => {
            setInterfaceColor("cream")
            setHeaderCapsuleVariant("soft-white")
          },

          onReverseComplete: () => {
            setInterfaceColor("dark")
            setHeaderCapsuleVariant()
          },
        },
        ">-35%",
      )

      if (prefersReducedMotion) {
        tl.to({}, { duration: 0.4 })
      } else {
        // Keep the validated handoff neutral before waking the shader.
        tl.to({}, { duration: webglSequence.neutralHold })
        tl.addLabel("trajectoryWakeUp")

        tl.to(shaderState, {
          idleStrength: webglSequence.idlePeak,
          duration: webglSequence.wakeDuration * webglSequence.wakePeakRatio,
          ease: "sine.inOut",
        })
        tl.to(shaderState, {
          idleStrength: webglSequence.idleStable,
          duration: webglSequence.wakeDuration * (1 - webglSequence.wakePeakRatio),
          ease: "sine.inOut",
        })
        tl.to(
          shaderState,
          {
            interactionStrength: webglSequence.interactionMax,
            zoom: webglSequence.zoomActive,
            duration: webglSequence.wakeDuration,
            ease: "sine.inOut",
          },
          "trajectoryWakeUp",
        )

        if (supportsPointerInteraction) {
          tl.to(
            finalSentenceLetters,
            {
              color: "rgba(245, 231, 223, 0)",
              duration: webglSequence.wakeDuration,
              ease: "sine.inOut",
            },
            "trajectoryWakeUp",
          )

          tl.to(
            finalSentence,
            {
              "--trajectory-text-stroke-width": "1.5px",
              duration: webglSequence.wakeDuration,
              ease: "sine.inOut",
            },
            "trajectoryWakeUp",
          )
        }

        tl.addLabel("trajectoryPlay")
        tl.to({}, { duration: webglSequence.playDuration })
      }

      // Change backgroud color for transition
      tl.set(
        root,
        {
          backgroundColor: "var(--color-black)",
        },
        ">",
      )
    }
  })
  const syncBackground = () => {
    const handoff = tl.labels.trajectoryStaticHandoff
    const play = tl.labels.trajectoryPlay

    trajectoryBackground.setActive(handoff !== undefined && tl.time() >= handoff, shaderState)

    finalSentence.classList.toggle(
      "is-pointer-play",
      supportsPointerInteraction &&
        play !== undefined &&
        tl.time() >= play &&
        tl.time() < tl.duration(),
    )
  }

  tl.eventCallback("onUpdate", syncBackground)
  ScrollTrigger.addEventListener("refresh", syncBackground)
  syncBackground()

  return tl
}

// Trajectory to Toolkit transition
function setupTrajectoryToToolkitTransition() {
  const trajectoryFrame = document.querySelector(".trajectory-sentences__container")
  const trajectoryContent = document.querySelector(".trajectory-sentences__center")
  const toolkit = document.querySelector(".toolkit")
  const toolkitTitle = document.querySelector(".toolkit__title")

  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: toolkit,
      start: "top bottom",
      end: "top 30%",
      scrub: true,
      invalidateOnRefresh: true,
      markers: false,
      onEnter: () => setHeaderCapsuleVariant(),
      onLeaveBack: () => setHeaderCapsuleVariant("soft-white"),
    },
  })

  tl.to(
    trajectoryFrame,
    {
      scaleX: getResponsiveFrameScaleX,
      scaleY: 0.98,
      borderRadius: "0px 0px 32px 32px",
      transformOrigin: "center top",
      ease: "none",
    },
    0,
  )

  tl.to(
    trajectoryContent,
    {
      scale: 0.9,
      transformOrigin: "center center",
      ease: "none",
    },
    0,
  )

  tl.fromTo(
    toolkitTitle,
    {
      fontWeight: 500,
    },
    { fontWeight: 700, ease: "none" },
    0,
  )
}

// Toolkit
function setupToolkit() {
  // ----------------------
  // 1. Dom selections
  // ----------------------
  const root = document.querySelector(".toolkit")
  if (!root) return

  const pinHeight = root.querySelector(".toolkit__pin-height")
  const container = root.querySelector(".toolkit__container")
  const wheel = root.querySelector(".toolkit__wheel--frontend")
  const slots = root.querySelectorAll(".toolkit__wheel--frontend .toolkit__slot")
  const artWheel = root.querySelector(".toolkit__wheel--art-direction")
  const artSlots = root.querySelectorAll(".toolkit__wheel--art-direction .toolkit__slot")

  const transitionSlot = root.querySelector(".toolkit__slot--transition")
  const flipCard = transitionSlot?.querySelector(".toolkit-card__flipper")

  const subtitleFront = root.querySelector(".toolkit__subtitle--front")
  const subtitleArt = root.querySelector(".toolkit__subtitle--art")

  const artTransitionCard = artWheel?.querySelector(".toolkit-card--transition")
  const artTransitionSlot = artTransitionCard?.closest(".toolkit__slot")
  const artTransitionReveal = artTransitionCard?.querySelector(".toolkit-card__cream-reveal")

  const cardReveal = createToolkitCardReveal(artTransitionReveal, {
    reducedMotion: prefersReducedMotion,
  })

  // ----------------------
  // 2. Settings
  // ----------------------
  // Cards
  const angle = 3.5
  const cardScalePop = 0.94
  const cardEasePop = "elastic.out(0.6, 0.3)"
  const cardDurationPop = 0.5

  // Phases
  const frontDeckEnd = 0.3
  const collapseEnd = 0.35
  const flipEnd = 0.45
  const artDeckEnd = 0.75
  const finalCollapseEnd = 0.8
  const fullscreenStart = 0.95
  const headerDarkStart = 0.975
  const finalTransitionEnd = 1

  // Interactions
  const hoverZIndex = slots.length + 10

  // Click wave
  const waveStepDelay = 0.045
  const waveAttenuation = 0.18
  const waveMinimumStrength = 0.25

  const wavePressY = 6
  const wavePressScale = 0.97
  const wavePressDuration = 0.08

  const waveLiftY = -24
  const waveLiftScale = 1.07
  const waveLiftDuration = 0.18
  const waveSettleDuration = 0.42

  // Final transition card
  const transitionCardFullscreenOverscan = 1.1
  const transitionCardFullScreenEase = gsap.parseEase("power3.in")

  // ----------------------
  // 3. States
  // ----------------------
  let currentIndex = 0
  let currentWheelIndex = 0

  let currentArtIndex = 0
  let currentArtWheelIndex = 0

  let isCollapsed = false
  let transitionCardFullscreenScale = 8
  let transitionCardFullscreenViewport = ""

  let activeWaveTimeline = null
  let activeWaveSlot = null
  let activeWaveBaseZIndex = 0

  // ----------------------
  // 4. Helpers
  // ----------------------
  // Convert progress into 0 -> 1
  const getPhaseProgress = (progress, start, end) => {
    return gsap.utils.clamp(0, 1, (progress - start) / (end - start))
  }

  const getWaveStrength = (distance) => {
    return Math.max(waveMinimumStrength, 1 - distance * waveAttenuation)
  }

  const getTransitionCardFullscreenScale = () => {
    const viewportKey = `${window.innerWidth}x${window.innerHeight}`

    if (viewportKey === transitionCardFullscreenViewport) {
      return transitionCardFullscreenScale
    }

    const rect = artTransitionCard.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2

    const requiredWidth = Math.max(centerX, window.innerWidth - centerX) * 2
    const requiredHeight = Math.max(centerY, window.innerHeight - centerY) * 2
    const cardWidth = Math.max(artTransitionCard.offsetWidth, 1)
    const cardHeight = Math.max(artTransitionCard.offsetHeight, 1)

    transitionCardFullscreenScale =
      Math.max(requiredWidth / cardWidth, requiredHeight / cardHeight) *
      transitionCardFullscreenOverscan
    transitionCardFullscreenViewport = viewportKey

    return transitionCardFullscreenScale
  }

  // ----------------------
  // 5. Initial state functions
  // ----------------------
  function resetToolkitState() {
    currentIndex = 0
    currentWheelIndex = 0

    currentArtIndex = 0
    currentArtWheelIndex = 0

    isCollapsed = false
  }

  function setInitialFrontendDeckState() {
    // Cards
    slots.forEach((slot, index) => {
      slot.classList.toggle("is-visible", index === 0)

      gsap.set(slot, {
        rotation: index * angle,
        zIndex: index + 1,
        scale: 1,
      })
    })

    wheel.classList.add("is-interactive")

    // Wheel
    gsap.set(wheel, {
      rotation: 0,
      autoAlpha: 1,
      pointerEvents: "auto",
    })
  }

  function setInitialArtDeckState() {
    artSlots.forEach((slot, index) => {
      slot.classList.toggle("is-visible", index === 0)

      gsap.set(slot, {
        rotation: index * angle,
        zIndex: index + 1,
        scale: 1,
      })
    })

    gsap.set(artTransitionCard, {
      clearProps: "transform",
    })
    gsap.set(artTransitionReveal, {
      autoAlpha: 1,
    })

    artWheel.classList.remove("is-interactive")

    gsap.set(artWheel, {
      rotation: 0,
      autoAlpha: 0,
      pointerEvents: "none",
    })
  }

  function setInitialTransitionState() {
    // Flip
    gsap.set(flipCard, {
      rotationY: 0,
    })

    // Subtitle
    gsap.set(subtitleFront, {
      autoAlpha: 1,
    })
    gsap.set(subtitleArt, {
      autoAlpha: 0,
    })
  }

  function setInitialState() {
    resetToolkitState()
    setInitialFrontendDeckState()
    setInitialArtDeckState()
    setInitialTransitionState()

    cardReveal.setProgress(0)
  }

  // ----------------------
  // 6. Interctions
  // ----------------------

  // Hover cards
  function setupCardHover(deckSlots) {
    deckSlots.forEach((slot, index) => {
      const card = slot.querySelector(".toolkit-card")
      if (!card) return

      card.addEventListener("pointerenter", (event) => {
        if (event.pointerType === "touch") return

        gsap.set(slot, {
          zIndex: hoverZIndex,
        })
      })

      card.addEventListener("pointerleave", (event) => {
        if (event.pointerType === "touch") return
        if (slot === activeWaveSlot) return

        gsap.set(slot, {
          zIndex: index + 1,
        })
      })
    })
  }

  // Click animation for one card
  function createCardWave(motionTargets, strength) {
    const pressScale = 1 - (1 - wavePressScale) * strength
    const liftScale = 1 + (waveLiftScale - 1) * strength

    const timeline = gsap.timeline()

    timeline.to(motionTargets, {
      y: wavePressY * strength,
      scale: pressScale,
      duration: wavePressDuration,
      ease: "power2.in",
    })

    timeline.to(motionTargets, {
      y: waveLiftY * strength,
      scale: liftScale,
      duration: waveLiftDuration,
      ease: "power3.out",
    })

    timeline.to(motionTargets, {
      y: 0,
      scale: 1,
      duration: waveSettleDuration,
      ease: "elastic.out(0.8, 0.35)",
    })

    return timeline
  }

  // Propagate the wave through the visible cards
  function createDeckWave(deckSlots, sourceIndex) {
    const deckSlotList = [...deckSlots]
    const sourceSlot = deckSlotList[sourceIndex]

    if (!sourceSlot?.classList.contains("is-visible")) return null

    const timeline = gsap.timeline({
      paused: true,
    })

    deckSlotList.forEach((slot, slotIndex) => {
      if (!slot.classList.contains("is-visible")) return

      const distance = Math.abs(slotIndex - sourceIndex)
      const strength = getWaveStrength(distance)
      const delay = distance * waveStepDelay
      const motionTargets = slot.querySelectorAll(".toolkit-card__motion")
      const cardWave = createCardWave(motionTargets, strength)

      timeline.add(cardWave, delay)
    })

    return timeline
  }

  // Restore the selected card to its natural depth after the wave.
  function restoreActiveWaveSlot() {
    if (!activeWaveSlot) return

    const canHover = window.matchMedia("(any-hover: hover) and (any-pointer: fine)").matches

    const shouldKeepHoverDepth = canHover && activeWaveSlot.matches(":hover")

    gsap.set(activeWaveSlot, {
      zIndex: shouldKeepHoverDepth ? hoverZIndex : activeWaveBaseZIndex,
    })

    activeWaveSlot = null
    activeWaveBaseZIndex = 0
  }

  // Stop the current wave and restore its animated properties.
  function stopToolkitWave() {
    activeWaveTimeline?.kill()
    restoreActiveWaveSlot()

    const motionTargets = root.querySelectorAll(".toolkit-card__motion")

    gsap.killTweensOf(motionTargets, "y,scale")
    gsap.set(motionTargets, {
      y: 0,
      scale: 1,
    })

    activeWaveTimeline = null
  }

  // Play the wave when a card is clicked
  function setupCardWave(deckSlots) {
    deckSlots.forEach((slot, index) => {
      const card = slot.querySelector(".toolkit-card")

      if (!card) return

      card.addEventListener("click", () => {
        stopToolkitWave()

        const timeline = createDeckWave(deckSlots, index)

        if (!timeline) return

        activeWaveTimeline = timeline
        activeWaveSlot = slot
        activeWaveBaseZIndex = index + 1

        gsap.set(slot, {
          zIndex: hoverZIndex,
        })

        timeline.eventCallback("onComplete", () => {
          if (activeWaveTimeline === timeline) {
            restoreActiveWaveSlot()
            activeWaveTimeline = null
          }
        })

        timeline.play()
      })
    })
  }

  // ----------------------
  // 7. Init
  // ----------------------
  setInitialState()
  setupCardHover(slots)
  setupCardHover(artSlots)
  setupCardWave(slots)
  setupCardWave(artSlots)

  // ----------------------
  // 8. Scroll animation
  // ----------------------
  ScrollTrigger.create({
    trigger: pinHeight,
    start: "top top",
    end: "bottom top",
    pin: container,
    scrub: true,
    markers: false,

    onUpdate: (self) => {
      if (activeWaveTimeline) {
        stopToolkitWave()
      }

      const isCreamCoveringHeader = self.progress >= headerDarkStart

      setInterfaceColor(isCreamCoveringHeader ? "dark" : "cream")
      // ----------------------
      // 0. Decks visibility & interactive state
      // ----------------------
      const isArtDeckActive = self.progress >= flipEnd
      const isArtDeckInteractive = isArtDeckActive && self.progress < finalCollapseEnd

      gsap.set(artWheel, {
        autoAlpha: isArtDeckActive ? 1 : 0,
        pointerEvents: isArtDeckInteractive ? "auto" : "none",
      })

      gsap.set(wheel, {
        autoAlpha: isArtDeckActive ? 0 : 1,
        pointerEvents: isArtDeckActive ? "none" : "auto",
      })

      artWheel.classList.toggle("is-interactive", isArtDeckInteractive)
      wheel.classList.toggle("is-interactive", !isArtDeckActive)

      // ----------------------
      // 1. Front deck index
      // ----------------------
      const frontProgress = Math.min(self.progress / frontDeckEnd, 1)
      const index = Math.min(Math.floor(frontProgress * slots.length), slots.length - 1)

      // ----------------------
      // 2. Front cards visibility
      // ----------------------
      // Change card visibility when the index changes
      if (index !== currentIndex) {
        if (index > currentIndex) {
          for (let i = currentIndex + 1; i <= index; i++) {
            slots[i].classList.add("is-visible")

            gsap.fromTo(
              slots[i],
              {
                scale: cardScalePop,
              },
              {
                scale: 1,
                ease: cardEasePop,
                duration: cardDurationPop,
              },
            )
          }
        } else {
          for (let i = currentIndex; i > index; i--) {
            slots[i].classList.remove("is-visible")
          }
        }

        currentIndex = index
      }

      // ----------------------
      // 3. Front deck wheel opening
      // ----------------------
      // Negative rotation to keep deck centered
      if (self.progress < frontDeckEnd) {
        if (index !== currentWheelIndex) {
          gsap.to(wheel, {
            rotation: -(index * angle) / 2,
            ease: cardEasePop,
            duration: cardDurationPop,
            overwrite: true,
          })

          currentWheelIndex = index
        }

        return
      }

      // ----------------------
      // 4. Front deck collapse
      // ----------------------
      // Cards collapse to center between frontDeckEnd and collapseEnd
      const collapseProgress = getPhaseProgress(self.progress, frontDeckEnd, collapseEnd)

      slots.forEach((slot, slotIndex) => {
        const openRotation = slotIndex * angle
        const currentRotation = openRotation * (1 - collapseProgress)

        gsap.set(slot, {
          rotation: currentRotation,
        })
      })

      const openWheelRotation = -((slots.length - 1) * angle) / 2
      const currentWheelRotation = openWheelRotation * (1 - collapseProgress)

      gsap.set(wheel, {
        rotation: currentWheelRotation,
      })

      // ----------------------
      // 5. Collapse visibility
      // ----------------------
      // After collapse, keep only Shopify/Figma card visible
      if (self.progress >= collapseEnd && !isCollapsed) {
        slots.forEach((slot) => {
          if (slot !== transitionSlot) {
            slot.classList.remove("is-visible")
          }
        })

        transitionSlot.classList.add("is-visible")
        isCollapsed = true
      }

      // Scroll back, restore Front cards visible
      if (self.progress < collapseEnd && isCollapsed) {
        slots.forEach((slot, index) => {
          slot.classList.toggle("is-visible", index <= currentIndex)
        })

        isCollapsed = false
      }

      // ----------------------
      // 6. Flip + subtitle transition
      // ----------------------
      const flipProgress = getPhaseProgress(self.progress, collapseEnd, flipEnd)

      // Flip card
      gsap.set(flipCard, {
        rotationY: 180 * flipProgress,
      })

      // Switch subtitle
      const subtitleFadeOutProgress = getPhaseProgress(flipProgress, 0, 0.5)
      const subtitleFadeInProgress = getPhaseProgress(flipProgress, 0.5, 1)

      gsap.set(subtitleFront, {
        autoAlpha: 1 - subtitleFadeOutProgress,
      })
      gsap.set(subtitleArt, {
        autoAlpha: subtitleFadeInProgress,
      })

      // ----------------------
      // 8. Art Direction card visibility
      // ----------------------
      const artProgress = getPhaseProgress(self.progress, flipEnd, artDeckEnd)
      const artIndex = Math.min(Math.floor(artProgress * artSlots.length), artSlots.length - 1)

      if (artIndex !== currentArtIndex) {
        if (artIndex > currentArtIndex) {
          for (let i = currentArtIndex + 1; i <= artIndex; i++) {
            artSlots[i].classList.add("is-visible")

            gsap.fromTo(
              artSlots[i],
              {
                scale: cardScalePop,
              },
              {
                scale: 1,
                ease: cardEasePop,
                duration: cardDurationPop,
              },
            )
          }
        } else {
          for (let i = currentArtIndex; i > artIndex; i--) {
            artSlots[i].classList.remove("is-visible")
          }
        }

        currentArtIndex = artIndex
      }

      // ----------------------
      // 9. Art Direction wheel opening
      // ----------------------
      if (artIndex !== currentArtWheelIndex) {
        gsap.to(artWheel, {
          rotation: -(artIndex * angle) / 2,
          ease: cardEasePop,
          duration: cardDurationPop,
          overwrite: true,
        })
      }

      currentArtWheelIndex = artIndex

      // ----------------------
      // 10. Art Direction deck collpase
      // ----------------------
      if (self.progress >= artDeckEnd) {
        const finalCollapseProgress = getPhaseProgress(self.progress, artDeckEnd, finalCollapseEnd)

        gsap.killTweensOf(artWheel)

        artSlots.forEach((slot, slotIndex) => {
          const openRotation = slotIndex * angle
          const currentRotation = openRotation * (1 - finalCollapseProgress)

          gsap.set(slot, {
            rotation: currentRotation,
          })
        })

        const openArtWheelRotation = -((artSlots.length - 1) * angle) / 2
        const currentArtWheelRotation = openArtWheelRotation * (1 - finalCollapseProgress)

        gsap.set(artWheel, {
          rotation: currentArtWheelRotation,
        })

        gsap.set(artTransitionSlot, {
          zIndex: artSlots.length + 20,
        })
      }

      // ----------------------
      // 11. Transition card cream reveal
      // ----------------------
      const revealProgress = getPhaseProgress(self.progress, finalCollapseEnd, fullscreenStart)

      cardReveal.setProgress(revealProgress)

      // ----------------------
      // 12. Transition card hold
      // ----------------------
      if (self.progress >= finalCollapseEnd && self.progress < fullscreenStart) {
        gsap.set(artTransitionCard, {
          scale: 1,
        })
      }

      // ----------------------
      // 13. Transition card fullscreen
      // ----------------------
      if (self.progress >= fullscreenStart) {
        const fullScreenProgress = getPhaseProgress(
          self.progress,
          fullscreenStart,
          finalTransitionEnd,
        )
        const easedFullscreenProgress = transitionCardFullScreenEase(fullScreenProgress)

        const fullscreenScale = gsap.utils.interpolate(
          1,
          getTransitionCardFullscreenScale(),
          easedFullscreenProgress,
        )

        gsap.set(artTransitionCard, {
          scale: fullscreenScale,
        })
      }
    },

    onLeave: () => {
      gsap.set(container, {
        autoAlpha: 0,
      })
    },

    onEnterBack: () => {
      gsap.set(container, {
        autoAlpha: 1,
      })
    },

    // Reset out of scroll
    onLeaveBack: () => {
      setInitialState()
    },
  })
}

// Projects
function setupProjects() {
  // ----------------------
  // 1. Dom selections
  // ----------------------
  const root = document.querySelector(".projects")
  const pinHeight = root.querySelector(".projects__pin-height")
  const container = root.querySelector(".projects__container")

  const title = root.querySelector(".projects__title")
  const list = root.querySelector(".projects__list")
  const links = root.querySelectorAll(".projects__link")

  // ----------------------
  // 2. Device capabilities
  // ----------------------

  const canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches

  // ----------------------
  // 2. Letters setup
  // ----------------------
  links.forEach((link) => {
    wrapProjectLetters(link)
  })

  // ----------------------
  // 4. Letters hover
  // ----------------------

  if (canHover) {
    setupProjectImageHover(links)

    ScrollTrigger.create({
      trigger: root,
      start: () => `top bottom+=${window.innerHeight * 5}`,
      once: true,
      invalidateOnRefresh: true,
      onEnter: preloadProjectImages,
    })
  }

  // ----------------------
  // 5. Project physics
  // ----------------------
  const projectPhysics = createProjectLetterPhysics(links, {
    monitorPerformance: !canHover,
    disabled: prefersReducedMotion,
  })

  ScrollTrigger.create({
    trigger: root,
    start: () => `top bottom+=${window.innerHeight * 5}`,
    once: true,
    invalidateOnRefresh: true,
    onEnter: projectPhysics.ensure,
  })

  // ----------------------
  // 6. Initial state
  // ----------------------
  gsap.set(title, {
    autoAlpha: 0,
  })

  gsap.set(links, {
    autoAlpha: 0,
    yPercent: 35,
  })

  // ----------------------
  // 7. ScrollTrigger Pin
  // ----------------------
  ScrollTrigger.create({
    trigger: pinHeight,
    start: "top top",
    end: "bottom bottom",
    pin: container,
    markers: false,

    onEnter: () => {
      projectPhysics.start()
    },

    onEnterBack: () => {
      projectPhysics.start()
    },

    onLeave: () => {
      projectPhysics.settleAndStop()
    },

    onLeaveBack: () => {
      projectPhysics.settleAndStop()
    },

    onUpdate: (self) => {
      const scrollVelocity = self.getVelocity()

      if (Math.abs(scrollVelocity) > 4000) {
        projectPhysics.setScrollVelocity(0)
        return
      }

      projectPhysics.setScrollVelocity(scrollVelocity)
    },
  })

  // ----------------------
  // 8. Timeline
  // ----------------------
  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: pinHeight,
      start: "top top",
      end: "bottom bottom",
      scrub: true,
      invalidateOnRefresh: true,
      markers: false,
    },
  })

  // ----------------------
  // 6. Title and links global Animations
  // ----------------------
  // Title
  tl.to(title, {
    autoAlpha: 1,
    duration: 0.08,
    ease: "power1.out",
  })

  // Links
  tl.to(
    links,
    {
      autoAlpha: 1,
      yPercent: 0,
      duration: 0.5,
      stagger: 0.18,
      ease: "power2.out",
    },
    ">",
  )

  // Cross-page navigation target after final physics
  tl.addLabel("projects-visible")

  // Projects to what's next section transition
  const nextTransitionTl = gsap.timeline({
    scrollTrigger: {
      trigger: ".next-section",
      start: "top bottom",
      end: "top 30%",
      scrub: true,
      invalidateOnRefresh: true,
      markers: false,
    },
  })

  nextTransitionTl.to(
    container,
    {
      scaleX: getResponsiveFrameScaleX,
      scaleY: 0.98,
      borderRadius: "0px 0px 32px 32px",
      transformOrigin: "center top",
      ease: "none",
    },
    0,
  )

  // Shared origin at the frame center so title and list recede as one block
  nextTransitionTl.to(
    [title, list],
    {
      scale: 0.9,
      transformOrigin: (index, target) => `50% ${container.clientHeight / 2 - target.offsetTop}px`,
      ease: "none",
    },
    0,
  )

  return {
    projectsTimeline: tl,
    ensureProjectPhysics: projectPhysics.ensure,
  }
}

function setupNextPlaygroundLinkCue() {
  if (prefersReducedMotion) return

  const link = document.querySelector(".next-section__playground-link")
  const section = link?.closest(".next-section")
  const letters = link ? Array.from(link.querySelectorAll(".playground-link__letter")) : []

  if (!section || !letters.length) return

  let cue = null

  link.addEventListener("playground-hover-start", () => {
    if (!cue) return

    cue.kill()
    cue = null
    gsap.set(letters, { yPercent: 0 })
  })

  ScrollTrigger.create({
    trigger: section,
    start: "top 75%",
    once: true,

    onEnter: () => {
      if (link.matches(":hover")) return

      const propagationDuration = 0.22
      const stagger = letters.length > 1 ? propagationDuration / (letters.length - 1) : 0

      cue = gsap.timeline({
        onComplete: () => {
          cue = null
        },
      })

      letters.forEach((letter, index) => {
        const start = index * stagger

        cue
          .to(
            letter,
            {
              yPercent: -12,
              duration: 0.12,
              ease: "power2.out",
            },
            start,
          )
          .to(
            letter,
            {
              yPercent: 5,
              duration: 0.1,
              ease: "sine.inOut",
            },
            start + 0.12,
          )
          .to(
            letter,
            {
              yPercent: 0,
              duration: 0.14,
              ease: "power2.out",
            },
            start + 0.22,
          )
      })
    },
  })
}

// What's next section
function setupNextSection() {
  // ----------------------
  // 1. DOM selections
  // ----------------------
  const root = document.querySelector(".next-section")
  if (!root) return

  const pinHeight = root.querySelector(".next-section__pin-height")
  const container = root.querySelector(".next-section__container")
  const intro = root.querySelector(".next-section__intro")

  const svg = root.querySelector(".next-section__svg")
  const path = root.querySelector("#nextPath")
  const text = root.querySelector(".next-section__text")
  const textPath = root.querySelector("#nextTextPath")
  const creamTextPart = root.querySelector("#nextTextCream")
  const gradientTextPart = root.querySelector("#nextTextGradientPart")

  const orb = root.querySelector("#nextOrb")
  const footer = root.querySelector(".next-footer")

  // ----------------------
  // 2. SVG dimensions
  // ----------------------
  const viewBox = svg.viewBox.baseVal
  const viewBoxWidth = viewBox.width
  const viewBoxHeight = viewBox.height

  svg.style.aspectRatio = viewBoxWidth / viewBoxHeight

  const svgWidth = svg.getBoundingClientRect().width
  const containerWidth = container.getBoundingClientRect().width

  const scaleFactor = containerWidth / svgWidth

  // ----------------------
  // 3. SVG camera position & Initial state
  // ----------------------
  const position = {
    x: 0,
    y: 0,
  }

  const footerCenterOffset = {
    x: 0,
    y: 0,
  }

  const footerCenterPoint = {
    x: 0,
    y: 0,
  }

  gsap.set(orb, {
    autoAlpha: 0,
  })
  gsap.set(footer, {
    clipPath: "circle(0px at 50% 50%)",
  })

  const setFooterClipPath = gsap.quickSetter(footer, "clipPath")
  const setFooterWebkitClipPath = gsap.quickSetter(footer, "webkitClipPath")

  function updateViewBox() {
    svg.setAttribute("viewBox", `${position.x} ${position.y} ${viewBoxWidth} ${viewBoxHeight}`)
  }

  // ----------------------
  // 4. Smooth viewBox movement
  // ----------------------
  const tweenOptions = {
    duration: 0.2,
    ease: "power1",
  }

  const yTo = gsap.quickTo(position, "y", tweenOptions)
  const xTo = gsap.quickTo(position, "x", {
    ...tweenOptions,
    onUpdate: updateViewBox,
  })

  // ----------------------
  // 5. Text preparation
  // ----------------------
  function getPathLengthAtX(targetX) {
    let start = 0
    let end = path.getTotalLength()

    // The path moves continuously from left to right.
    for (let i = 0; i < 20; i++) {
      const middle = (start + end) / 2
      const point = path.getPointAtLength(middle)

      if (point.x < targetX) {
        start = middle
      } else {
        end = middle
      }
    }

    return (start + end) / 2
  }

  const creamFullText = creamTextPart.textContent.trim() + " "
  const gradientFullText = gradientTextPart.textContent.trim().replace(/\.$/, "")

  const gradientMeasureText = `${gradientFullText}.`

  const creamCharacters = creamFullText.split("")
  const gradientCharacters = gradientFullText.split("")

  const totalCharacters = creamCharacters.length + gradientCharacters.length
  let previousVisibleCharacters = -1

  creamTextPart.textContent = creamFullText
  gradientTextPart.textContent = gradientMeasureText
  const textLengthWithDot = textPath.getComputedTextLength()

  gradientTextPart.textContent = gradientFullText
  const textLength = textPath.getComputedTextLength()

  const lastCharacterIndex = text.getNumberOfChars() - 1
  const textEndPoint = text.getEndPositionOfChar(lastCharacterIndex)
  const textEndLength = getPathLengthAtX(textEndPoint.x)

  const orbGap = Math.max(0, (textLengthWithDot - textLength) / 2)

  const orbLength = textEndLength + orbGap

  creamTextPart.textContent = ""
  gradientTextPart.textContent = ""

  // ----------------------
  // 6. Path points generation & Helpers
  // ----------------------
  const stepCount = 1000
  const points = []

  for (let i = 0; i < stepCount; i++) {
    const progress = i / (stepCount - 1)
    const length = progress * orbLength
    const point = path.getPointAtLength(length)

    points.push({
      x: point.x,
      y: point.y,
    })
  }

  const orbPoint = path.getPointAtLength(orbLength)

  gsap.set(orb, {
    attr: {
      cx: orbPoint.x,
      cy: orbPoint.y,
    },
    autoAlpha: 0,
  })

  // Get footer center SVG -> XY point
  function getFooterCenterAsSvgPoint() {
    footerCenterPoint.x = position.x + footerCenterOffset.x
    footerCenterPoint.y = position.y + footerCenterOffset.y

    return footerCenterPoint
  }

  // Get middle free space above footer
  function getTextLiftY() {
    const containerRect = container.getBoundingClientRect()
    const footerRect = footer.getBoundingClientRect()

    const topAreaHeight = footerRect.top - containerRect.top
    const topAreaCenterY = topAreaHeight / 2
    const containerCenterY = containerRect.height / 2

    const screenMatrix = svg.getScreenCTM()

    if (!screenMatrix) return -200

    return (topAreaCenterY - containerCenterY) / Math.abs(screenMatrix.d)
  }

  // ----------------------
  // 7. Intro fade
  // ----------------------
  gsap.to(intro, {
    autoAlpha: 0,
    // y: -30,
    ease: "power2.out",

    scrollTrigger: {
      trigger: pinHeight,
      start: "top+=3% top",
      end: "top+=7.5% top",
      scrub: true,
      markers: false,
    },
  })

  // ----------------------
  // 8. Scroll settings
  // ----------------------
  // Text path progression
  const pathStart = 0.1
  const pathEnd = 0.82

  // Keep the writing edge toward the right, then center it before the orb transition.
  const textReadingOffsetRatio = 0.1
  const textCenteringStart = 0.8
  const textReadingOffset = viewBoxWidth * scaleFactor * textReadingOffsetRatio

  // Orb transition
  const orbRevealStart = 0.06

  const orbMoveStart = 0.3
  const orbMoveEnd = 0.6

  const orbStartRadius = 14
  const orbEndRadius = 14

  // Text movement
  const textLiftStart = orbMoveStart
  const textLiftEnd = orbMoveEnd
  let textLiftY = 0
  let footerRevealMaxRadius = 0
  let previousFooterRevealProgress = 0
  let previousFooterIsInteractive = false
  let previousOrbOpacity = 0
  let previousTextY = null

  // Footer reveal when orb at center of footer
  const footerRevealStart = orbMoveEnd
  const footerRevealEnd = 1

  function refreshNextMeasurements() {
    textLiftY = getTextLiftY()
    footerRevealMaxRadius = Math.hypot(footer.offsetWidth / 2, footer.offsetHeight / 2)

    const footerRect = footer.getBoundingClientRect()
    const svgRect = svg.getBoundingClientRect()

    const footerCenterX = footerRect.left + footerRect.width / 2
    const footerCenterY = footerRect.top + footerRect.height / 2

    footerCenterOffset.x = (footerCenterX - svgRect.left) * (viewBoxWidth / svgRect.width)

    footerCenterOffset.y = (footerCenterY - svgRect.top) * (viewBoxHeight / svgRect.height)
  }

  refreshNextMeasurements()

  // Orb fade when footer reveal reach orb same radius
  const orbFadeRadiusStart = orbEndRadius * 0.85
  const orbFadeRadiusEnd = orbEndRadius * 1.35

  // ----------------------
  // 8. Pinned scroll section
  // ----------------------
  const nextSectionTrigger = ScrollTrigger.create({
    trigger: pinHeight,
    start: "top top",
    end: "bottom bottom",
    pin: container,
    scrub: true,
    markers: false,

    onRefresh: refreshNextMeasurements,

    onUpdate: (self) => {
      // Progress phases
      const pathProgress = getPhaseProgress(self.progress, pathStart, pathEnd)
      const finalProgress = getPhaseProgress(self.progress, pathEnd, 1)

      const textCenteringProgress = getPhaseProgress(pathProgress, textCenteringStart, 1)

      const textOffsetX = gsap.utils.interpolate(textReadingOffset, 0, textCenteringProgress)

      // Camera follows path
      const pointIndex = Math.floor(pathProgress * (points.length - 1))
      const point = points[pointIndex]

      yTo(point.y - viewBoxHeight / 2 - 30)
      xTo(point.x - footerCenterOffset.x - textOffsetX)

      // Text reveal
      const visibleCharacters = Math.floor(pathProgress * totalCharacters)

      if (visibleCharacters !== previousVisibleCharacters) {
        const visibleCreamCharacters = Math.min(visibleCharacters, creamCharacters.length)
        const visibleGradientCharacters = Math.max(0, visibleCharacters - creamCharacters.length)

        creamTextPart.textContent = creamCharacters.slice(0, visibleCreamCharacters).join("")
        gradientTextPart.textContent = gradientCharacters
          .slice(0, visibleGradientCharacters)
          .join("")

        previousVisibleCharacters = visibleCharacters
      }

      // Orb visibility
      const isOrbVisible = finalProgress > orbRevealStart

      // Text natural scroll movement
      const textLiftProgress = getPhaseProgress(finalProgress, textLiftStart, textLiftEnd)

      const textY = textLiftY * textLiftProgress

      if (textY !== previousTextY) {
        gsap.set(text, {
          y: textY,
        })

        previousTextY = textY
      }

      // Orb movement
      const orbMoveProgress = getPhaseProgress(finalProgress, orbMoveStart, orbMoveEnd)

      const footerCenterPoint = orbMoveProgress > 0 ? getFooterCenterAsSvgPoint() : orbPoint

      const orbX = gsap.utils.interpolate(orbPoint.x, footerCenterPoint.x, orbMoveProgress)
      const orbY = gsap.utils.interpolate(orbPoint.y, footerCenterPoint.y, orbMoveProgress)
      const orbRadius = gsap.utils.interpolate(orbStartRadius, orbEndRadius, orbMoveProgress)
      const orbColor = gsap.utils.interpolate("#ff6b4a", "#9b7cff", orbMoveProgress)

      // Footer reveal starts after orb movement
      const footerRevealProgress = getPhaseProgress(
        finalProgress,
        footerRevealStart,
        footerRevealEnd,
      )

      const footerRevealRadius = gsap.utils.interpolate(
        0,
        footerRevealMaxRadius,
        footerRevealProgress,
      )

      const shouldUpdateFooterReveal = footerRevealProgress > 0 || previousFooterRevealProgress > 0

      if (shouldUpdateFooterReveal) {
        const footerClipPath = `circle(${footerRevealRadius}px at 50% 50%)`

        setFooterClipPath(footerClipPath)
        setFooterWebkitClipPath(footerClipPath)
      }

      previousFooterRevealProgress = footerRevealProgress

      const footerIsInteractive = footerRevealProgress > 0.4

      if (footerIsInteractive !== previousFooterIsInteractive) {
        gsap.set(footer, {
          pointerEvents: footerIsInteractive ? "auto" : "none",
        })

        previousFooterIsInteractive = footerIsInteractive
      }

      // Orb fades only when footer circle reaches orb radius
      const orbFadeProgress = getPhaseProgress(
        footerRevealRadius,
        orbFadeRadiusStart,
        orbFadeRadiusEnd,
      )

      const orbOpacity = isOrbVisible ? 1 - orbFadeProgress : 0

      const shouldUpdateOrb = orbOpacity > 0 || previousOrbOpacity > 0

      if (shouldUpdateOrb) {
        gsap.set(orb, {
          autoAlpha: orbOpacity,
          attr: {
            cx: orbX,
            cy: orbY,
            r: orbRadius,
            fill: orbColor,
          },
        })
      }

      previousOrbOpacity = orbOpacity
    },
  })

  return nextSectionTrigger
}
