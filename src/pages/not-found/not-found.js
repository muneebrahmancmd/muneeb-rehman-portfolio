import { createI18n } from "../../shared/i18n"
import { setupPlaygroundLinkHover } from "../../shared/link-hover/setupPlaygroundLinkHover"
import { prefersReducedMotion } from "../../shared/motion/preference"
import { createIncomingPageTransition } from "../../shared/page-transition/createPageTransition"
import { setupCrossPageTransitions } from "../../shared/page-transition/setupCrossPageTransitions"
import { createSiteHeader } from "../../shared/site-header/createSiteHeader"

import { createNotFoundScene } from "./webgl/createNotFoundScene"

const i18n = createI18n()

i18n.applyTranslations()
createSiteHeader(i18n)
setupPlaygroundLinkHover()

const scene = createNotFoundScene({
  imageUrl: "/404/gradient-404.webp",
  reducedMotion: prefersReducedMotion,
})

const { pageTransition, shouldRevealTransition } = createIncomingPageTransition()

setupCrossPageTransitions({
  pageTransition,
})

async function revealIncomingPage() {
  if (!shouldRevealTransition) return

  await Promise.all([
    document.fonts.ready,
    scene?.ready ?? Promise.resolve(false),
  ])

  await pageTransition.reveal()
}

window.addEventListener("pagehide", () => {
  scene?.destroy()
}, { once: true })

void revealIncomingPage()
