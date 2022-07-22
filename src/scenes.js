import { vec3 } from 'gl-matrix';

const _offset = vec3.fromValues(0, 0, 0);
const Orbit = (delta, time, renderer, volume) => {
  const angle = time * 0.25;
  const distance = volume.width * 0.7;
  vec3.add(
    renderer.camera.position,
    renderer.camera.target,
    vec3.set(
      _offset,
      Math.sin(angle) * distance, 0, Math.cos(angle) * distance
    )
  );
  renderer.camera.updateView();
};

const SceneA = {
  onAnimation: Orbit,
  onLoad: (renderer) => renderer.setClearColor(0.7, 0.6, 0.2),
  source: `
  fn distanceToScene(pos : vec3<f32>) -> f32 {
    var origin : vec3<f32> = pos - volume.center;
    var size : f32 = volume.size.x * 0.3;
    var t : f32 = sin(time);
    return opSmoothUnion(
      sdSphere(origin - vec3<f32>(size * (0.6 * t * -1), 0, 0), size),
      sdSphere(origin - vec3<f32>(size * (0.6 * t), 0, 0), size),
      6
    );
  }
  fn getValueAt(pos : vec3<f32>) -> u32 {
    if (distanceToScene(pos) > 0.01) {
      return 0;
    }
    return 1 + u32(abs(simplexNoise3(pos * 0.01)) * 254.0);
  }
  `,
};

const SceneB = {
  onAnimation: Orbit,
  onLoad: (renderer) => renderer.setClearColor(0.1, 0.3, 0.6),
  source: `
  fn distanceToScene(pos : vec3<f32>) -> f32 {
    var origin : vec3<f32> = pos - volume.center;
    var r : mat3x3<f32> = rotateX(PI * -0.5);
    return opUnion(
      sdTorus(
        r * origin,
        vec2<f32>(volume.size.x * 0.3, volume.size.x * 0.1)
      ),
      sdTorus(
        r * rotateY(time) * origin,
        vec2<f32>(volume.size.x * 0.1, volume.size.x * (0.02 + sin(time * 10) * 0.01))
      )
    );
  }
  fn getValueAt(pos : vec3<f32>) -> u32 {
    if (distanceToScene(pos) > 0.01) {
      return 0;
    }
    return 1 + u32(abs(simplexNoise3(pos * 0.01)) * 254.0);
  }
  `,
};

const SceneC = {
  onAnimation: Orbit,
  onLoad: (renderer) => renderer.setClearColor(0.1, 0.2, 0.4),
  source: `
  fn getValueAt(pos : vec3<f32>) -> u32 {
    var p : vec3<f32> = pos + vec3<f32>(0, 0, time * 100);
    var h : f32 = abs(simplexNoise3(p * 0.01)) * volume.size.y;
    if (pos.y > h) {
      return 0;
    }
    return 1 + u32(abs(simplexNoise3(p * -0.001)) * 254.0);
  }
  `,
};

const SceneD = {
  onAnimation: Orbit,
  onLoad: (renderer) => renderer.setClearColor(0, 0, 0),
  source: `
  fn distanceToScene(pos : vec3<f32>) -> f32 {
    if (sdSphere(pos - volume.center, volume.size.x * 0.35) > 0.01) {
      return 1;
    }
    var id : f32 = noise3(floor(pos / 32));
    var p : vec3<f32> = (pos % 32) - 16;
    var t : f32 = sin((time + id) * 4);
    var d : f32;
    if (floor(id * 10) % 2 == 0) {
      d = sdSphere(p, t * 4 + 8);
    } else {
      d = sdBox(p, vec3<f32>(t * 4 + 8));
    }
    return opSmoothSubstraction(
      opSmoothSubstraction(
        d,
        sdBox(p, vec3<f32>(4, 4, 12)),
        1
      ),
      sdBox(p, vec3<f32>(12, 4, 4)),
      1
    );
  }
  fn getValueAt(pos : vec3<f32>) -> u32 {
    if (distanceToScene(pos) > 0.01) {
      return 0;
    }
    return 1 + u32(abs(simplexNoise3(floor(pos / 32))) * 254.0);
  }
  `,
};

export default [SceneA, SceneB, SceneC, SceneD];
