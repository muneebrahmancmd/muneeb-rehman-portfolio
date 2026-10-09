// ----------------------
// Shared
// ----------------------
uniform sampler2D uLogoTexture;
uniform float uTime;

uniform vec3 uCreamColor;
uniform vec3 uDarkColor;

varying vec2 vUv;

// ----------------------
// Logo layout
// ----------------------
uniform vec2 uResolution;
uniform vec2 uLogoSize;

// ----------------------
// Logo loading and cutout
// ----------------------
uniform float uLoadProgress;
uniform float uLogoCutoutProgress;

uniform float uNoiseScale;
uniform float uNoiseStrength;
uniform float uNoiseSpeedX;
uniform float uNoiseSpeedY;

// ----------------------
// Fullscreen hero reveal
// ----------------------
uniform float uHeroRevealProgress;

uniform float uHeroNoiseScale;
uniform float uHeroNoiseStrength;
uniform float uHeroNoiseSpeedX;
uniform float uHeroNoiseSpeedY;

#include ../../../../shared/shaders/noise.glsl;

float getNoisyReveal(
    vec2 uv,
    float progress,
    float noiseScale,
    float noiseStrength,
    float noiseSpeedX,
    float noiseSpeedY
) {
    // ----------------------
    // 1. Reveal position
    // ----------------------
    float frontPadding =
        noiseStrength * 0.5 + 0.02;

    float frontStart = -frontPadding;
    float frontEnd = 1.0 + frontPadding;

    float frontPosition = mix(
        frontStart,
        frontEnd,
        progress
    );

    // ----------------------
    // 2. Noise deformation
    // ----------------------
    float noiseValue = noise(
        vec3(
            uv.x * noiseScale - uTime * noiseSpeedX,
            uTime * noiseSpeedY,
            0.0
        )
    );

    float centeredNoise = noiseValue - 0.5;

    float noisyFront =
        frontPosition
        + centeredNoise
        * noiseStrength;

    // ----------------------
    // 3. Antialiased mask
    // ----------------------
    float signedDistance =
        uv.y - noisyFront;

    float antiAliasWidth = fwidth(signedDistance);

    return 1.0 - smoothstep(
        -antiAliasWidth,
        antiAliasWidth,
        signedDistance
    );
}

void main() {
    // ----------------------
    // 1. Logo mask
    // ----------------------
    vec2 centeredPosition =
        (vUv - 0.5) * uResolution;

    vec2 logoUv =
        centeredPosition / uLogoSize + 0.5;

    float insideLogoBounds =
        step(0.0, logoUv.x)
        * step(logoUv.x, 1.0)
        * step(0.0, logoUv.y)
        * step(logoUv.y, 1.0);

    float logoMask =
        texture2D(uLogoTexture, logoUv).a
        * insideLogoBounds;

    // ----------------------
    // 2. Logo loading fill
    // ----------------------
    float logoFill =
        getNoisyReveal(
            logoUv,
            uLoadProgress,
            uNoiseScale,
            uNoiseStrength,
            uNoiseSpeedX,
            uNoiseSpeedY
        );

    float filledLogoMask =
        logoMask * logoFill;

    vec3 finalColor = mix(
        uCreamColor,
        uDarkColor,
        filledLogoMask
    );

    // ----------------------
    // 3. Logo cutout
    // ----------------------
    float logoCutoutAlpha =
        1.0
        - logoMask
        * uLogoCutoutProgress;

    // ----------------------
    // 4. Fullscreen hero reveal
    // ----------------------
    vec2 heroRevealUv = vec2(
        vUv.x,
        1.0 - vUv.y
    );

    float heroRevealMask =
        getNoisyReveal(
            heroRevealUv,
            uHeroRevealProgress,
            uHeroNoiseScale,
            uHeroNoiseStrength,
            uHeroNoiseSpeedX,
            uHeroNoiseSpeedY
        );

    // ----------------------
    // 5. Final composition
    // ----------------------
    float finalAlpha =
        logoCutoutAlpha
        * (1.0 - heroRevealMask);

    gl_FragColor = vec4(
        finalColor,
        finalAlpha
    );

    #include <colorspace_fragment>

    // Match the premultiplied-alpha format expected by the canvas compositor.
    gl_FragColor.rgb *= gl_FragColor.a;
}
