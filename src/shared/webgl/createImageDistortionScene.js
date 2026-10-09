import fragmentShader from "./shaders/image-distortion/fragment.glsl"
import vertexShader from "./shaders/image-distortion/vertex.glsl"

const DEFAULT_CONFIG = Object.freeze({
  radius: 0.35,
  velocityGain: 0.25,
  positionDamping: 0.1,
  velocityDamping: 0.15,
  strengthRise: 0.15,
  strengthDecay: 0.03,
  idleStrength: 0.01,
  interactionStrength: 1,
  idleSpeed: 1,
  idleFrequency: [5, 20],
  zoom: 1.05,
  maxPixelRatio: 1.5,
})

function frameIndependentDamping(damping, deltaTime) {
  return 1 - Math.pow(1 - damping, deltaTime * 60)
}

function createShader(gl, type, source) {
  const shader = gl.createShader(type)

  gl.shaderSource(shader, source)
  gl.compileShader(shader)

  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    return shader
  }

  const message = gl.getShaderInfoLog(shader)

  gl.deleteShader(shader)
  throw new Error(message || "Unable to compile the image shader.")
}

function createProgram(gl, mapping) {
  const fragmentSource = mapping === "stretch"
    ? `#define TRAJECTORY_MAPPING\n${fragmentShader}`
    : fragmentShader
  const program = gl.createProgram()
  const vertex = createShader(gl, gl.VERTEX_SHADER, vertexShader)
  const fragment = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource)

  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)

  gl.deleteShader(vertex)
  gl.deleteShader(fragment)

  if (gl.getProgramParameter(program, gl.LINK_STATUS)) {
    return program
  }

  const message = gl.getProgramInfoLog(program)

  gl.deleteProgram(program)
  throw new Error(message || "Unable to link the image shader program.")
}

function loadTexture(gl, imageUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image()

    image.decoding = "async"

    image.addEventListener(
      "load",
      () => {
        const texture = gl.createTexture()

        gl.bindTexture(gl.TEXTURE_2D, texture)
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)

        resolve({
          texture,
          width: image.naturalWidth || 1,
          height: image.naturalHeight || 1,
        })
      },
      { once: true },
    )

    image.addEventListener(
      "error",
      () => {
        reject(new Error(`Unable to load the image texture: ${imageUrl}`))
      },
      { once: true },
    )

    image.src = imageUrl
  })
}

export function createImageDistortionScene({
  canvas,
  scene,
  imageUrl,
  reducedMotion = false,
  autoStart = true,
  interactive = true,
  primePointer = false,
  mapping = "cover",
  measureSize,
  beforeRender,
  onRender = () => {},
  onUnavailable = () => {},
  ...options
} = {}) {

  if (!canvas || !scene || !imageUrl) return null

  const config = {
    ...DEFAULT_CONFIG,
    ...options,
  }

  const gl = canvas.getContext("webgl", {
    alpha: false,
    antialias: false,
    depth: false,
    powerPreference: "low-power",
    stencil: false,
  })

  if (!gl) return null

  let program

  try {
    program = createProgram(gl, mapping)
  } catch (error) {
    console.error("Unable to initialize the image WebGL scene.", error)
    return null
  }

  const positionBuffer = gl.createBuffer()
  const positionLocation = gl.getAttribLocation(program, "a_position")
  const uniformLocations = {
    image: gl.getUniformLocation(program, "u_image"),
    imageResolution: gl.getUniformLocation(program, "u_imageResolution"),
    resolution: gl.getUniformLocation(program, "u_resolution"),
    time: gl.getUniformLocation(program, "u_time"),
    idleSpeed: gl.getUniformLocation(program, "u_idleSpeed"),
    idleStrength: gl.getUniformLocation(program, "u_idleStrength"),
    interactionStrength: gl.getUniformLocation(program, "u_interactionStrength"),
    idleFrequency: gl.getUniformLocation(program, "u_idleFrequency"),
    mouse: gl.getUniformLocation(program, "u_mouse"),
    velocity: gl.getUniformLocation(program, "u_velocity"),
    strength: gl.getUniformLocation(program, "u_strength"),
    radius: gl.getUniformLocation(program, "u_radius"),
    zoom: gl.getUniformLocation(program, "u_zoom"),
  }

  let animationFrame = 0
  let elapsedTime = 0
  let lastFrameTime = 0
  const targetMouse = { x: 0.5, y: 0.5 }
  const smoothedMouse = { x: 0.5, y: 0.5 }
  const previousMouse = { x: 0.5, y: 0.5 }
  const rawVelocity = { x: 0, y: 0 }
  const smoothedVelocity = { x: 0, y: 0 }
  let strength = 0
  let pointerActive = false
  let pointerListening = false
  let needsPointerSeed = primePointer
  let texture = null
  let isDestroyed = false
  let isRunning = false
  let contextLost = false

  const supportsPointerInteraction = window.matchMedia("(hover: hover) and (pointer: fine)").matches

  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)

  gl.useProgram(program)
  gl.enableVertexAttribArray(positionLocation)
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)
  gl.uniform1i(uniformLocations.image, 0)
  gl.uniform1f(uniformLocations.idleSpeed, config.idleSpeed)
  gl.uniform1f(uniformLocations.idleStrength, reducedMotion ? 0 : config.idleStrength)
  gl.uniform1f(uniformLocations.interactionStrength, reducedMotion ? 0 : config.interactionStrength)
  gl.uniform2fv(uniformLocations.idleFrequency, config.idleFrequency)
  gl.uniform1f(uniformLocations.radius, config.radius)
  gl.uniform1f(uniformLocations.zoom, config.zoom)

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, config.maxPixelRatio)
    const size = measureSize?.() || { width: canvas.clientWidth, height: canvas.clientHeight }
    const width = Math.max(1, Math.round(size.width * dpr))
    const height = Math.max(1, Math.round(size.height * dpr))

    if (canvas.width === width && canvas.height === height) return

    canvas.width = width
    canvas.height = height
    gl.viewport(0, 0, width, height)
  }

  function advanceSimulation(frameTime) {
    const deltaTime = lastFrameTime
      ? Math.min(Math.max((frameTime - lastFrameTime) / 1000, 1 / 240), 1 / 30)
      : 1 / 60

    lastFrameTime = frameTime
    elapsedTime += deltaTime

    const positionFactor = frameIndependentDamping(config.positionDamping, deltaTime)

    smoothedMouse.x += (targetMouse.x - smoothedMouse.x) * positionFactor
    smoothedMouse.y += (targetMouse.y - smoothedMouse.y) * positionFactor

    rawVelocity.x = ((smoothedMouse.x - previousMouse.x) / deltaTime) * config.velocityGain
    rawVelocity.y = ((smoothedMouse.y - previousMouse.y) / deltaTime) * config.velocityGain
    previousMouse.x = smoothedMouse.x
    previousMouse.y = smoothedMouse.y

    const velocityFactor = frameIndependentDamping(config.velocityDamping, deltaTime)

    smoothedVelocity.x += (rawVelocity.x - smoothedVelocity.x) * velocityFactor
    smoothedVelocity.y += (rawVelocity.y - smoothedVelocity.y) * velocityFactor

    const pointerSpeed = Math.hypot(smoothedVelocity.x, smoothedVelocity.y)
    const targetStrength = pointerActive ? Math.min(pointerSpeed * 6, 1) : 0
    const strengthDamping = strength < targetStrength ? config.strengthRise : config.strengthDecay
    const strengthFactor = frameIndependentDamping(strengthDamping, deltaTime)

    strength += (targetStrength - strength) * strengthFactor
  }

  function render(frameTime = 0, advance = autoStart) {
    if (isDestroyed || contextLost || !texture || gl.isContextLost()) return false

    resize()
    if (beforeRender?.(gl, program) === false) return false
    if (advance) advanceSimulation(frameTime)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.uniform2f(uniformLocations.mouse, smoothedMouse.x, smoothedMouse.y)
    gl.uniform2f(uniformLocations.velocity, smoothedVelocity.x, smoothedVelocity.y)
    gl.uniform1f(uniformLocations.strength, strength)
    gl.uniform2f(uniformLocations.resolution, canvas.width, canvas.height)
    gl.uniform1f(uniformLocations.time, elapsedTime)
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    if (!autoStart && (gl.isContextLost() || gl.getError() !== gl.NO_ERROR)) {
      onUnavailable()
      return false
    }

    onRender()

    if (isRunning && autoStart) {
      animationFrame = requestAnimationFrame(render)
    }

    return true
  }

  function tick(frameTime) {
    animationFrame = 0
    if (!isRunning) return

    try {
      if (!render(frameTime, true)) {
        stop()
        onUnavailable()
        return
      }
    } catch (error) {
      stop()
      onUnavailable()
      console.error("Unable to animate the image WebGL scene.", error)
      return
    }

    if (isRunning) animationFrame = requestAnimationFrame(tick)
  }

  function setState({
    idleStrength = config.idleStrength,
    interactionStrength = config.interactionStrength,
    zoom = config.zoom,
  } = {}) {
    if (isDestroyed || contextLost) return

    config.idleStrength = Math.max(0, idleStrength)
    config.interactionStrength = Math.min(1, Math.max(0, interactionStrength))
    config.zoom = Math.max(1, zoom)
    gl.uniform1f(uniformLocations.idleStrength, reducedMotion ? 0 : config.idleStrength)
    gl.uniform1f(uniformLocations.interactionStrength, reducedMotion ? 0 : config.interactionStrength)
    gl.uniform1f(uniformLocations.zoom, config.zoom)
  }

  function start() {
    if (isDestroyed || contextLost || !texture || isRunning || reducedMotion || document.hidden) return

    isRunning = true
    lastFrameTime = 0
    animationFrame = requestAnimationFrame(autoStart ? render : tick)
  }

  function stop() {
    isRunning = false
    cancelAnimationFrame(animationFrame)
    animationFrame = 0
  }

  function handlePointerMove(event) {
    if (primePointer && event.pointerType === "touch") return
    const bounds = scene.getBoundingClientRect()

    targetMouse.x = (event.clientX - bounds.left) / bounds.width
    targetMouse.y = 1 - (event.clientY - bounds.top) / bounds.height
    if (needsPointerSeed) {
      Object.assign(smoothedMouse, targetMouse)
      Object.assign(previousMouse, targetMouse)
      rawVelocity.x = rawVelocity.y = 0
      smoothedVelocity.x = smoothedVelocity.y = 0
      strength = 0
      needsPointerSeed = false
    }
    pointerActive = true
  }

  function handlePointerLeave() {
    pointerActive = false
    if (primePointer) needsPointerSeed = true
  }

  function setInteractive(enabled) {
    const next = Boolean(enabled && supportsPointerInteraction && !reducedMotion
      && !isDestroyed && !contextLost)
    if (next === pointerListening) return

    pointerListening = next
    pointerActive = false
    needsPointerSeed = primePointer
    rawVelocity.x = rawVelocity.y = 0
    smoothedVelocity.x = smoothedVelocity.y = 0
    strength = 0

    if (next) {
      scene.addEventListener("pointerenter", handlePointerMove, { passive: true })
      scene.addEventListener("pointermove", handlePointerMove, { passive: true })
      scene.addEventListener("pointerleave", handlePointerLeave)
    } else {
      scene.removeEventListener("pointerenter", handlePointerMove)
      scene.removeEventListener("pointermove", handlePointerMove)
      scene.removeEventListener("pointerleave", handlePointerLeave)
    }
  }

  function handleVisibilityChange() {
    if (!autoStart) return

    if (document.hidden) {
      stop()
      return
    }

    start()
  }

  function handleResize() {
    if (!autoStart || !reducedMotion || !texture) return

    render()
  }

  function handleContextLost(event) {
    event.preventDefault()
    contextLost = true
    stop()
    onUnavailable()
  }

  setInteractive(interactive)

  document.addEventListener("visibilitychange", handleVisibilityChange)
  window.addEventListener("resize", handleResize, { passive: true })
  canvas.addEventListener("webglcontextlost", handleContextLost)

  const ready = loadTexture(gl, imageUrl)
    .then((loadedImage) => {
      if (isDestroyed) {
        gl.deleteTexture(loadedImage.texture)
        return false
      }

      texture = loadedImage.texture
      gl.uniform2f(uniformLocations.imageResolution, loadedImage.width, loadedImage.height)

      if (reducedMotion || !autoStart) {
        return render()
      }

      start()
      return true
    })
    .catch((error) => {
      console.error("Unable to prepare the WebGL texture.", error)
      onUnavailable()
      return false
    })

  function destroy() {
    if (isDestroyed) return

    isDestroyed = true
    stop()

    scene.removeEventListener("pointerenter", handlePointerMove)
    scene.removeEventListener("pointermove", handlePointerMove)
    scene.removeEventListener("pointerleave", handlePointerLeave)
    document.removeEventListener("visibilitychange", handleVisibilityChange)
    window.removeEventListener("resize", handleResize)
    canvas.removeEventListener("webglcontextlost", handleContextLost)

    if (texture) gl.deleteTexture(texture)

    gl.deleteBuffer(positionBuffer)
    gl.deleteProgram(program)
  }

  return {
    ready,
    render,
    setState,
    setInteractive,
    start,
    stop,
    destroy,
  }
}
