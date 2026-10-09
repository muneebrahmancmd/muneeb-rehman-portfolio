import gsap from "gsap"

// Live previews: each hovered letter pops a small live iframe of the project's site
const PREVIEW_VIEWPORT = { width: 1280, height: 800 }
const PREVIEW_LIFETIME = 2.4
const PREVIEW_WIDTH_RATIO = 0.16

let projectPreloadStarted = false

export function preloadProjectImages() {
  const canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches

  if (!canHover) return
  if (projectPreloadStarted) return

  projectPreloadStarted = true

  document.querySelectorAll(".projects__link").forEach((link) => {
    if (!link.href) return

    const hint = document.createElement("link")
    hint.rel = "prefetch"
    hint.href = link.href
    document.head.append(hint)
  })
}

function createLivePreview(url) {
  const card = document.createElement("div")
  card.classList.add("project-letter__image", "is-preview")
  card.setAttribute("aria-hidden", "true")

  const width = Math.max(140, PREVIEW_WIDTH_RATIO * window.innerWidth)
  const height = (width * PREVIEW_VIEWPORT.height) / PREVIEW_VIEWPORT.width

  card.style.width = `${width}px`
  card.style.height = `${height}px`

  const frame = document.createElement("iframe")
  frame.src = url
  frame.tabIndex = -1
  frame.setAttribute("loading", "eager")
  frame.setAttribute("sandbox", "allow-scripts allow-same-origin")
  frame.setAttribute("referrerpolicy", "no-referrer")
  frame.style.width = `${PREVIEW_VIEWPORT.width}px`
  frame.style.height = `${PREVIEW_VIEWPORT.height}px`
  frame.style.transform = `scale(${width / PREVIEW_VIEWPORT.width})`

  card.append(frame)

  return card
}

export function setupProjectImageHover(links) {
  // ----------------------
  // Setup project hovers
  // ----------------------
  links.forEach((link) => {
    // Project data
    const projectUrl = link.href

    if (!projectUrl) return

    const letters = [...link.querySelectorAll(".project-letter__content")]

    // Project state
    const overflows = new Array(letters.length).fill(0)

    // Calculate and animate letter offsets
    function applyLetterOffsets() {
      if (letters.length === 0) return

      let spaceOnTheLeft = 0
      const targets = []

      for (let index = 0; index < overflows.length; index++) {
        const overflow = overflows[index]

        const overflowsOnTheRight = overflows.slice(index + 1)

        const spaceOnTheRight = overflowsOnTheRight.reduce((total, value) => total + value, 0)

        const x = spaceOnTheLeft - spaceOnTheRight

        spaceOnTheLeft += overflow

        targets.push(x)
      }

      gsap.to(letters, {
        x: (index) => targets[index],
        duration: 0.3,
        ease: "back.out(3)",
        overwrite: "auto",
      })
    }

    // ----------------------
    // 3. Letter hover
    // ----------------------
    letters.forEach((letter, letterIndex) => {
      if (letter.textContent.trim() === "") return

      letter.addEventListener("mouseenter", () => {
        // Prevent multiple image on same letter
        const currentImage = letter.querySelector(".project-letter__image")

        if (currentImage) return

        // Create live preview
        const image = createLivePreview(projectUrl)

        // Insert inside hovered letter
        letter.append(image)

        // Center image
        gsap.set(image, {
          xPercent: -50,
          yPercent: -50,
        })

        // Image entrance
        gsap.from(image, {
          rotation: (Math.random() - 0.5) * 20,
          scale: 1.05,
          duration: 0.3,
          ease: "back.out(2)",
        })

        // Reserve space around the image
        const letterWidth = letter.getBoundingClientRect().width
        const imageSpacingWidth = PREVIEW_WIDTH_RATIO * window.innerWidth
        const extraWidth = imageSpacingWidth - letterWidth
        const overflowX = Math.max(0, extraWidth / 2)
        overflows[letterIndex] = overflowX
        applyLetterOffsets()

        // Remove image and restore spacing
        gsap.delayedCall(PREVIEW_LIFETIME, () => {
          const parent = image.parentElement

          if (!parent) return

          overflows[letterIndex] = 0

          image.remove()

          applyLetterOffsets()

          // Letter reappearance
          gsap.from(parent, {
            rotation: (Math.random() - 0.5) * 20,
            scale: 1.05,
            duration: 0.3,
            ease: "back.out(2)",
          })
        })
      })
    })
  })
}
