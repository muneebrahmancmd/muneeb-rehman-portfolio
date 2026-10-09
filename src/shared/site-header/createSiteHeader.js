export const LANGUAGE_CHANGE_REQUEST_EVENT = "portfolio:language-change-request"

export function createSiteHeader(i18n = null) {
  const header = document.querySelector(".site-header")

  const backHome = i18n?.t("header.backHome") ?? "Retour à l’accueil"
  const mainNavigation = i18n?.t("header.mainNavigation") ?? "Navigation principale"
  const journey = i18n?.t("header.journey") ?? "parcours"
  const projects = i18n?.t("header.projects") ?? "projets"
  const languageSwitch = ""

  header.innerHTML = `
    <a
      class="site-header__logo"
      href="/"
      aria-label="${backHome}"
    >
      <span
        class="site-header__logo-mark"
        aria-hidden="true"
      ></span>
    </a>

    <nav
      class="site-header__nav"
      aria-label="${mainNavigation}"
    >

      <a
        class="site-header__link site-header__link--secondary"
        href="/#parcours"
      >
        ${journey}
      </a>

      <a
        class="site-header__link site-header__link--secondary"
        href="/#toolkit"
      >
        toolkit
      </a>

      <a class="site-header__link" href="/#projects">
        ${projects}
      </a>

      <a class="site-header__link" href="/contact/">
        contact
      </a>

      ${languageSwitch}
    </nav>
  `

  const languageButton = header.querySelector(".site-header__language-switch")

  languageButton?.addEventListener("click", () => {
    const nextLanguage = i18n.language === "en" ? "fr" : "en"

    if (nextLanguage === i18n.language) return

    const commitLanguageChange = () => i18n.changeLanguage(nextLanguage)
    const request = new CustomEvent(LANGUAGE_CHANGE_REQUEST_EVENT, {
      cancelable: true,
      detail: {
        nextLanguage,
        commit: commitLanguageChange,
      },
    })

    const shouldCommitImmediately = document.dispatchEvent(request)

    if (shouldCommitImmediately) {
      commitLanguageChange()
    }
  })
}
