import * as THREE from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"

import logoGlassVertexShader from "./shaders/logo-glass/vertex.glsl"
import logoGlassFragmentShader from "./shaders/logo-glass/fragment.glsl"

export const createThreeHero = async ({
  autoStart = true,
  onProgress = () => {},
  reducedMotion = false,
} = {}) => {
  const totalLoadingSteps = 6
  let completedLoadingSteps = 0

  const completeLoadingStep = () => {
    completedLoadingSteps += 1

    onProgress(completedLoadingSteps / totalLoadingSteps)
  }

  onProgress(0)

  // ------------------------------------------------
  // Base setup
  // ------------------------------------------------

  // Debug

  // Loaders
  const textureLoader = new THREE.TextureLoader()
  const gltfLoader = new GLTFLoader()

  // Canvas
  const canvas = document.querySelector(".webgl")
  const renderContainer = canvas.closest(".hero-three__frame")

  // Scene
  const scene = new THREE.Scene()

  // ------------------------------------------------
  // Sizes
  // ------------------------------------------------

  const useMobileQuality = window.matchMedia("(hover: none) and (pointer: coarse)").matches

  const qualityProfile = {
    maxPixelRatio: useMobileQuality ? 1.5 : 2,
    renderTargetSamples: useMobileQuality ? 0 : 4,
    textureRoot: useMobileQuality
      ? "/home/hero/textures/mobile"
      : "/home/hero/textures/desktop",
  }

  const sizes = {
    width: renderContainer.clientWidth,
    height: renderContainer.clientHeight,
    pixelRatio: Math.min(window.devicePixelRatio, qualityProfile.maxPixelRatio),
  }

  // ------------------------------------------------
  // Camera
  // ------------------------------------------------

  const camera = new THREE.PerspectiveCamera(35, sizes.width / sizes.height, 0.1, 100)
  camera.position.set(0, 0, 6)
  scene.add(camera)

  // ------------------------------------------------
  // Renderer
  // ------------------------------------------------

  // Setup
  const renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true,
  })
  renderer.setSize(sizes.width, sizes.height, false)
  renderer.setPixelRatio(sizes.pixelRatio)
  renderer.setClearColor("#6b6baf")
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1

  // Render Target texture for glass shader refraction
  const sceneRenderTarget = new THREE.WebGLRenderTarget(
    sizes.width * sizes.pixelRatio,
    sizes.height * sizes.pixelRatio,
    {
      samples: qualityProfile.renderTargetSamples,
    },
  )

  // ------------------------------------------------
  // Interaction state
  // ------------------------------------------------

  // Rayscaster
  const raycaster = new THREE.Raycaster()
  const mouse = new THREE.Vector2()
  let hasPointerPosition = false

  let hoverTarget = 0
  let hoverProgress = 0
  let clickProgress = 0
  let clickTime = 0
  const clickPosition = new THREE.Vector3()
  let isInteractive = true

  // ------------------------------------------------
  // Environment
  // ------------------------------------------------

  const environmentTexture = await textureLoader.loadAsync(
    `${qualityProfile.textureRoot}/scene-gradient.webp`,
  )

  environmentTexture.mapping = THREE.EquirectangularReflectionMapping
  environmentTexture.colorSpace = THREE.SRGBColorSpace

  const pmremGenerator = new THREE.PMREMGenerator(renderer)
  pmremGenerator.compileEquirectangularShader()

  const environmentMap = pmremGenerator.fromEquirectangular(environmentTexture).texture

  scene.background = environmentTexture
  scene.environment = environmentMap

  pmremGenerator.dispose()

  completeLoadingStep()

  // ------------------------------------------------
  // Light
  // ------------------------------------------------

  const ambientLight = new THREE.AmbientLight(0xffffff, 1.2)
  scene.add(ambientLight)

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.05)
  directionalLight.position.set(3, 4, 5)
  scene.add(directionalLight)

  // ------------------------------------------------
  // Logo Model
  // ------------------------------------------------

  // Model group
  const gltf = await gltfLoader.loadAsync("/home/hero/logo.glb")

  completeLoadingStep()

  const logoGroup = new THREE.Group()
  scene.add(logoGroup)

  const logo = gltf.scene
  logoGroup.add(logo)

  const glassLogo = logo.clone(true)
  logoGroup.add(glassLogo)

  // Rotation
  const logoRotationAxis = new THREE.Vector3(0.2, 1, 0.1).normalize()
  const logoBaseRotationSpeed = reducedMotion ? 0 : 0.2

  // ------------------------------------------------
  // Logo Hitbox
  // ------------------------------------------------
  const logoBox = new THREE.Box3().setFromObject(logo)
  const logoSize = logoBox.getSize(new THREE.Vector3())
  const logoCenter = logoBox.getCenter(new THREE.Vector3())
  const logoBoundingDiameter = logoSize.length()
  const logoViewportCoverage = 0.9

  const logoHitBox = new THREE.Mesh(
    new THREE.BoxGeometry(logoSize.x, logoSize.y, logoSize.z),
    new THREE.MeshBasicMaterial({
      visible: false,
    }),
  )

  logoHitBox.position.copy(logoCenter)
  logoGroup.add(logoHitBox)

  const updateLogoScale = () => {
    const cameraDistance = camera.position.distanceTo(logoGroup.position)
    const verticalFov = THREE.MathUtils.degToRad(camera.fov)
    const visibleHeight = 2 * cameraDistance * Math.tan(verticalFov * 0.5)
    const visibleWidth = visibleHeight * camera.aspect

    const availableSize = Math.min(visibleWidth, visibleHeight) * logoViewportCoverage
    const responsiveScale = Math.min(1, availableSize / logoBoundingDiameter)

    logoGroup.scale.setScalar(responsiveScale)
  }

  updateLogoScale()

  // ------------------------------------------------
  // Logo materials
  // ------------------------------------------------

  // Base silver logo
  const silverMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 1,
    roughness: 0.4,
    envMapIntensity: 1.2,
  })

  logo.traverse((child) => {
    if (!child.isMesh) return

    child.material = silverMaterial
    child.renderOrder = 1
  })

  // Glass Shader logo
  const glassMaterial = new THREE.ShaderMaterial({
    vertexShader: logoGlassVertexShader,
    fragmentShader: logoGlassFragmentShader,

    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,

    uniforms: {
      // Vertex
      uSurfaceOffset: { value: 0.0005 },

      // Global
      uTime: { value: 0 },
      uOpacity: { value: 1.0 },
      uSceneTexture: { value: sceneRenderTarget.texture },

      // Hover / reveal
      uHoverProgress: { value: 0 },
      uNoiseScale: { value: 2.0 },
      uNoiseSpeed: { value: 0.1 },
      uRevealEdge: { value: 0.1 },
      uFresnelPower: { value: 1.2 },

      // Refraction / chromatic
      uDistortionStrength: { value: 0.025 },
      uChromaticAberration: { value: 0.0045 },

      // Click ripple
      uClickProgress: { value: 0 },
      uClickPosition: { value: new THREE.Vector3() },
      uClickTime: { value: 0 },
      uClickRadius: { value: 1.2 },
      uClickWaveFrequency: { value: 20.0 },
      uClickWaveSpeed: { value: 7.0 },
      uClickRippleStrength: { value: 0.02 },
      uClickGlowStrength: { value: 0.5 },
      uClickRippleNoise: { value: 0.05 },
    },
  })

  glassLogo.traverse((child) => {
    if (!child.isMesh) return

    child.material = glassMaterial
    child.renderOrder = 2
  })

  // ------------------------------------------------
  // Text planes
  // ------------------------------------------------

  // Setup
  const createTextPlane = async ({ path, width, height, position, rotation }) => {
    const texture = await textureLoader.loadAsync(path)

    texture.colorSpace = THREE.SRGBColorSpace

    const geometry = new THREE.PlaneGeometry(width, height)

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    })

    const mesh = new THREE.Mesh(geometry, material)

    mesh.position.set(position.x, position.y, position.z)
    mesh.rotation.set(rotation.x, rotation.y, rotation.z)

    scene.add(mesh)

    return mesh
  }

  // Position & scale
  const multiplyer1 = 2
  const multiplyer2 = 0.85
  const multiplyer3 = 0.6

  const textName = await createTextPlane({
    path: `${qualityProfile.textureRoot}/texts/text-name.webp`,
    width: 5.5 * multiplyer1,
    height: 1.4 * multiplyer1,
    position: { x: 0, y: 0, z: -2.5 },
    rotation: { x: 0, y: 0, z: 0 },
  })

  completeLoadingStep()

  const textNameVisibleRatio = {
    width: 4488 / 8192,
    height: 1659 / 2048,
  }

  const textNameVisibleSize = {
    width: textName.geometry.parameters.width * textNameVisibleRatio.width,
    height: textName.geometry.parameters.height * textNameVisibleRatio.height,
  }

  const textNameCameraDistance = camera.position.distanceTo(textName.position)
  const textNameViewportCoverage = 0.8

  const updateTextNameScale = () => {
    const verticalFov = THREE.MathUtils.degToRad(camera.fov)
    const visibleHeight = 2 * textNameCameraDistance * Math.tan(verticalFov * 0.5)
    const visibleWidth = visibleHeight * camera.aspect

    const horizontalScale = (visibleWidth * textNameViewportCoverage) / textNameVisibleSize.width
    const verticalScale = (visibleHeight * textNameViewportCoverage) / textNameVisibleSize.height

    const responsiveScale = Math.min(1, horizontalScale, verticalScale)

    textName.scale.setScalar(responsiveScale)
  }

  updateTextNameScale()

  const textArt = await createTextPlane({
    path: `${qualityProfile.textureRoot}/texts/text-art-director-justified.webp`,
    width: 5.5 * multiplyer2,
    height: 1.4 * multiplyer2,
    position: { x: 1, y: 5.25, z: -1.75 },
    rotation: { x: 0, y: -Math.PI * 0.5, z: 0 },
  })

  completeLoadingStep()

  const textCreative = await createTextPlane({
    path: `${qualityProfile.textureRoot}/texts/text-creative-developer-justified.webp`,
    width: 5.5 * multiplyer3,
    height: 1.4 * multiplyer3,
    position: { x: -1, y: 6.5, z: 1.25 },
    rotation: { x: 0, y: -Math.PI * 0.5, z: 0 },
  })

  completeLoadingStep()

  const roleTextsReferenceAspect = 16 / 10
  const textArtBaseZ = textArt.position.z
  const textCreativeBaseZ = textCreative.position.z

  const updateRoleTextsLayout = () => {
    const responsiveFactor = Math.min(1, camera.aspect / roleTextsReferenceAspect)

    textArt.scale.setScalar(responsiveFactor)
    textCreative.scale.setScalar(responsiveFactor)

    textArt.position.z = textArtBaseZ * responsiveFactor
    textCreative.position.z = textCreativeBaseZ * responsiveFactor
  }

  updateRoleTextsLayout()

  textName.material.opacity = 1
  textArt.material.opacity = 0
  textCreative.material.opacity = 0

  // ------------------------------------------------
  // Scroll state
  // ------------------------------------------------

  let scrollProgress = 0
  let scrollRotationBoost = 0

  const maxScrollRotationBoost = 2.5
  const scrollVelocityNormalizer = 2000

  const radius = 6
  const floorHeight = 3
  const floorCount = 3
  const totalHeight = floorHeight * (floorCount - 1)
  const totalCameraAngle = Math.PI * 0.5

  // ------------------------------------------------
  // Scroll controls
  // ------------------------------------------------
  const setScrollProgress = (value, velocity = 0) => {
    scrollProgress = value

    const normalizedVelocity = THREE.MathUtils.clamp(
      Math.abs(velocity) / scrollVelocityNormalizer,
      0,
      1,
    )

    const boost = reducedMotion ? 0 : normalizedVelocity * maxScrollRotationBoost
    scrollRotationBoost = Math.max(scrollRotationBoost, boost)
  }

  const updateSceneFromScroll = () => {
    const currentY = scrollProgress * totalHeight
    const angle = -scrollProgress * totalCameraAngle

    logoGroup.position.y = currentY

    camera.position.x = Math.sin(angle) * radius
    camera.position.y = currentY
    camera.position.z = Math.cos(angle) * radius

    camera.lookAt(0, currentY, 0)

    const nameTextOpacity = 1 - THREE.MathUtils.smoothstep(scrollProgress, 0.2, 0.4)
    const roleTextOpacity = THREE.MathUtils.smoothstep(scrollProgress, 0.72, 0.9)

    textName.material.opacity = nameTextOpacity
    textArt.material.opacity = roleTextOpacity
    textCreative.material.opacity = roleTextOpacity
  }

  const setInteractive = (value) => {
    isInteractive = value

    if (!isInteractive) {
      hoverTarget = 0
      document.body.style.cursor = "default"
    }
  }

  // ------------------------------------------------
  // Events
  // ------------------------------------------------

  // Resize
  const updateSize = () => {
    // Update sizes
    sizes.width = renderContainer.clientWidth
    sizes.height = renderContainer.clientHeight
    sizes.pixelRatio = Math.min(window.devicePixelRatio, qualityProfile.maxPixelRatio)

    // Update camera
    camera.aspect = sizes.width / sizes.height
    camera.updateProjectionMatrix()
    updateLogoScale()
    updateTextNameScale()
    updateRoleTextsLayout()

    // Update renderer
    renderer.setSize(sizes.width, sizes.height, false)
    renderer.setPixelRatio(sizes.pixelRatio)

    sceneRenderTarget.setSize(sizes.width * sizes.pixelRatio, sizes.height * sizes.pixelRatio)
  }

  const resizeObserver = new ResizeObserver(updateSize)

  resizeObserver.observe(renderContainer)
  window.addEventListener("resize", updateSize)

  // Mouse
  window.addEventListener("mousemove", (event) => {
    hasPointerPosition = true

    mouse.x = (event.clientX / sizes.width) * 2 - 1
    mouse.y = -(event.clientY / sizes.height) * 2 + 1
  })

  window.addEventListener("click", () => {
    if (!isInteractive) return
    if (!hasPointerPosition) return
    if (!hoverTarget) return
    if (hoverProgress < 0.75) return

    raycaster.setFromCamera(mouse, camera)

    const clickIntersects = raycaster.intersectObject(logoHitBox)

    if (clickIntersects.length === 0) return

    clickPosition.copy(clickIntersects[0].point)
    clickTime = performance.now() * 0.001

    clickProgress = 1
  })

  // ------------------------------------------------
  // Animation loop
  // ------------------------------------------------
  let previousTime = 0
  let isReady = false
  let isRunning = false
  let startRequested = autoStart
  let animationFrameId = null

  const renderFrame = () => {
    logo.visible = false
    glassLogo.visible = false

    renderer.setRenderTarget(sceneRenderTarget)
    renderer.render(scene, camera)

    logo.visible = true
    glassLogo.visible = true

    renderer.setRenderTarget(null)
    renderer.render(scene, camera)
  }

  const tick = (currentTime) => {
    if (!isRunning) return

    // Time
    const delta = (currentTime - previousTime) / 1000
    previousTime = currentTime

    // Update shader uniforms
    glassMaterial.uniforms.uTime.value = currentTime * 0.001

    // Scroll-driven scene update
    updateSceneFromScroll()

    // Hover interaction
    if (isInteractive && hasPointerPosition) {
      raycaster.setFromCamera(mouse, camera)
      const intersects = raycaster.intersectObject(logoHitBox)

      hoverTarget = intersects.length > 0 ? 1 : 0
      document.body.style.cursor = hoverTarget ? "pointer" : "default"
    } else {
      hoverTarget = 0
      document.body.style.cursor = "default"
    }

    hoverProgress = THREE.MathUtils.damp(hoverProgress, hoverTarget, 4.5, delta)
    glassMaterial.uniforms.uHoverProgress.value = hoverProgress

    // Click ripple animation
    clickProgress = THREE.MathUtils.damp(clickProgress, 0, 3.5, delta)

    glassMaterial.uniforms.uClickProgress.value = clickProgress
    glassMaterial.uniforms.uClickPosition.value.copy(clickPosition)
    glassMaterial.uniforms.uClickTime.value = clickTime

    // Update logo rotation
    scrollRotationBoost = THREE.MathUtils.damp(scrollRotationBoost, 0, 1.5, delta)

    const logoRotationSpeed = logoBaseRotationSpeed + scrollRotationBoost
    logoGroup.rotateOnAxis(logoRotationAxis, delta * logoRotationSpeed)

    // Render
    renderFrame()

    animationFrameId = window.requestAnimationFrame(tick)
  }

  // ------------------------------------------------
  // Loader preparation
  // ------------------------------------------------

  const start = () => {
    startRequested = true

    if (!isReady || isRunning) return

    isRunning = true
    previousTime = performance.now()

    animationFrameId = window.requestAnimationFrame(tick)
  }

  const pause = () => {
    startRequested = false
    isRunning = false

    if (animationFrameId === null) return

    window.cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }

  const ready = (async () => {
    await renderer.compileAsync(scene, camera)

    await new Promise((resolve) => {
      window.requestAnimationFrame((currentTime) => {
        glassMaterial.uniforms.uTime.value = currentTime * 0.001
        updateSceneFromScroll()
        renderFrame()

        window.requestAnimationFrame(resolve)
      })
    })

    completeLoadingStep()

    isReady = true

    if (startRequested) {
      start()
    }
  })()

  return {
    scene,
    camera,
    renderer,
    logoGroup,
    ready,
    start,
    pause,
    setScrollProgress,
    setInteractive,
  }
}
