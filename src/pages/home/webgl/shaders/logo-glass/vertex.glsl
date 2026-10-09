uniform float uSurfaceOffset;

varying vec3 vNormal;
varying vec3 vPosition;
varying vec4 vScreenPosition;

void main() {
    vec3 displacedPosition = position + normal * uSurfaceOffset;
    
    vec4 modelPosition = modelMatrix * vec4(displacedPosition, 1.0);
    vec4 viewPosition = viewMatrix * modelPosition;
    vec4 projectedPosition = projectionMatrix * viewPosition;

    gl_Position = projectedPosition;

    vNormal = normalize(normal);
    vPosition = modelPosition.xyz;
    vScreenPosition = projectedPosition;
} 