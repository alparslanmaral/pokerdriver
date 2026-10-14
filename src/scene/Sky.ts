import * as THREE from 'three';
import { WORLD } from '../config/trackConfig';

/** Gradient sky dome that follows the camera. */
export class Sky {
  readonly mesh: THREE.Mesh;

  constructor() {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        topColor: { value: new THREE.Color(WORLD.skyTop) },
        horizonColor: { value: new THREE.Color(WORLD.skyHorizon) },
        bottomColor: { value: new THREE.Color(WORLD.skyBottom) },
        sunDir: { value: new THREE.Vector3(...WORLD.sunDirection).normalize() },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 bottomColor;
        uniform vec3 sunDir;
        varying vec3 vDir;
        void main() {
          float h = vDir.y;
          vec3 col = h > 0.0
            ? mix(horizonColor, topColor, pow(clamp(h, 0.0, 1.0), 0.55))
            : mix(horizonColor, bottomColor, clamp(-h * 4.0, 0.0, 1.0));
          float sd = max(dot(normalize(vDir), sunDir), 0.0);
          col += vec3(1.0, 0.92, 0.7) * (pow(sd, 700.0) * 1.4 + pow(sd, 18.0) * 0.18);
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }
      `,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(2200, 24, 16), mat);
    this.mesh.renderOrder = -10;
    this.mesh.frustumCulled = false;
  }

  follow(cameraWorldPos: THREE.Vector3): void {
    this.mesh.position.copy(cameraWorldPos);
  }
}
