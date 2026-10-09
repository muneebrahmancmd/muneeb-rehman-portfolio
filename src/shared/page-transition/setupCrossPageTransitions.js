import { LANGUAGE_CHANGE_REQUEST_EVENT } from "../site-header/createSiteHeader"

// Detect color
const DEFAULT_TRANSITION_COLOR = "cream"

const transitionColorByPath = {
  "/contact": "cream",
}

const homeTransitionColorByHash = {
  "#parcours": "cream",
  "#toolkit": "cream",
  "#projects": "dark",
  "#contact": "cream",
}

function normalizePathname(pathname) {
  return pathname.replace(/\/+$/, "") || "/"
}

function getTransitionColor(targetUrl) {
  const pathname = normalizePathname(targetUrl.pathname)

  if (pathname === "/") {
    return homeTransitionColorByHash[targetUrl.hash] || DEFAULT_TRANSITION_COLOR
  }

  if (pathname.includes("credits")) {
    return "dark"
  }

  return transitionColorByPath[pathname] || DEFAULT_TRANSITION_COLOR
}

// Detect modified click
function isModifiedClick(event) {
  return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
}

// Identify real page from url
function getDocumentKey(url) {
  const pathname = url.pathname.replace(/\/+$/, "") || "/"

  return `${url.origin}${pathname}${url.search}`
}

// Verify if link = same page
function staysOnCurrentDocument(targetUrl) {
  const currentUrl = new URL(window.location.href)

  return getDocumentKey(targetUrl) === getDocumentKey(currentUrl)
}

export function setupCrossPageTransitions({
  pageTransition,
  onNavigateStart,
  onNavigateCancelled,
}) {
  let isNavigating = false

  function cancelNavigation() {
    isNavigating = false
    onNavigateCancelled?.()
  }

  async function runNavigation(navigate) {
    if (isNavigating) return false

    isNavigating = true
    onNavigateStart?.()

    try {
      const didNavigate = await navigate()

      if (!didNavigate) {
        cancelNavigation()
      }

      return didNavigate
    } catch (error) {
      pageTransition.reset()
      cancelNavigation()

      try {
        sessionStorage.removeItem("pageTransitionPending")
        sessionStorage.removeItem("pageTransitionColor")
      } catch (storageError) {
        console.warn("Unable to clear page transition state:", storageError)
      }

      console.error("Page transition navigation failed:", error)
      return false
    }
  }

  document.addEventListener(LANGUAGE_CHANGE_REQUEST_EVENT, (event) => {
    const commitLanguageChange = event.detail?.commit

    if (typeof commitLanguageChange !== "function") return

    event.preventDefault()

    const currentUrl = new URL(window.location.href)

    void runNavigation(() =>
      pageTransition.transitionTo(() => {
        if (!commitLanguageChange()) {
          throw new Error(`Unable to switch language to ${event.detail.nextLanguage}.`)
        }
      }, {
        color: getTransitionColor(currentUrl),
      }),
    )
  })

  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return

    isNavigating = false
    pageTransition.reset()
    onNavigateCancelled?.()
  })

  document.addEventListener("click", async (event) => {
    if (event.defaultPrevented || isModifiedClick(event)) return
    if (!(event.target instanceof Element)) return

    const link = event.target.closest("a[href]")

    if (!link) return
    if (link.hasAttribute("download")) return
    if (link.target && link.target !== "_self") return

    const targetUrl = new URL(link.href, window.location.href)

    if (targetUrl.origin !== window.location.origin) return

    const currentUrl = new URL(window.location.href)

    if (staysOnCurrentDocument(targetUrl)) {
      if (targetUrl.hash === currentUrl.hash) {
        event.preventDefault()
      }

      return
    }

    event.preventDefault()

    const transitionColor = getTransitionColor(targetUrl)

    await runNavigation(() =>
      pageTransition.navigateTo(targetUrl.href, {
        color: transitionColor,
      }),
    )
  })
}
