import { createImageDistortionScene } from "../../../shared/webgl/createImageDistortionScene"

export function createNotFoundScene({ imageUrl, reducedMotion = false, ...options } = {}) {
  const canvas = document.querySelector(".not-found__canvas")
  const scene = canvas?.closest(".not-found__scene")

  if (!canvas || !scene || !imageUrl) return null

  return createImageDistortionScene({
    ...options,
    canvas,
    scene,
    imageUrl,
    reducedMotion,
    onRender: () => scene.classList.add("is-webgl-ready"),
    onUnavailable: () => scene.classList.remove("is-webgl-ready"),
  })
}
