import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"

let matterModulePromise = null

export function preloadProjectPhysicsModule() {
  matterModulePromise ??= import("matter-js").then(({ default: Matter }) => Matter)

  return matterModulePromise
}

function measureProjectLetterLayout(links, { neutralizeLinks = false } = {}) {
  const savedTransforms = neutralizeLinks
    ? [...links].map((link) => link.style.transform)
    : null

  if (neutralizeLinks) {
    links.forEach((link) => {
      link.style.transform = "none"
    })
  }

  try {
    const currentScrollY = window.scrollY

    return [...links].map((link) => {
      const projectLetters = [...link.querySelectorAll(".project-letter")]
      const middleIndex = (projectLetters.length - 1) / 2

      return projectLetters.flatMap((letter, index) => {
        const rect = letter.getBoundingClientRect()

        if (rect.width === 0 || rect.height === 0) return []

        return {
          element: letter,
          centerX: rect.left + rect.width / 2,
          centerY: rect.top + currentScrollY + rect.height / 2,
          width: rect.width,
          height: rect.height,
          weight: middleIndex === 0 ? 0 : Math.abs(index - middleIndex) / middleIndex,
        }
      })
    })
  } finally {
    if (neutralizeLinks) {
      links.forEach((link, index) => {
        link.style.transform = savedTransforms[index]
      })
    }
  }
}

export function createProjectLetterPhysics(
  links,
  { monitorPerformance = false, disabled = false } = {},
) {
  if (disabled) {
    return {
      ensure: () => Promise.resolve(null),
      start: () => {},
      settleAndStop: () => {},
      setScrollVelocity: () => {},
    }
  }

  let initialLetterLayout = measureProjectLetterLayout(links)
  let measuredViewportWidth = window.innerWidth
  let measuredViewportHeight = window.innerHeight

  let physicsPromise = null
  let physicsController = null
  let shouldRun = false
  let latestScrollVelocity = 0

  function ensure() {
    physicsPromise ??= preloadProjectPhysicsModule()
      .then((Matter) => {
        const hasViewportChanged =
          window.innerWidth !== measuredViewportWidth ||
          window.innerHeight !== measuredViewportHeight

        if (hasViewportChanged) {
          initialLetterLayout = measureProjectLetterLayout(links, {
            neutralizeLinks: true,
          })

          measuredViewportWidth = window.innerWidth
          measuredViewportHeight = window.innerHeight
        }

        physicsController = createMatterProjectLetterPhysics(
          Matter,
          links,
          { monitorPerformance },
          initialLetterLayout,
        )

        if (shouldRun) {
          physicsController.start()
          physicsController.setScrollVelocity(latestScrollVelocity)
        }

        return physicsController
      })
      .catch((error) => {
        console.error("Unable to initialize Projects physics.", error)
        return null
      })

    return physicsPromise
  }

  return {
    ensure,

    start() {
      shouldRun = true

      if (physicsController) {
        physicsController.start()
        return
      }

      ensure()
    },

    settleAndStop() {
      shouldRun = false
      physicsController?.settleAndStop()
    },

    setScrollVelocity(velocity) {
      latestScrollVelocity = velocity
      physicsController?.setScrollVelocity(velocity)
    },
  }
}

function createMatterProjectLetterPhysics(
  Matter,
  links,
  { monitorPerformance = false } = {},
  initialLetterLayout,
) {
  // ----------------------------------
  // 1. MATTER.JS SETUP
  // ----------------------------------

  const { Engine, Composite, Bodies, Body, Constraint } = Matter

  const engine = Engine.create()
  engine.world.gravity.y = 0.5

  const collisionGroup = Body.nextGroup(true)

  // Store the connection between DOM letters and their Matter.js bodies
  const letterBodies = []

  let isSettling = false
  let isPhysicsDisabled = false

  let resizeTimeout

  // ----------------------------------
  // 2. PERFORMANCE MONITORING
  // ----------------------------------

  let performanceCheckComplete = !monitorPerformance
  let measuredFrameCount = 0
  let slowFrameCount = 0
  let hasLowPerformance = false

  function updatePerformanceCheck(deltaTime) {
    if (performanceCheckComplete || !Number.isFinite(deltaTime)) return

    measuredFrameCount += 1

    if (deltaTime > 24) {
      slowFrameCount += 1
    }

    if (measuredFrameCount < 30) return

    hasLowPerformance = slowFrameCount / measuredFrameCount >= 0.7
    performanceCheckComplete = true

    if (hasLowPerformance) {
      disableProjectPhysics()
    }
  }

  // ----------------------------------
  // 2. CREATE AND REBUILD PHYSICS
  // ----------------------------------

  function createProjectPhysics(layout = null) {
    // ----------------------------------
    // Reset previous DOM transformations
    // ----------------------------------

    links.forEach((link) => {
      const letters = link.querySelectorAll(".project-letter")

      letters.forEach((letter) => {
        letter.style.transform = ""
      })
    })

    // ----------------------------------
    // Clear the previous simulation
    // ----------------------------------

    Composite.clear(engine.world, false)
    Engine.clear(engine)

    letterBodies.length = 0

    const projectLayouts =
      layout ?? measureProjectLetterLayout(links, { neutralizeLinks: true })

    // ----------------------------------
    // Build each project line separately
    // ----------------------------------
    // Prevents last letter of one project being connected to the next project

    projectLayouts.forEach((projectLetters) => {
      const projectLetterBodies = []

      // --------------------------------
      // Create one body for each letter
      // --------------------------------

      projectLetters.forEach((letterLayout) => {
        const { element, centerX, centerY, width, height, weight } = letterLayout

        // Invisible physical body
        const body = Bodies.rectangle(centerX, centerY, width, height, {
          frictionAir: 0.05,
          density: 0.001,

          collisionFilter: {
            group: collisionGroup,
          },
        })

        // Anchor pulls the letter back to its initial position
        const anchor = Constraint.create({
          pointA: {
            x: centerX,
            y: centerY,
          },

          bodyB: body,

          stiffness: 0.005,
          damping: 0.004,
          length: 0,
        })

        const letterData = {
          element,
          body,
          anchor,

          initialX: centerX,
          initialY: centerY,

          width,
          weight,
        }

        projectLetterBodies.push(letterData)
        letterBodies.push(letterData)

        Composite.add(engine.world, [body, anchor])
      })

      // --------------------------------
      // Connect neighboring letters
      // --------------------------------
      // These constraints make the project name behave like one flexible line

      for (let index = 0; index < projectLetterBodies.length - 1; index++) {
        const currentLetter = projectLetterBodies[index]

        const nextLetter = projectLetterBodies[index + 1]

        const connection = Constraint.create({
          bodyA: currentLetter.body,
          bodyB: nextLetter.body,

          // Right side of the current letter
          pointA: {
            x: currentLetter.width / 2,
            y: 0,
          },

          // Left side of the next letter
          pointB: {
            x: -nextLetter.width / 2,
            y: 0,
          },

          stiffness: 0.6,
          length: 0,
        })

        Composite.add(engine.world, connection)
      }
    })
  }

  // ----------------------------------
  // 3. RESET LETTERS
  // ----------------------------------

  function resetLettersToInitialPosition() {
    letterBodies.forEach((letter) => {
      Body.setPosition(letter.body, {
        x: letter.initialX,
        y: letter.initialY,
      })

      Body.setVelocity(letter.body, {
        x: 0,
        y: 0,
      })

      Body.setAngle(letter.body, 0)
      Body.setAngularVelocity(letter.body, 0)

      letter.anchor.pointA.y = letter.initialY

      // Remove Matter.js DOM transformation
      letter.element.style.transform = ""
    })
  }

  function disableProjectPhysics() {
    settleAndStopProjectPhysics()

    isPhysicsDisabled = true

    clearTimeout(resizeTimeout)
    window.removeEventListener("resize", handleResize)
  }

  // ----------------------------------
  // 4. UPDATE PHYSICS ON EACH FRAME
  // ----------------------------------

  function updateProjectPhysics(_time, deltaTime) {
    updatePerformanceCheck(deltaTime)

    // Advance the Matter.js simulation
    Engine.update(engine, 1000 / 60)

    letterBodies.forEach((letter) => {
      // Reduce excessive rotation
      Body.setAngle(letter.body, letter.body.angle * 0.97)

      Body.setAngularVelocity(letter.body, letter.body.angularVelocity * 0.95)

      // Calculate movement from the initial position
      const offsetX = letter.body.position.x - letter.initialX

      const offsetY = letter.body.position.y - letter.initialY

      // Apply Matter.js movement to the DOM letter
      letter.element.style.transform = `
        translate3d(${offsetX}px, ${offsetY}px, 0)
        rotate(${letter.body.angle}rad)
      `
    })

    if (!isSettling) return

    // ----------------------------------
    // Check if all letters are at rest
    // ----------------------------------

    const areLettersSettled = letterBodies.every((letter) => {
      const distanceX = Math.abs(letter.body.position.x - letter.initialX)

      const distanceY = Math.abs(letter.body.position.y - letter.initialY)

      const velocity = Math.hypot(letter.body.velocity.x, letter.body.velocity.y)

      const angularVelocity = Math.abs(letter.body.angularVelocity)

      const anchorDistance = Math.abs(letter.anchor.pointA.y - letter.initialY)

      return (
        distanceX < 0.25 &&
        distanceY < 0.25 &&
        velocity < 0.02 &&
        angularVelocity < 0.002 &&
        anchorDistance < 0.1
      )
    })

    if (!areLettersSettled) return

    // Reset remaining invisible fraction
    resetLettersToInitialPosition()

    isSettling = false

    // Stop updating Matter.js
    gsap.ticker.remove(updateProjectPhysics)
  }

  // ----------------------------------
  // 5. PHYSICS CONTROLS
  // ----------------------------------

  // Restart if come back
  function startProjectPhysics() {
    if (isPhysicsDisabled) return

    isSettling = false

    // Restore gravity
    engine.world.gravity.y = 0.5

    // Stop an unfinished return animation
    letterBodies.forEach((letter) => {
      gsap.killTweensOf(letter.anchor.pointA)
    })

    // Prevent duplicate ticker registrations
    gsap.ticker.remove(updateProjectPhysics)

    gsap.ticker.add(updateProjectPhysics)
  }

  // Progressive stop
  function settleAndStopProjectPhysics() {
    if (isPhysicsDisabled) return

    isSettling = true

    // Remove gravity while letters return
    engine.world.gravity.y = 0

    // Bring every anchor back to its origin
    letterBodies.forEach((letter) => {
      gsap.to(letter.anchor.pointA, {
        y: letter.initialY,
        duration: 0.35,
        ease: "power3.out",
        overwrite: true,
      })
    })
  }

  // Scroll velocity transfert
  function setScrollVelocity(velocity) {
    if (isPhysicsDisabled || isSettling) return

    const responsiveStrength = gsap.utils.clamp(0.5, 1, window.innerWidth / 1200)

    letterBodies.forEach((letter) => {
      // Move the anchor according to scroll velocity and available viewport width
      letter.anchor.pointA.y =
        letter.initialY + velocity * 0.08 * responsiveStrength * letter.weight
    })
  }

  // ----------------------------------
  // 6. RESIZE
  // ----------------------------------

  function handleResize() {
    clearTimeout(resizeTimeout)

    resizeTimeout = setTimeout(() => {
      // Refresh the layout before rebuilding physics after 200ms
      ScrollTrigger.refresh()
      createProjectPhysics()
    }, 200)
  }

  window.addEventListener("resize", handleResize)

  // ----------------------------------
  // 7. INITIALISATION
  // ----------------------------------

  createProjectPhysics(initialLetterLayout)

  // ----------------------------------
  // 8. RETURN
  // ----------------------------------
  // Controls used by setupProjects()

  return {
    start: startProjectPhysics,
    settleAndStop: settleAndStopProjectPhysics,
    setScrollVelocity,
  }
}
