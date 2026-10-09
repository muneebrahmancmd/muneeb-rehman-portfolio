import en from "./locales/en.js"

const STORAGE_KEY = "portfolio.language"
const DEFAULT_LANGUAGE = "en"
const SUPPORTED_LANGUAGES = new Set(["en"])

const dictionaries = {
  en,
}

export function resolveLanguage() {
  try {
    const storedLanguage = localStorage.getItem(STORAGE_KEY)

    return SUPPORTED_LANGUAGES.has(storedLanguage) ? storedLanguage : DEFAULT_LANGUAGE
  } catch (error) {
    console.warn("Unable to read the language preference:", error)
    return DEFAULT_LANGUAGE
  }
}

function getTranslation(dictionary, key) {
  return key.split(".").reduce((value, segment) => value?.[segment], dictionary)
}

export function createI18n(root = document) {
  const language = resolveLanguage()
  const dictionary = dictionaries[language]

  document.documentElement.lang = language

  function t(key) {
    const translation = getTranslation(dictionary, key)

    if (typeof translation === "string") return translation

    console.warn(`Missing ${language} translation: ${key}`)
    return key
  }

  function applyTranslations() {
    root.querySelectorAll("[data-i18n]").forEach((element) => {
      element.textContent = t(element.dataset.i18n)
    })

    root.querySelectorAll("[data-i18n-attr]").forEach((element) => {
      const separatorIndex = element.dataset.i18nAttr.indexOf(":")

      if (separatorIndex === -1) return

      const attribute = element.dataset.i18nAttr.slice(0, separatorIndex).trim()
      const key = element.dataset.i18nAttr.slice(separatorIndex + 1).trim()

      if (!attribute || !key) return

      element.setAttribute(attribute, t(key))
    })
  }

  function changeLanguage(nextLanguage) {
    if (!SUPPORTED_LANGUAGES.has(nextLanguage)) return false

    try {
      localStorage.setItem(STORAGE_KEY, nextLanguage)
    } catch (error) {
      console.warn("Unable to save the language preference:", error)
      return false
    }

    window.location.reload()
    return true
  }

  return {
    language,
    t,
    applyTranslations,
    changeLanguage,
  }
}
