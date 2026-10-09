import * as THREE from "three"

const HERO_TEXTURE_ROOT = "/home/hero/textures"

export function loadContactEnvironment({ renderer } = {}) {
  const loader = new THREE.TextureLoader()
  const useMobileQuality = window.matchMedia("(hover: none) and (pointer: coarse)").matches
  const textureRoot = `${HERO_TEXTURE_ROOT}/${useMobileQuality ? "mobile" : "desktop"}`

  let environmentTexture = null
  let backgroundRenderTarget = null
  let environmentRenderTarget = null
  let isDisposed = false

  const ready = (async () => {
    try {
      const texture = await loader.loadAsync(`${textureRoot}/scene-gradient.webp`)

      if (isDisposed) {
        texture.dispose()
        return null
      }

      texture.mapping = THREE.EquirectangularReflectionMapping
      texture.colorSpace = THREE.SRGBColorSpace
      environmentTexture = texture

      backgroundRenderTarget = new THREE.WebGLCubeRenderTarget(texture.image.height)
      backgroundRenderTarget.fromEquirectangularTexture(renderer, texture)

      const pmremGenerator = new THREE.PMREMGenerator(renderer)

      try {
        pmremGenerator.compileEquirectangularShader()
        environmentRenderTarget = pmremGenerator.fromEquirectangular(texture)
      } finally {
        pmremGenerator.dispose()
      }

      if (isDisposed) {
        backgroundRenderTarget.dispose()
        environmentRenderTarget.dispose()
        backgroundRenderTarget = null
        environmentRenderTarget = null
        return null
      }

      return {
        backgroundMap: backgroundRenderTarget.texture,
        environmentMap: environmentRenderTarget.texture,
      }
    } catch (error) {
      dispose()
      throw error
    }
  })()

  function dispose() {
    if (isDisposed) return

    isDisposed = true
    environmentTexture?.dispose()
    backgroundRenderTarget?.dispose()
    environmentRenderTarget?.dispose()

    environmentTexture = null
    backgroundRenderTarget = null
    environmentRenderTarget = null
  }

  return {
    ready,
    dispose,
  }
}
