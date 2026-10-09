uniform float uProgress;
uniform float uTime;
uniform vec3 uCreamColor;

uniform float uNoiseScale;
uniform float uNoiseStrength;
uniform float uNoiseSpeedX;
uniform float uNoiseSpeedY;

varying vec2 vUv;

#include ../../../../../shared/shaders/noise.glsl;

void main() {
    // ----------------------
    // 1. Settings
    // ----------------------
    float pi = 3.14159265;

    float frontStart = -0.08;
    float frontEnd = 1.08;

    // ----------------------
    // 2. Base front position
    // ----------------------
    float frontPosition = mix(
        frontStart,
        frontEnd,
        uProgress
    );

    // ----------------------
    // 3. Noise deformation
    // ----------------------
    float horizontalOffset =
        uTime * uNoiseSpeedX;

    float verticalVariation =
        uTime * uNoiseSpeedY;

    float noiseValue = noise(
        vec3(
            vUv.x * uNoiseScale - horizontalOffset,
            verticalVariation,
            0.0
        )
    );

    float centeredNoise =
        noiseValue - 0.5;

    float noiseEnvelope = sin(
        uProgress * pi
    );

    float noisyFront =
        frontPosition
        + centeredNoise
        * uNoiseStrength
        * noiseEnvelope;

    // ----------------------
    // 4. Reveal mask
    // ----------------------
    float signedDistance =
        vUv.y - noisyFront;

    float antiAliasWidth =
        fwidth(signedDistance);

    float reveal = 1.0 - smoothstep(
        -antiAliasWidth,
        antiAliasWidth,
        signedDistance
    );

    // ----------------------
    // 5. Final composition
    // ----------------------
    gl_FragColor = vec4(
        uCreamColor,
        reveal
    );

    #include <colorspace_fragment>
}
