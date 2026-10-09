precision highp float;

uniform sampler2D uEnvironment;
uniform sampler2D uSphere;
uniform sampler2D uText;
uniform vec2 uContentViewportOffset;
uniform vec2 uContentViewportScale;
uniform vec2 uResolution;
uniform vec4 uFrameBounds;
uniform float uFrameRadius;
uniform float uEnvironmentOpacity;

uniform float uTime;
uniform float uIdleSpeed;
uniform float uSphereIdleStrength;
uniform vec2 uIdleFrequency;

uniform vec2 uMouse;
uniform vec2 uVelocity;
uniform float uStrength;
uniform float uRadius;
uniform float uInteractionStrength;

varying vec2 vUv;

float roundedFrameMask(vec2 point) {
  vec2 halfSize = uFrameBounds.zw * 0.5;
  float radius = min(uFrameRadius, min(halfSize.x, halfSize.y));
  vec2 center = uFrameBounds.xy + halfSize;
  vec2 localPoint = abs(point - center) - (halfSize - vec2(radius));
  float distanceToFrame =
    length(max(localPoint, 0.0)) +
    min(max(localPoint.x, localPoint.y), 0.0) -
    radius;
  float edgeWidth = max(fwidth(distanceToFrame), 0.0001);

  return 1.0 - smoothstep(-edgeWidth, edgeWidth, distanceToFrame);
}

vec2 contentUv(vec2 screenUv) {
  return
    uContentViewportOffset +
    screenUv * uContentViewportScale;
}

float contentBoundsMask(vec2 uv) {
  vec2 edgeWidth = max(fwidth(uv), vec2(0.000001));
  vec2 lowerBoundsMask =
    smoothstep(-edgeWidth, vec2(0.0), uv);
  vec2 upperBoundsMask =
    1.0 -
    smoothstep(
      vec2(1.0),
      vec2(1.0) + edgeWidth,
      uv
    );

  return
    lowerBoundsMask.x *
    lowerBoundsMask.y *
    upperBoundsMask.x *
    upperBoundsMask.y;
}

void main() {
  vec2 uv = vUv;
  float time = uTime * uIdleSpeed;

  vec2 idleFlow = vec2(
    sin(uv.y * uIdleFrequency.x + time) +
      sin(uv.x * 1.7 - time * 0.63) * 0.5,
    cos(uv.x * uIdleFrequency.y - time * 0.7) +
      cos(uv.y * 1.5 + time * 0.47) * 0.5
  ) / 1.5;

  vec2 mouseDelta = uv - uMouse;
  mouseDelta.x *= uResolution.x / uResolution.y;

  float mouseInfluence = smoothstep(uRadius, 0.0, length(mouseDelta));
  vec2 mouseOffset =
    uVelocity * mouseInfluence * uStrength * uInteractionStrength;
  vec2 pointerUv = uv - mouseOffset;
  vec2 sphereScreenUv =
    pointerUv + idleFlow * uSphereIdleStrength;

  vec2 textUv = contentUv(pointerUv);
  vec2 sphereUv = contentUv(sphereScreenUv);
  float textBoundsMask = contentBoundsMask(textUv);
  float sphereBoundsMask = contentBoundsMask(sphereUv);
  vec2 environmentUv = clamp(pointerUv, 0.0, 1.0);
  vec2 textSampleUv = clamp(textUv, 0.0, 1.0);
  vec2 sphereSampleUv = clamp(sphereUv, 0.0, 1.0);

  vec4 environmentColor = texture2D(uEnvironment, environmentUv);
  vec4 sphereColor =
    texture2D(uSphere, sphereSampleUv) * sphereBoundsMask;
  vec4 textColor =
    texture2D(uText, textSampleUv) * textBoundsMask;

  float frameMask = roundedFrameMask(vUv * uResolution);

  environmentColor *= frameMask * uEnvironmentOpacity;

  vec4 sphereComposite =
    sphereColor +
    environmentColor * (1.0 - sphereColor.a);
  vec4 finalColor =
    textColor +
    sphereComposite * (1.0 - textColor.a);

  if (finalColor.a > 0.0) {
    finalColor.rgb /= finalColor.a;
  } else {
    finalColor.rgb = vec3(0.0);
  }

  gl_FragColor = finalColor;

  #include <colorspace_fragment>

  gl_FragColor.rgb *= gl_FragColor.a;
}
