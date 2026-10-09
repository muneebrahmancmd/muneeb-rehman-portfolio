import gsap from "gsap"

import { prefersReducedMotion } from "../motion/preference"

export function setupPlaygroundLinkHover() {
  if (prefersReducedMotion) return
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return

  const links = document.querySelectorAll(
    ".site-header__link--playground, .playground-link",
  )

  links.forEach((link) => {
    if (link.dataset.playgroundHoverReady === "true") return

    const isLargePlaygroundLink = link.matches(
      ".next-section__playground-link",
    )
    const label = isLargePlaygroundLink
      ? link.querySelector(".next-section__playground-label")
      : link
    const arrow = isLargePlaygroundLink
      ? link.querySelector(".next-section__playground-arrow")
      : null
    const text = label?.textContent.trim().replace(/\s+/g, " ")

    if (!text) return

    const accessibleLabel = link.getAttribute("aria-label") || text
    const visualText = document.createElement("span")

    visualText.className = "playground-link__letters"
    visualText.setAttribute("aria-hidden", "true")

    text.split(" ").forEach((word, wordIndex) => {
      if (wordIndex > 0) visualText.append(" ")

      const wordElement = document.createElement("span")
      wordElement.className = "playground-link__word"

      Array.from(word).forEach((character) => {
        const letter = document.createElement("span")

        letter.className = "playground-link__letter"
        letter.textContent = character
        wordElement.append(letter)
      })

      visualText.append(wordElement)
    })

    link.setAttribute("aria-label", accessibleLabel)
    link.replaceChildren(visualText)

    if (arrow) {
      link.append(arrow)
    }

    link.dataset.playgroundHoverReady = "true"

    const letters = Array.from(
      link.querySelectorAll(".playground-link__letter"),
    )

    const waveParameters = isLargePlaygroundLink
      ? {
          riseY: -48,
          riseDuration: 0.16,
          riseEase: "power3.out",
          dipY: 20,
          dipDuration: 0.18,
          dipEase: "sine.inOut",
          returnDuration: 0.24,
          returnEase: "power3.out",
          propagationDuration: 0.5,
        }
      : {
          riseY: -32,
          riseDuration: 0.09,
          riseEase: "power2.out",
          dipY: 18,
          dipDuration: 0.11,
          dipEase: "power2.inOut",
          returnDuration: 0.14,
          returnEase: "power3.out",
          propagationDuration: Math.min(
            0.18,
            Math.max(letters.length - 1, 0) * 0.025,
          ),
        }

    const stagger =
      letters.length > 1
        ? waveParameters.propagationDuration / (letters.length - 1)
        : 0

    const wave = gsap.timeline({ paused: true })

    letters.forEach((letter, index) => {
      const start = index * stagger

      wave
        .to(
          letter,
          {
            yPercent: waveParameters.riseY,
            duration: waveParameters.riseDuration,
            ease: waveParameters.riseEase,
          },
          start,
        )
        .to(
          letter,
          {
            yPercent: waveParameters.dipY,
            duration: waveParameters.dipDuration,
            ease: waveParameters.dipEase,
          },
          start + waveParameters.riseDuration,
        )
        .to(
          letter,
          {
            yPercent: 0,
            duration: waveParameters.returnDuration,
            ease: waveParameters.returnEase,
          },
          start +
            waveParameters.riseDuration +
            waveParameters.dipDuration,
        )
    })

    link.addEventListener("pointerenter", () => {
      if (arrow) {
        gsap.to(arrow, {
          x: 3,
          y: -3,
          duration: 0.16,
          ease: "power2.out",
          overwrite: true,
        })
      }

      if (wave.isActive()) return

      link.dispatchEvent(new CustomEvent("playground-hover-start"))
      wave.restart()
    })

    link.addEventListener("pointerleave", () => {
      if (!arrow) return

      gsap.to(arrow, {
        x: 0,
        y: 0,
        duration: 0.21,
        ease: "power2.out",
        overwrite: true,
      })
    })
  })
}
