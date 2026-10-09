export function createTrajectoryBackground(root, { reducedMotion = false } = {}) {
  const canvas = root.querySelector(".trajectory-sentences__canvas")
  const frame = canvas?.closest(".trajectory-sentences__container")
  const left = root.querySelector(".trajectory-sentences__visual--left")
  const right = root.querySelector(".trajectory-sentences__visual--right")

  if (reducedMotion || !canvas || !frame || !left || !right) {
    return { prepare: async () => false, setActive() {} }
  }

  let scene = null
  let preparation = null
  let uniforms = null
  let ready = false
  let active = false
  let visible = false
  let presented = false
  let hasPresented = false
  let suspended = false
  let failed = false
  let destroyed = false
  let layoutDirty = true
  let measuredSize = null
  const state = { idleStrength: 0, interactionStrength: 0, zoom: 1 }

  function hide() {
    scene?.stop()
    scene?.setInteractive(false)
    canvas.style.opacity = "0"
    presented = false
  }

  function unavailable() {
    failed = true
    ready = false
    hide()
  }

  function measureSize() {
    if (!measuredSize || layoutDirty) {
      const style = getComputedStyle(canvas)
      measuredSize = { width: parseFloat(style.width), height: parseFloat(style.height) }
    }
    return measuredSize
  }

  function beforeRender(gl, program) {
    if (!layoutDirty) return
    const { width, height } = measureSize()
    const background = getComputedStyle(left).backgroundSize.split(/\s+/)
    const rightWidth = parseFloat(getComputedStyle(right).width)

    if (background.length !== 2 || !background.every((value) => value.endsWith("px"))) {
      return false
    }

    const [backgroundWidth, backgroundHeight] = background.map(Number.parseFloat)
    if (![width, height, rightWidth, backgroundWidth, backgroundHeight]
      .every((value) => Number.isFinite(value) && value > 0)) return false

    uniforms ||= {
      scale: gl.getUniformLocation(program, "u_cssScale"),
      split: gl.getUniformLocation(program, "u_split"),
    }
    gl.uniform2f(uniforms.scale, width / backgroundWidth, height / backgroundHeight)
    // The right background is painted last, including the overlap.
    gl.uniform1f(uniforms.split, (width - rightWidth) / width)
    layoutDirty = false
  }

  function isFullscreen() {
    const bounds = frame.getBoundingClientRect()
    const a = left.getBoundingClientRect()
    const b = right.getBoundingClientRect()
    const close = (x, y) => Math.abs(x - y) <= 0.5

    return close(a.left, bounds.left) && close(b.right, bounds.right)
      && close(a.top, bounds.top) && close(b.top, bounds.top)
      && close(a.bottom, bounds.bottom) && close(b.bottom, bounds.bottom)
      && a.right >= b.left
  }

  function sync(redraw = false) {
    if (destroyed || failed || suspended || document.hidden
      || !active || !visible || !ready || !isFullscreen()) {
      hide()
      return
    }
    const animate = state.idleStrength > 0 || state.interactionStrength > 0

    try {
      // Keep the first handoff neutral; preserve the idle phase on resume.
      scene.setState(
        hasPresented ? state : { idleStrength: 0, interactionStrength: 0, zoom: 1 },
      )
      if (!animate) scene.stop()

      if (!presented || redraw || !animate) {
        if (!presented) layoutDirty = true
        if (!scene.render()) {
          hide()
          return
        }
        canvas.style.opacity = "1"
        presented = true
        hasPresented = true
      }

      scene.setState(state)
      scene.setInteractive(state.interactionStrength > 0)
      if (animate) scene.start()
    } catch (error) {
      console.error("Unable to render the trajectory background.", error)
      unavailable()
    }
  }

  function prepare() {
    if (preparation || destroyed || failed) return preparation || Promise.resolve(false)
    root.classList.add("is-background-ready")

    preparation = (async () => {
      const { createImageDistortionScene } = await import(
        "../../../shared/webgl/createImageDistortionScene"
      )
      if (destroyed) return false

      scene = createImageDistortionScene({
        canvas,
        scene: frame,
        imageUrl: "/home/trajectory/background.webp",
        mapping: "stretch",
        autoStart: false,
        interactive: false,
        primePointer: true,
        idleStrength: 0,
        interactionStrength: 0,
        zoom: 1,
        maxPixelRatio: Infinity,
        measureSize,
        beforeRender,
        onUnavailable: unavailable,
      })
      if (!scene) {
        unavailable()
        return false
      }

      ready = await scene.ready
      if (destroyed) return false
      sync(true)
      return ready
    })().catch((error) => {
      console.error("Unable to prepare the trajectory background.", error)
      unavailable()
      return false
    })

    return preparation
  }

  function setActive(value, nextState = state) {
    active = value
    if (!active) hasPresented = false
    Object.assign(state, nextState)
    if (active) void prepare()
    sync()
  }

  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting
    sync()
  })
  const redraw = () => {
    layoutDirty = true
    sync(true)
  }
  const resizeObserver = new ResizeObserver(redraw)

  function handlePageHide(event) {
    if (!event.persisted) {
      destroy()
      return
    }
    suspended = true
    hide()
  }

  function handlePageShow() {
    suspended = false
    const bounds = frame.getBoundingClientRect()
    visible = bounds.bottom > 0 && bounds.top < window.innerHeight
    redraw()
  }

  function destroy() {
    if (destroyed) return
    destroyed = true
    hide()
    observer.disconnect()
    resizeObserver.disconnect()
    window.removeEventListener("resize", redraw)
    document.removeEventListener("visibilitychange", redraw)
    window.removeEventListener("pagehide", handlePageHide)
    window.removeEventListener("pageshow", handlePageShow)
    scene?.destroy()
  }

  observer.observe(frame)
  resizeObserver.observe(frame)
  window.addEventListener("resize", redraw, { passive: true })
  document.addEventListener("visibilitychange", redraw)
  window.addEventListener("pagehide", handlePageHide)
  window.addEventListener("pageshow", handlePageShow)

  return { prepare, setActive, destroy }
}
