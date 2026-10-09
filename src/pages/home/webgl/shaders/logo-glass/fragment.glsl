// -------------------------------------------------------
// Global
// -------------------------------------------------------
uniform float uOpacity;
uniform float uTime;

uniform sampler2D uSceneTexture;

// -------------------------------------------------------
// Hover / reveal
// -------------------------------------------------------
uniform float uHoverProgress;

uniform float uNoiseScale;
uniform float uNoiseSpeed;
uniform float uRevealEdge;
uniform float uFresnelPower;

// -------------------------------------------------------
// Click ripple
// -------------------------------------------------------
uniform float uClickProgress;
uniform vec3 uClickPosition;
uniform float uClickTime;

uniform float uClickRadius;
uniform float uClickWaveFrequency;
uniform float uClickWaveSpeed;
uniform float uClickRippleStrength;
uniform float uClickGlowStrength;
uniform float uClickRippleNoise;

// -------------------------------------------------------
// Refraction / chromatic
// -------------------------------------------------------
uniform float uDistortionStrength;
uniform float uChromaticAberration;

// -------------------------------------------------------
// Varyings
// -------------------------------------------------------
varying vec3 vNormal;
varying vec3 vPosition;
varying vec4 vScreenPosition;

#include ../../../../../shared/shaders/noise.glsl;

void main() {
    // -------------------------------------------------------
    // View / Fresnel
    // -------------------------------------------------------
    vec3 normal = normalize(vNormal);
    vec3 viewDirection = normalize(cameraPosition - vPosition);

    float facing = abs(dot(normal, viewDirection));

    float fresnel = pow(
    1.0 - clamp(facing, 0.0, 1.0),
    uFresnelPower
    );

    // -------------------------------------------------------
    // Hover reveal noise
    // -------------------------------------------------------
    // Noise
    float organicNoise = noise(vPosition * uNoiseScale + vec3(0.0, uTime * uNoiseSpeed, 0.0));

    // Reveal
    float reveal = smoothstep(
        1.0 - uHoverProgress,
        1.0 - uHoverProgress + uRevealEdge,
        organicNoise
    );
    
    // -------------------------------------------------------
    // Click ripple
    // -------------------------------------------------------
    float distanceToClick = distance(vPosition, uClickPosition);

    float clickMask = 1.0 - smoothstep(0.0, uClickRadius, distanceToClick);

    float clickElapsedTime = uTime - uClickTime;

    float rippleNoise = noise(
    vPosition * uNoiseScale * 8.0
    + vec3(0.0, uTime * 0.35, 4.2)
    );

    rippleNoise = (rippleNoise - 0.5) * uClickRippleNoise;

    float warpedDistance = distanceToClick + rippleNoise;

    float clickRipple = sin(
        (warpedDistance * uClickWaveFrequency)
        -
        (clickElapsedTime * uClickWaveSpeed)
    );

    float clickWave = 
    clickRipple 
    * clickMask 
    * uClickProgress 
    * uHoverProgress;

    // Luminous ripple
    float rippleShape = abs(clickRipple);
    float rippleLine = smoothstep(0.99, 1.0, rippleShape);
    float rippleHalo = smoothstep(0.90, 1.0, rippleShape);

    // -------------------------------------------------------
    // Screen UV
    // -------------------------------------------------------
    vec2 screenUv = vScreenPosition.xy / vScreenPosition.w;
    screenUv = screenUv * 0.5 + 0.5;

    // -------------------------------------------------------
    // Refraction / Distortion
    // -------------------------------------------------------
    float distortionNoiseX = noise(
        vPosition * uNoiseScale + vec3(uTime * uNoiseSpeed, 0.0, 0.0)
    );
    float distortionNoiseY = noise(
        vPosition * uNoiseScale + vec3(12.4,uTime * uNoiseSpeed, 7.8)
    );

    vec2 baseDistortionDirection = vec2(
        distortionNoiseX - 0.5,
        distortionNoiseY - 0.5
    );

    // Click Distortion
    vec2 clickWaveDirection = normalize(
        baseDistortionDirection + vec2(0.0001)
    );

    vec2 clickDistortion = clickWaveDirection * clickWave * uClickRippleStrength;

    vec2 baseDistortion =
        baseDistortionDirection
        * uDistortionStrength
        * reveal
        * uHoverProgress;

    vec2 distortion = baseDistortion + clickDistortion;

    vec2 distortedScreenUv = screenUv + distortion;

    // -------------------------------------------------------
    // Chromatic aberration
    // -------------------------------------------------------
    vec2 chromaticDirection = normalize(distortion + vec2(0.0001));

    float clickChromaticBoost = 1.0 + rippleHalo * clickMask * uClickProgress * 2.0;

    vec2 chromaticOffset = chromaticDirection * uChromaticAberration * clickChromaticBoost * reveal * uHoverProgress;

    float red = texture2D(uSceneTexture, distortedScreenUv + chromaticOffset).r;
    float green = texture2D(uSceneTexture, distortedScreenUv).g;
    float blue = texture2D(uSceneTexture, distortedScreenUv - chromaticOffset).b;

    vec3 sceneColor = vec3(red, green, blue);
    
    // -------------------------------------------------------
    // Ripple glow
    // -------------------------------------------------------
    vec3 rippleGlowColor = vec3(0.80, 0.95, 1.0);

    float rippleGlow = (rippleLine * 0.80 + rippleHalo * 0.15)
    * clickMask
    * uClickProgress
    * uHoverProgress
    * uClickGlowStrength;

    // -------------------------------------------------------
    // Tint / Final color
    // -------------------------------------------------------
    vec3 glassTint = vec3(0.90, 0.95, 1);

    float tintStrength = mix(0.12, 0.28, fresnel);
    
    vec3 finalColor = mix(sceneColor, glassTint, tintStrength);
    finalColor += rippleGlowColor * rippleGlow;

    // Alpha
    float alpha = reveal * uHoverProgress * uOpacity;


    gl_FragColor = vec4(finalColor, alpha);
    
}   
