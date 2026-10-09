import gsap from "gsap"
import * as THREE from "three"

import homeLoaderVertexShader from "./shaders/vertex.glsl"
import homeLoaderFragmentShader from "./shaders/fragment.glsl"

export const createHomeLoader = ({ enabled = true, minimumDuration = 1.2 } = {}) => {
  const canvas = document.querySelector(".home-loader__canvas")
  const loaderElement = document.querySelector(".home-loader")

  if (!enabled || !canvas || !loaderElement) {
    return {
      setProgress: () => {},
      complete: () => Promise.resolve(),
      revealLogo: () => Promise.resolve(),
      revealHero: () => Promise.resolve(),
      dispose: () => {},
    }
  }

  let renderer = null
  let geometry = null
  let material = null
  let logoTexture = null
  let progressTween = null
  let revealTween = null
  let heroRevealTween = null
  let resizeObserver = null
  let targetProgress = 0
  let isDisposed = false

  const startTime = performance.now()

  const scene = new THREE.Scene()
  const camera = new THREE.Camera()

  const render = () => {
    if (!renderer || !material || isDisposed) return

    material.uniforms.uTime.value = performance.now() * 0.001
    renderer.render(scene, camera)
  }

  const updateSize = () => {
    if (!renderer || !material) return

    const width = loaderElement.clientWidth
    const height = loaderElement.clientHeight
    const pixelRatio = Math.min(window.devicePixelRatio, 2)

    renderer.setSize(width, height, false)
    renderer.setPixelRatio(pixelRatio)

    material.uniforms.uResolution.value.set(width, height)

    const logoHeight = Math.min(180, width * 0.28, height * 0.28)
    const logoAspectRatio = 96.19 / 100

    material.uniforms.uLogoSize.value.set(logoHeight * logoAspectRatio, logoHeight)

    render()
  }

  const animateProgressTo = (progress, duration = 0.3) => {
    if (!material || isDisposed) return null

    progressTween?.kill()

    progressTween = gsap.to(material.uniforms.uLoadProgress, {
      value: progress,
      duration,
      ease: "power2.out",
      overwrite: true,
      onUpdate: render,
    })

    return progressTween
  }

  const ready = (async () => {
    try {
      logoTexture = await new THREE.TextureLoader().loadAsync("/brand/logo-muneeb-rehman.svg")

      if (isDisposed) {
        logoTexture.dispose()
        return
      }

      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        premultipliedAlpha: true,
      })

      renderer.outputColorSpace = THREE.SRGBColorSpace

      geometry = new THREE.PlaneGeometry(2, 2)

      const rootStyles = getComputedStyle(document.documentElement)
      const creamColor = rootStyles.getPropertyValue("--color-cream").trim() || "#f5e7df"
      const darkColor = rootStyles.getPropertyValue("--color-dark").trim() || "#1f1d1d"

      material = new THREE.ShaderMaterial({
        vertexShader: homeLoaderVertexShader,
        fragmentShader: homeLoaderFragmentShader,

        uniforms: {
          uLogoTexture: { value: logoTexture },
          uResolution: { value: new THREE.Vector2() },
          uLogoSize: { value: new THREE.Vector2() },
          uLoadProgress: { value: 0 },
          uLogoCutoutProgress: { value: 0 },
          uHeroRevealProgress: { value: 0 },
          uTime: { value: 0 },
          uCreamColor: { value: new THREE.Color(creamColor) },
          uDarkColor: { value: new THREE.Color(darkColor) },
          uNoiseScale: { value: 10 },
          uNoiseStrength: { value: 0.3 },
          uNoiseSpeedX: { value: 0.08 },
          uNoiseSpeedY: { value: 0.12 },
          uHeroNoiseScale: { value: 2 },
          uHeroNoiseStrength: { value: 0.15 },
          uHeroNoiseSpeedX: { value: 0.45 },
          uHeroNoiseSpeedY: { value: 0.35 },
        },
      })

      const loaderPlane = new THREE.Mesh(geometry, material)
      scene.add(loaderPlane)

      updateSize()
      resizeObserver = new ResizeObserver(updateSize)
      resizeObserver.observe(loaderElement)
      window.addEventListener("resize", updateSize)

      await renderer.compileAsync(scene, camera)

      render()
      loaderElement.classList.add("home-loader--canvas-ready")
      animateProgressTo(targetProgress)
    } catch (error) {
      console.error("Unable to prepare the home loader.", error)
    }
  })()

  const setProgress = (progress) => {
    targetProgress = Math.min(gsap.utils.clamp(0, 1, progress), 0.9)

    animateProgressTo(targetProgress)
  }

  const complete = async () => {
    await ready

    if (!material || isDisposed) return

    const elapsedTime = (performance.now() - startTime) / 1000
    const remainingMinimumDuration = Math.max(0, minimumDuration - elapsedTime)
    const completionDuration = Math.max(0.35, remainingMinimumDuration)

    await new Promise((resolve) => {
      progressTween?.kill()

      progressTween = gsap.to(material.uniforms.uLoadProgress, {
        value: 1,
        duration: completionDuration,
        ease: "power2.out",
        overwrite: true,
        onUpdate: render,
        onComplete: resolve,
      })
    })
  }

  const revealLogo = async () => {
    await ready

    if (!material || isDisposed) return

    await new Promise((resolve) => {
      revealTween = gsap.to(material.uniforms.uLogoCutoutProgress, {
        value: 1,
        duration: 0.6,
        ease: "power2.inOut",
        onUpdate: render,
        onComplete: resolve,
      })
    })
  }

  const revealHero = async () => {
    await ready

    if (!material || isDisposed) return

    await new Promise((resolve) => {
      heroRevealTween = gsap.to(material.uniforms.uHeroRevealProgress, {
        value: 1,
        duration: 1,
        ease: "power2.inOut",
        onUpdate: render,
        onComplete: resolve,
      })
    })
  }

  const dispose = () => {
    if (isDisposed) return

    isDisposed = true

    resizeObserver?.disconnect()
    window.removeEventListener("resize", updateSize)

    progressTween?.kill()
    revealTween?.kill()
    heroRevealTween?.kill()
    logoTexture?.dispose()
    geometry?.dispose()
    material?.dispose()
    renderer?.dispose()
  }

  return {
    setProgress,
    complete,
    revealLogo,
    revealHero,
    dispose,
  }
}
