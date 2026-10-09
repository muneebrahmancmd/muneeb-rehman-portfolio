import { createI18n } from "../../shared/i18n"
import { setupPlaygroundLinkHover } from "../../shared/link-hover/setupPlaygroundLinkHover"
import { prefersReducedMotion } from "../../shared/motion/preference"
import { createIncomingPageTransition } from "../../shared/page-transition/createPageTransition"
import { setupCrossPageTransitions } from "../../shared/page-transition/setupCrossPageTransitions"
import { createSiteHeader } from "../../shared/site-header/createSiteHeader"

import { createContactScene } from "./webgl/createContactScene"

const i18n = createI18n()

i18n.applyTranslations()
createSiteHeader(i18n)
setupPlaygroundLinkHover()

const contact = document.querySelector(".contact")
const canvas = contact?.querySelector(".contact__canvas")

const contactScene = createContactScene({
  canvas,
  root: contact,
  language: i18n.language,
  reducedMotion: prefersReducedMotion,
})

const contactSceneReady = (contactScene?.ready ?? Promise.resolve(false))
  .catch((error) => {
    console.error("Unable to resolve the Contact WebGL scene.", error)
    return false
  })
  .then((isReady) => {
    if (isReady) return true

    contact?.classList.remove("is-webgl-ready")
    contact?.classList.add("is-webgl-fallback")

    return false
  })

const { pageTransition, shouldRevealTransition } = createIncomingPageTransition()

setupCrossPageTransitions({
  pageTransition,
})

async function revealIncomingPage() {
  if (!shouldRevealTransition) return

  await Promise.all([
    document.fonts.ready,
    contactSceneReady,
  ])

  await pageTransition.reveal()
}

function handlePageHide(event) {
  if (!event.persisted) {
    contactScene?.destroy()
    return
  }

  contactScene?.stop()
}

function handlePageShow(event) {
  if (!event.persisted) return

  contactScene?.resize()
  contactScene?.start()
}

window.addEventListener("pagehide", handlePageHide)
window.addEventListener("pageshow", handlePageShow)

void revealIncomingPage()
