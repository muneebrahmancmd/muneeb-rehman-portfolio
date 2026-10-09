import * as THREE from "three"

import { loadContactEnvironment } from "./loadContactEnvironment"
import { loadContactTextures } from "./loadContactTextures"
import distortionFragmentShader from "./shaders/distortion/fragment.glsl"
import distortionVertexShader from "./shaders/distortion/vertex.glsl"

const MOBILE_BREAKPOINT = 700
const MAX_PIXEL_RATIO = 1.5
const SPHERE_ROTATION_SPEED = 0.04
const SPHERE_ROTATION_HERO_SPEED = 0.3
const SPHERE_FLOAT_SPEED = 0.55
const INITIAL_VISUAL_MODE = "hero"
const HERO_VIEW_ROTATION_Y = THREE.MathUtils.degToRad(-10)
const CONTENT_OVERSCAN = 120

const DISTORTION_CONFIG = Object.freeze({
  radius: 0.3,
  velocityGain: 0.25,
  positionDamping: 0.1,
  velocityDamping: 0.15,
  strengthRise: 0.15,
  strengthDecay: 0.03,
  sphereIdleStrength: {
    desktop: 0.04,
    mobile: 0.005,
  },
  interactionStrength: 1,
  idleSpeed: 0.25,
  idleFrequency: [5, 20],
})

function frameIndependentDamping(damping, deltaTime) {
  return 1 - Math.pow(1 - damping, deltaTime * 60)
}

const LAYOUTS = {
  desktop: {
    referenceWidth: 1440,
    referenceHeight: 1023,
    exportScale: 2,
    floatAmplitude: 25,
    planes: {
      headline: {
        align: "center",
        x: 720.5,
        top: 260,
        minScale: 0.7,
      },
      availability: {
        align: "center",
        x: 720.5,
        top: 584.41,
        minScale: 0.7,
      },
      services: {
        anchor: "bottom-left",
        left: 92,
        bottom: 136,
      },
      contact: {
        anchor: "bottom-left",
        left: 93,
        bottom: 81.5,
      },
    },
    sphere: {
      centerX: 1177,
      centerY: 926.5,
      diameter: 940,
    },
  },
  mobile: {
    referenceWidth: 390,
    referenceHeight: 844,
    exportScale: 1,
    floatAmplitude: 30,
    planes: {
      headline: {
        align: "center",
        x: 195,
        top: 101,
      },
      availability: {
        align: "center",
        x: 195,
        top: 238,
      },
      services: {
        align: "left",
        x: 77,
        top: 611,
      },
      contact: {
        align: "left",
        x: 78,
        top: 740,
      },
    },
    sphere: {
      centerX: 335.5,
      centerY: 520.5,
      diameter: 429,
    },
  },
}

function createTextPlane(scene) {
  const geometry = new THREE.PlaneGeometry(1, 1)
  const material = new THREE.MeshBasicMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  })
  const mesh = new THREE.Mesh(geometry, material)

  mesh.position.z = 10
  mesh.renderOrder = 10
  scene.add(mesh)

  return mesh
}

export function createContactScene({ canvas, root, language = "en", reducedMotion = false } = {}) {
  if (!(canvas instanceof HTMLCanvasElement) || !(root instanceof HTMLElement)) {
    return null
  }

  const frame = root.querySelector(".contact__frame")
  const emailLink = root.querySelector(".contact__email")

  if (!(frame instanceof HTMLElement)) {
    return null
  }

  let renderer

  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
      powerPreference: "high-performance",
    })
  } catch (error) {
    console.error("Unable to initialize the Contact WebGL renderer.", error)
    return null
  }

  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1
  renderer.setClearColor(0x000000, 0)
  renderer.autoClear = false

  const sphereScene = new THREE.Scene()
  const textScene = new THREE.Scene()
  const backgroundScene = new THREE.Scene()
  const postProcessScene = new THREE.Scene()

  sphereScene.background = null
  textScene.background = null

  const camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.1, 2000)
  const contentCamera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.1, 2000)
  const backgroundCamera = new THREE.PerspectiveCamera(35, 1, 0.1, 100)
  const postProcessCamera = new THREE.Camera()

  camera.position.set(0, 0, 1000)
  camera.lookAt(0, 0, 0)
  contentCamera.position.copy(camera.position)
  contentCamera.quaternion.copy(camera.quaternion)
  backgroundCamera.position.set(0, 0, 6)
  backgroundCamera.lookAt(0, 0, 0)

  backgroundCamera.rotation.y = HERO_VIEW_ROTATION_Y

  const backgroundUniforms = THREE.UniformsUtils.clone(THREE.ShaderLib.backgroundCube.uniforms)
  const backgroundMaterial = new THREE.ShaderMaterial({
    name: "ContactHeroBackgroundMaterial",
    uniforms: backgroundUniforms,
    vertexShader: THREE.ShaderLib.backgroundCube.vertexShader,
    fragmentShader: THREE.ShaderLib.backgroundCube.fragmentShader,
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  })

  Object.defineProperty(backgroundMaterial, "envMap", {
    get() {
      return this.uniforms.envMap.value
    },
  })

  const backgroundGeometry = new THREE.BoxGeometry(1, 1, 1)
  const backgroundMesh = new THREE.Mesh(backgroundGeometry, backgroundMaterial)

  backgroundMesh.onBeforeRender = function handleBackgroundBeforeRender(
    renderer,
    renderedScene,
    activeCamera,
  ) {
    this.matrixWorld.copyPosition(activeCamera.matrixWorld)
  }

  backgroundScene.add(backgroundMesh)

  const useMobileRenderTargetQuality = window.matchMedia(
    "(hover: none) and (pointer: coarse)",
  ).matches

  const environmentRenderTarget = new THREE.WebGLRenderTarget(1, 1, {
    depthBuffer: false,
    stencilBuffer: false,
    colorSpace: THREE.NoColorSpace,
  })
  const sphereRenderTarget = new THREE.WebGLRenderTarget(1, 1, {
    depthBuffer: true,
    stencilBuffer: false,
    samples: useMobileRenderTargetQuality ? 0 : 4,
    colorSpace: THREE.NoColorSpace,
  })
  const textRenderTarget = new THREE.WebGLRenderTarget(1, 1, {
    depthBuffer: false,
    stencilBuffer: false,
    samples: 0,
    colorSpace: THREE.NoColorSpace,
  })

  environmentRenderTarget.texture.generateMipmaps = false
  environmentRenderTarget.texture.minFilter = THREE.LinearFilter
  environmentRenderTarget.texture.magFilter = THREE.LinearFilter
  sphereRenderTarget.texture.generateMipmaps = false
  sphereRenderTarget.texture.minFilter = THREE.LinearFilter
  sphereRenderTarget.texture.magFilter = THREE.LinearFilter
  textRenderTarget.texture.generateMipmaps = false
  textRenderTarget.texture.minFilter = THREE.LinearFilter
  textRenderTarget.texture.magFilter = THREE.LinearFilter

  const postProcessGeometry = new THREE.BufferGeometry()

  postProcessGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3),
  )

  const postProcessMaterial = new THREE.ShaderMaterial({
    vertexShader: distortionVertexShader,
    fragmentShader: distortionFragmentShader,
    uniforms: {
      uEnvironment: { value: environmentRenderTarget.texture },
      uSphere: { value: sphereRenderTarget.texture },
      uText: { value: textRenderTarget.texture },
      uContentViewportOffset: { value: new THREE.Vector2() },
      uContentViewportScale: { value: new THREE.Vector2(1, 1) },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uFrameBounds: { value: new THREE.Vector4() },
      uFrameRadius: { value: 0 },
      uEnvironmentOpacity: { value: INITIAL_VISUAL_MODE === "hero" ? 1 : 0 },
      uTime: { value: 0 },
      uIdleSpeed: { value: DISTORTION_CONFIG.idleSpeed },
      uSphereIdleStrength: { value: 0 },
      uIdleFrequency: {
        value: new THREE.Vector2(...DISTORTION_CONFIG.idleFrequency),
      },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },
      uVelocity: { value: new THREE.Vector2() },
      uStrength: { value: 0 },
      uRadius: { value: DISTORTION_CONFIG.radius },
      uInteractionStrength: {
        value: reducedMotion ? 0 : DISTORTION_CONFIG.interactionStrength,
      },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.NoBlending,
  })
  const postProcessMesh = new THREE.Mesh(postProcessGeometry, postProcessMaterial)

  postProcessMesh.frustumCulled = false
  postProcessScene.add(postProcessMesh)

  const headlinePlane = createTextPlane(textScene)
  const availabilityPlane = createTextPlane(textScene)
  const servicesPlane = createTextPlane(textScene)
  const contactPlane = createTextPlane(textScene)

  const textPlanes = {
    headline: headlinePlane,
    availability: availabilityPlane,
    services: servicesPlane,
    contact: contactPlane,
  }

  const sphereGeometry = new THREE.SphereGeometry(1, 64, 48)
  const texturedSphereMaterial = new THREE.MeshBasicMaterial({
    depthTest: true,
    depthWrite: true,
    toneMapped: false,
  })
  const silverSphereMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 1,
    roughness: 0.4,
    envMapIntensity: 1.2,
    toneMapped: false,
  })

  silverSphereMaterial.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\n#include <tonemapping_pars_fragment>")
      .replace(
        "#include <tonemapping_fragment>",
        "gl_FragColor.rgb = ACESFilmicToneMapping(gl_FragColor.rgb);",
      )
  }

  const sphere = new THREE.Mesh(sphereGeometry, texturedSphereMaterial)
  const sphereInitialRotationY = -Math.PI * 0.25 + HERO_VIEW_ROTATION_Y

  sphere.rotation.y = sphereInitialRotationY
  sphere.renderOrder = 0
  sphereScene.add(sphere)

  const textureLoader = loadContactTextures({ language })
  const environmentLoader = loadContactEnvironment({ renderer })
  const viewport = {
    width: 1,
    height: 1,
  }

  let textures = null
  let environmentMap = null
  let currentVisualMode = INITIAL_VISUAL_MODE
  let currentLayoutName = null
  let sphereBaseY = 0
  let sphereFloatAmplitude = 0
  let elapsedTime = 0
  let lastFrameTime = 0
  let animationFrameId = null
  let isReady = false
  let isRunning = false
  let wantsToRun = true
  let isDestroyed = false
  let contextLost = false
  let environmentRenderTargetNeedsUpdate = true
  let textRenderTargetNeedsUpdate = true

  const targetPointer = new THREE.Vector2(0.5, 0.5)
  const smoothedPointer = new THREE.Vector2(0.5, 0.5)
  const previousPointer = new THREE.Vector2(0.5, 0.5)
  const rawPointerVelocity = new THREE.Vector2()
  const smoothedPointerVelocity = new THREE.Vector2()
  const supportsPointerInteraction = window.matchMedia("(hover: hover) and (pointer: fine)").matches

  let distortionStrength = 0
  let pointerActive = false
  let pointerListening = false
  let needsPointerSeed = true

  function getLayoutName() {
    return viewport.width <= MOBILE_BREAKPOINT ? "mobile" : "desktop"
  }

  function getLayoutTransform(layout) {
    const scale = Math.min(
      viewport.width / layout.referenceWidth,
      viewport.height / layout.referenceHeight,
    )

    return {
      scale,
      offsetX: (viewport.width - layout.referenceWidth * scale) * 0.5,
      offsetY: (viewport.height - layout.referenceHeight * scale) * 0.5,
    }
  }

  function screenToWorld(screenX, screenY, z = 0) {
    return {
      x: screenX - viewport.width * 0.5,
      y: viewport.height * 0.5 - screenY,
      z,
    }
  }

  function setVisualMode(mode) {
    if (mode !== "contact" && mode !== "hero") return

    currentVisualMode = mode

    if (mode === "hero") {
      sphere.material = silverSphereMaterial
      sphereScene.environment = environmentMap
      sphereScene.environmentRotation.y = HERO_VIEW_ROTATION_Y
      postProcessMaterial.uniforms.uEnvironmentOpacity.value = 1
    } else {
      sphere.material = texturedSphereMaterial
      sphereScene.environment = null
      postProcessMaterial.uniforms.uEnvironmentOpacity.value = 0
    }

    if (isReady && !contextLost) {
      render()
    }
  }

  function applyPlaneLayout(plane, asset, item, layout, transform, groupCenterY = null) {
    const referenceWidth = asset.width / layout.exportScale
    const referenceHeight = referenceWidth / asset.aspectRatio
    const planeScale = Math.max(transform.scale, item.minScale ?? 0)
    const width = referenceWidth * planeScale
    const height = referenceHeight * planeScale
    const referenceCenterX = item.align === "left" ? item.x + referenceWidth * 0.5 : item.x
    const referenceCenterY = item.top + referenceHeight * 0.5
    const screenY =
      groupCenterY === null
        ? transform.offsetY + referenceCenterY * transform.scale
        : transform.offsetY +
          groupCenterY * transform.scale +
          (referenceCenterY - groupCenterY) * planeScale
    const position = screenToWorld(
      transform.offsetX + referenceCenterX * transform.scale,
      screenY,
      10,
    )

    plane.scale.set(width, height, 1)
    plane.position.set(position.x, position.y, position.z)
  }

  function applyBottomLeftPlaneLayout(plane, asset, item, layout, transform, frameBounds) {
    const referenceWidth = asset.width / layout.exportScale
    const referenceHeight = referenceWidth / asset.aspectRatio
    const contentScale = Math.max(transform.scale, 0.9)

    const width = referenceWidth * contentScale
    const height = referenceHeight * contentScale

    const position = screenToWorld(
      frameBounds.left + item.left * transform.scale + width * 0.5,
      frameBounds.bottom - item.bottom * contentScale - height * 0.5,
      10,
    )

    plane.scale.set(width, height, 1)
    plane.position.set(position.x, position.y, position.z)
  }

  function applyEmailLinkLayout() {
    if (!(emailLink instanceof HTMLAnchorElement)) return

    const width = contactPlane.scale.x
    const height = contactPlane.scale.y
    const centerX = contactPlane.position.x + viewport.width * 0.5
    const centerY = viewport.height * 0.5 - contactPlane.position.y

    emailLink.style.setProperty("--contact-email-left", `${centerX - width * 0.5}px`)
    emailLink.style.setProperty("--contact-email-top", `${centerY - height * 0.5}px`)
    emailLink.style.setProperty("--contact-email-width", `${width}px`)
    emailLink.style.setProperty("--contact-email-height", `${height}px`)
  }

  function applyTextureSet(layoutName) {
    if (!textures || currentLayoutName === layoutName) return

    Object.entries(textPlanes).forEach(([name, plane]) => {
      plane.material.map = textures[layoutName][name].texture
      plane.material.needsUpdate = true
    })

    texturedSphereMaterial.map = textures[layoutName].sphere.texture
    texturedSphereMaterial.needsUpdate = true

    currentLayoutName = layoutName
    textRenderTargetNeedsUpdate = true
  }

  function applyPostProcessLayout(frameBounds) {
    const frameWidth = Math.max(frameBounds.width, 1)
    const frameHeight = Math.max(frameBounds.height, 1)
    const frameRadius = Number.parseFloat(window.getComputedStyle(frame).borderTopLeftRadius) || 0
    const frameBottom = viewport.height - frameBounds.bottom

    backgroundCamera.aspect = frameWidth / frameHeight
    backgroundCamera.updateProjectionMatrix()

    postProcessMaterial.uniforms.uResolution.value.set(viewport.width, viewport.height)
    postProcessMaterial.uniforms.uFrameBounds.value.set(
      frameBounds.left,
      frameBottom,
      frameWidth,
      frameHeight,
    )
    postProcessMaterial.uniforms.uFrameRadius.value = frameRadius

    environmentRenderTargetNeedsUpdate = true
  }

  function applyLayout() {
    if (!textures) return

    const layoutName = getLayoutName()
    const layout = LAYOUTS[layoutName]
    const transform = getLayoutTransform(layout)
    const frameBounds = frame.getBoundingClientRect()
    let desktopTextGroupCenterY = null

    if (layoutName === "desktop") {
      const availabilityAsset = textures.desktop.availability
      const availabilityReferenceWidth = availabilityAsset.width / LAYOUTS.desktop.exportScale
      const availabilityReferenceHeight = availabilityReferenceWidth / availabilityAsset.aspectRatio

      desktopTextGroupCenterY =
        (layout.planes.headline.top +
          layout.planes.availability.top +
          availabilityReferenceHeight) *
        0.5
    }

    applyTextureSet(layoutName)
    applyPostProcessLayout(frameBounds)

    Object.entries(textPlanes).forEach(([name, plane]) => {
      const item = layout.planes[name]

      if (layoutName === "desktop" && item.anchor === "bottom-left") {
        applyBottomLeftPlaneLayout(
          plane,
          textures[layoutName][name],
          item,
          layout,
          transform,
          frameBounds,
        )
        return
      }

      const groupCenterY =
        layoutName === "desktop" && (name === "headline" || name === "availability")
          ? desktopTextGroupCenterY
          : null

      applyPlaneLayout(plane, textures[layoutName][name], item, layout, transform, groupCenterY)
    })

    applyEmailLinkLayout()

    const spherePosition = screenToWorld(
      transform.offsetX + layout.sphere.centerX * transform.scale,
      transform.offsetY + layout.sphere.centerY * transform.scale,
    )
    const sphereRadius = layout.sphere.diameter * transform.scale * 0.5

    sphere.scale.setScalar(sphereRadius)
    sphere.position.x = spherePosition.x
    sphereBaseY = spherePosition.y
    sphereFloatAmplitude = layout.floatAmplitude * transform.scale
    sphere.position.y = sphereBaseY

    textRenderTargetNeedsUpdate = true
  }

  function renderEnvironmentTarget() {
    if (!environmentRenderTargetNeedsUpdate || !environmentMap) return

    renderer.setRenderTarget(environmentRenderTarget)
    renderer.clear(true, true, false)
    renderer.render(backgroundScene, backgroundCamera)
    renderer.setRenderTarget(null)

    environmentRenderTargetNeedsUpdate = false
  }

  function renderSphereTarget() {
    renderer.setRenderTarget(sphereRenderTarget)
    renderer.clear(true, true, false)
    renderer.render(sphereScene, contentCamera)
    renderer.setRenderTarget(null)
  }

  function renderTextTarget() {
    if (!textRenderTargetNeedsUpdate) return

    renderer.setRenderTarget(textRenderTarget)
    renderer.clear(true, true, false)
    renderer.render(textScene, contentCamera)
    renderer.setRenderTarget(null)

    textRenderTargetNeedsUpdate = false
  }

  function renderFinalComposite() {
    renderer.setRenderTarget(null)
    renderer.clear(true, true, false)
    renderer.render(postProcessScene, postProcessCamera)
  }

  function render() {
    if (isDestroyed || contextLost) return false

    if (currentVisualMode === "hero") {
      renderEnvironmentTarget()
    }

    renderTextTarget()
    renderSphereTarget()
    renderFinalComposite()

    return true
  }

  function resize() {
    if (isDestroyed) return

    viewport.width = Math.max(root.clientWidth, 1)
    viewport.height = Math.max(root.clientHeight, 1)

    postProcessMaterial.uniforms.uSphereIdleStrength.value = reducedMotion
      ? 0
      : DISTORTION_CONFIG.sphereIdleStrength[getLayoutName()]

    const contentCaptureWidth = viewport.width + CONTENT_OVERSCAN * 2
    const contentCaptureHeight = viewport.height + CONTENT_OVERSCAN * 2

    camera.left = viewport.width * -0.5
    camera.right = viewport.width * 0.5
    camera.top = viewport.height * 0.5
    camera.bottom = viewport.height * -0.5
    camera.updateProjectionMatrix()

    contentCamera.left = contentCaptureWidth * -0.5
    contentCamera.right = contentCaptureWidth * 0.5
    contentCamera.top = contentCaptureHeight * 0.5
    contentCamera.bottom = contentCaptureHeight * -0.5
    contentCamera.updateProjectionMatrix()

    const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO)
    const targetWidth = Math.max(1, Math.round(viewport.width * pixelRatio))
    const targetHeight = Math.max(1, Math.round(viewport.height * pixelRatio))
    const contentTargetWidth = Math.max(1, Math.round(contentCaptureWidth * pixelRatio))
    const contentTargetHeight = Math.max(1, Math.round(contentCaptureHeight * pixelRatio))

    renderer.setPixelRatio(pixelRatio)
    renderer.setSize(viewport.width, viewport.height, false)
    environmentRenderTarget.setSize(targetWidth, targetHeight)
    sphereRenderTarget.setSize(contentTargetWidth, contentTargetHeight)
    textRenderTarget.setSize(contentTargetWidth, contentTargetHeight)

    postProcessMaterial.uniforms.uContentViewportOffset.value.set(
      CONTENT_OVERSCAN / contentCaptureWidth,
      CONTENT_OVERSCAN / contentCaptureHeight,
    )
    postProcessMaterial.uniforms.uContentViewportScale.value.set(
      viewport.width / contentCaptureWidth,
      viewport.height / contentCaptureHeight,
    )

    applyLayout()

    if (isReady && !contextLost) {
      render()
    }
  }

  function advanceDistortion(deltaTime) {
    const positionFactor = frameIndependentDamping(DISTORTION_CONFIG.positionDamping, deltaTime)

    smoothedPointer.lerp(targetPointer, positionFactor)
    rawPointerVelocity
      .subVectors(smoothedPointer, previousPointer)
      .multiplyScalar(DISTORTION_CONFIG.velocityGain / deltaTime)
    previousPointer.copy(smoothedPointer)

    const velocityFactor = frameIndependentDamping(DISTORTION_CONFIG.velocityDamping, deltaTime)

    smoothedPointerVelocity.lerp(rawPointerVelocity, velocityFactor)

    const pointerSpeed = smoothedPointerVelocity.length()
    const targetStrength = pointerActive ? Math.min(pointerSpeed * 6, 1) : 0
    const strengthDamping =
      distortionStrength < targetStrength
        ? DISTORTION_CONFIG.strengthRise
        : DISTORTION_CONFIG.strengthDecay
    const strengthFactor = frameIndependentDamping(strengthDamping, deltaTime)

    distortionStrength += (targetStrength - distortionStrength) * strengthFactor

    postProcessMaterial.uniforms.uTime.value = elapsedTime
    postProcessMaterial.uniforms.uMouse.value.copy(smoothedPointer)
    postProcessMaterial.uniforms.uVelocity.value.copy(smoothedPointerVelocity)
    postProcessMaterial.uniforms.uStrength.value = distortionStrength
  }

  function resetPointerState() {
    pointerActive = false
    needsPointerSeed = true
    rawPointerVelocity.set(0, 0)
    smoothedPointerVelocity.set(0, 0)
    distortionStrength = 0
    postProcessMaterial.uniforms.uVelocity.value.set(0, 0)
    postProcessMaterial.uniforms.uStrength.value = 0
  }

  function handlePointerMove(event) {
    const bounds = root.getBoundingClientRect()

    targetPointer.set(
      (event.clientX - bounds.left) / bounds.width,
      1 - (event.clientY - bounds.top) / bounds.height,
    )

    if (needsPointerSeed) {
      smoothedPointer.copy(targetPointer)
      previousPointer.copy(targetPointer)
      postProcessMaterial.uniforms.uMouse.value.copy(targetPointer)
      needsPointerSeed = false
    }

    pointerActive = true
  }

  function handlePointerLeave() {
    pointerActive = false
    needsPointerSeed = true
  }

  function setPointerInteraction(enabled) {
    const next = Boolean(
      enabled && supportsPointerInteraction && !reducedMotion && !isDestroyed && !contextLost,
    )

    if (next === pointerListening) return

    pointerListening = next
    resetPointerState()

    if (next) {
      root.addEventListener("pointerenter", handlePointerMove, { passive: true })
      root.addEventListener("pointermove", handlePointerMove, { passive: true })
      root.addEventListener("pointerleave", handlePointerLeave)
    } else {
      root.removeEventListener("pointerenter", handlePointerMove)
      root.removeEventListener("pointermove", handlePointerMove)
      root.removeEventListener("pointerleave", handlePointerLeave)
    }
  }

  function stopAnimationLoop() {
    isRunning = false

    if (animationFrameId === null) return

    window.cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }

  function tick(currentTime) {
    animationFrameId = null

    if (!isRunning || isDestroyed || contextLost) return

    const deltaTime = lastFrameTime ? Math.min((currentTime - lastFrameTime) / 1000, 1 / 30) : 0

    lastFrameTime = currentTime
    elapsedTime += deltaTime

    sphere.rotation.y = sphereInitialRotationY + elapsedTime * SPHERE_ROTATION_SPEED
    sphere.position.y =
      sphereBaseY + Math.sin(elapsedTime * SPHERE_FLOAT_SPEED) * sphereFloatAmplitude

    advanceDistortion(deltaTime || 1 / 60)

    if (currentVisualMode === "hero") {
      sphereScene.environmentRotation.y =
        HERO_VIEW_ROTATION_Y + elapsedTime * SPHERE_ROTATION_HERO_SPEED
    }

    try {
      render()
    } catch (error) {
      console.error("Unable to render the Contact WebGL scene.", error)
      handleFatalFailure()
      return
    }

    if (isRunning) {
      animationFrameId = window.requestAnimationFrame(tick)
    }
  }

  function startAnimationLoop() {
    if (isDestroyed || contextLost || !isReady || isRunning || reducedMotion || document.hidden) {
      return
    }

    isRunning = true
    lastFrameTime = 0
    animationFrameId = window.requestAnimationFrame(tick)
  }

  function start() {
    if (isDestroyed) return

    wantsToRun = true

    if (reducedMotion) {
      render()
      return
    }

    startAnimationLoop()
  }

  function stop() {
    wantsToRun = false
    stopAnimationLoop()
  }

  function handleVisibilityChange() {
    if (document.hidden) {
      stopAnimationLoop()
      return
    }

    if (wantsToRun) {
      startAnimationLoop()
    } else if (isReady) {
      render()
    }
  }

  function handleContextLost(event) {
    event.preventDefault()
    contextLost = true
    setPointerInteraction(false)
    stopAnimationLoop()
    root.classList.remove("is-webgl-ready")
  }

  function handleContextRestored() {
    if (isDestroyed || !isReady) return

    contextLost = false

    try {
      environmentRenderTargetNeedsUpdate = true
      textRenderTargetNeedsUpdate = true
      resize()
      render()
      root.classList.add("is-webgl-ready")
      setPointerInteraction(true)

      if (wantsToRun) {
        startAnimationLoop()
      }
    } catch (error) {
      console.error("Unable to restore the Contact WebGL scene.", error)
      handleFatalFailure()
    }
  }

  const resizeObserver = new ResizeObserver(resize)

  resizeObserver.observe(root)
  window.addEventListener("resize", resize, { passive: true })
  document.addEventListener("visibilitychange", handleVisibilityChange)
  canvas.addEventListener("webglcontextlost", handleContextLost)
  canvas.addEventListener("webglcontextrestored", handleContextRestored)
  setPointerInteraction(true)

  resize()

  const ready = (async () => {
    try {
      const [loadedTextures, loadedEnvironment] = await Promise.all([
        textureLoader.ready,
        environmentLoader.ready,
      ])

      if (!loadedTextures || !loadedEnvironment || isDestroyed) return false

      textures = loadedTextures
      environmentMap = loadedEnvironment.environmentMap
      backgroundMaterial.uniforms.envMap.value = loadedEnvironment.backgroundMap
      setVisualMode(currentVisualMode)

      currentLayoutName = null
      applyLayout()

      await Promise.all([
        renderer.compileAsync(backgroundScene, backgroundCamera),
        renderer.compileAsync(sphereScene, contentCamera),
        renderer.compileAsync(textScene, contentCamera),
        renderer.compileAsync(postProcessScene, postProcessCamera),
      ])

      if (isDestroyed || contextLost) return false
      if (!render()) return false

      isReady = true
      root.classList.add("is-webgl-ready")

      if (wantsToRun) {
        startAnimationLoop()
      }

      return true
    } catch (error) {
      if (!isDestroyed) {
        console.error("Unable to prepare the Contact WebGL scene.", error)
        destroy()
      }

      return false
    }
  })()

  function handleFatalFailure() {
    root.classList.remove("is-webgl-ready")
    root.classList.add("is-webgl-fallback")

    destroy()
  }

  function destroy() {
    if (isDestroyed) return

    isDestroyed = true
    wantsToRun = false
    root.classList.remove("is-webgl-ready")

    stopAnimationLoop()
    resizeObserver.disconnect()

    window.removeEventListener("resize", resize)
    document.removeEventListener("visibilitychange", handleVisibilityChange)
    canvas.removeEventListener("webglcontextlost", handleContextLost)
    canvas.removeEventListener("webglcontextrestored", handleContextRestored)
    setPointerInteraction(false)

    textureLoader.dispose()
    environmentLoader.dispose()

    Object.values(textPlanes).forEach((plane) => {
      plane.geometry.dispose()
      plane.material.dispose()
    })

    sphereScene.environment = null
    backgroundMaterial.uniforms.envMap.value = null

    sphereGeometry.dispose()
    texturedSphereMaterial.dispose()
    silverSphereMaterial.dispose()
    backgroundGeometry.dispose()
    backgroundMaterial.dispose()
    environmentRenderTarget.dispose()
    sphereRenderTarget.dispose()
    textRenderTarget.dispose()
    postProcessGeometry.dispose()
    postProcessMaterial.dispose()

    sphereScene.clear()
    textScene.clear()
    backgroundScene.clear()
    postProcessScene.clear()
    renderer.dispose()

    textures = null
    environmentMap = null
  }

  return {
    ready,
    start,
    stop,
    resize,
    destroy,
    setVisualMode,
  }
}
