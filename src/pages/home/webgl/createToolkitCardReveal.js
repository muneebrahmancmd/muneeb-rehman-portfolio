import * as THREE from "three"

import vertexShader from "./shaders/toolkit-card-reveal/vertex.glsl"
import fragmentShader from "./shaders/toolkit-card-reveal/fragment.glsl"

export function createToolkitCardReveal(canvas, { reducedMotion = false } = {}) {
  if (!(canvas instanceof HTMLCanvasElement)) return null

  // --------------
  // 1. Scene
  // --------------
  const scene = new THREE.Scene()
  const camera = new THREE.Camera()

  // --------------
  // 2. Camera
  // --------------
  const creamColor = getComputedStyle(document.documentElement)
    .getPropertyValue("--color-cream")
    .trim()

  // --------------
  // 3. Uniforms
  // --------------
  const uniforms = {
    uProgress: {
      value: 0,
    },
    uTime: {
      value: 0,
    },
    uCreamColor: {
      value: new THREE.Color(creamColor),
    },

    uNoiseScale: {
      value: 2.0,
    },
    uNoiseStrength: {
      value: 0.15,
    },
    uNoiseSpeedX: {
      value: 0.45,
    },
    uNoiseSpeedY: {
      value: 0.35,
    },
  }

  // --------------
  // 4. Shader plane
  // --------------
  const geometry = new THREE.PlaneGeometry(2, 2)

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  })

  const plane = new THREE.Mesh(geometry, material)

  scene.add(plane)

  // --------------
  // 5. Renderer
  // --------------
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: false,
    powerPreference: "high-performance",
  })

  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.setClearColor(0x000000, 0)

  // --------------
  // 6. Render
  // --------------
  const timer = new THREE.Timer()
  let isRunning = false
  let animationFrameId = null

  function render() {
    renderer.render(scene, camera)
  }

  function tick(timestamp) {
    if (!isRunning) return

    timer.update(timestamp)
    uniforms.uTime.value = timer.getElapsed()

    render()

    animationFrameId = requestAnimationFrame(tick)
  }

  function start() {
    if (isRunning) return

    isRunning = true
    animationFrameId = requestAnimationFrame(tick)
  }

  function pause() {
    isRunning = false

    if (animationFrameId === null) return

    cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }

  // --------------
  // 7. Resize
  // --------------
  function resize() {
    const width = Math.max(canvas.clientWidth, 1)
    const height = Math.max(canvas.clientHeight, 1)

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(width, height, false)

    render()
  }

  window.addEventListener("resize", resize)

  resize()

  // --------------
  // 8. Controls
  // --------------
  function setProgress(progress) {
    const nextProgress = THREE.MathUtils.clamp(progress, 0, 1)

    if (uniforms.uProgress.value === nextProgress) return

    uniforms.uProgress.value = nextProgress

    const shouldAnimate = !reducedMotion && nextProgress > 0 && nextProgress < 1

    if (shouldAnimate) {
      start()
      return
    }

    pause()
    render()
  }

  return {
    setProgress,
  }
}
