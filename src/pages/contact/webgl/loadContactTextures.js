import * as THREE from "three"

const TEXTURE_ROOT = "/contact/textures"
const LAYOUTS = ["desktop", "mobile"]

function createTextureDescriptors(language) {
  const locale = language === "fr" ? "fr" : "en"

  return LAYOUTS.flatMap((layout) => [
    {
      layout,
      name: "headline",
      type: "text",
      url: `${TEXTURE_ROOT}/${locale}/heading-${locale}-${layout}.png`,
    },
    {
      layout,
      name: "availability",
      type: "text",
      url: `${TEXTURE_ROOT}/${locale}/availability-${locale}-${layout}.png`,
    },
    {
      layout,
      name: "services",
      type: "text",
      url: `${TEXTURE_ROOT}/${locale}/services-${locale}-${layout}.png`,
    },
    {
      layout,
      name: "contact",
      type: "text",
      url: `${TEXTURE_ROOT}/contact-${layout}.png`,
    },
    {
      layout,
      name: "sphere",
      type: "sphere",
      url: `${TEXTURE_ROOT}/sphere-${layout}.webp`,
    },
  ])
}

function configureTexture(texture, type) {
  texture.colorSpace = THREE.SRGBColorSpace
  texture.magFilter = THREE.LinearFilter

  if (type === "text") {
    texture.wrapS = THREE.ClampToEdgeWrapping
    texture.wrapT = THREE.ClampToEdgeWrapping
    texture.generateMipmaps = false
    texture.minFilter = THREE.LinearFilter
  } else {
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.ClampToEdgeWrapping
    texture.generateMipmaps = true
    texture.minFilter = THREE.LinearMipmapLinearFilter
  }

  texture.needsUpdate = true
}

function getTextureDimensions(texture) {
  const image = texture.source.data
  const width = image?.naturalWidth || image?.videoWidth || image?.width || 1
  const height = image?.naturalHeight || image?.videoHeight || image?.height || 1

  return {
    width,
    height,
    aspectRatio: width / height,
  }
}

export function loadContactTextures({ language = "en" } = {}) {
  const loader = new THREE.TextureLoader()
  const loadedTextures = new Set()
  let isDisposed = false

  const ready = (async () => {
    try {
      const descriptors = createTextureDescriptors(language)

      const entries = await Promise.all(
        descriptors.map(async (descriptor) => {
          const texture = await loader.loadAsync(descriptor.url)

          if (isDisposed) {
            texture.dispose()
            return null
          }

          configureTexture(texture, descriptor.type)
          loadedTextures.add(texture)

          return {
            layout: descriptor.layout,
            name: descriptor.name,
            texture,
            ...getTextureDimensions(texture),
          }
        }),
      )

      if (isDisposed || entries.some((entry) => entry === null)) {
        return null
      }

      return entries.reduce(
        (assets, entry) => {
          assets[entry.layout][entry.name] = {
            texture: entry.texture,
            width: entry.width,
            height: entry.height,
            aspectRatio: entry.aspectRatio,
          }

          return assets
        },
        {
          desktop: {},
          mobile: {},
        },
      )
    } catch (error) {
      dispose()
      throw error
    }
  })()

  function dispose() {
    if (isDisposed) return

    isDisposed = true

    loadedTextures.forEach((texture) => {
      texture.dispose()
    })

    loadedTextures.clear()
  }

  return {
    ready,
    dispose,
  }
}
