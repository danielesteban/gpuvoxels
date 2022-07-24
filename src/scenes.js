import { WebIO } from '@gltf-transform/core';
import { vec2, vec3 } from 'gl-matrix';

const loadGeometry = (model, volume) => (
  new Promise((resolve) => {
    const io = new WebIO();
    if (typeof model === 'string') {
      resolve(io.read(model));
      return;
    }
    const reader = new FileReader();
    reader.addEventListener('load', () => (
      resolve(io.readBinary(new Uint8Array(reader.result)))
    ), false);
    reader.readAsArrayBuffer(model);
  })
    .then((document) => {
      const geometry = document.getRoot().listMeshes()[0].listPrimitives()[0];
      const firstAttribute = geometry.listAttributes()[0];
      const indices = new Uint32Array(geometry.getIndices().getArray());
      const vertices = new Float32Array(firstAttribute.getArray());
      const min = firstAttribute.getMin(vec3.create());
      const max = firstAttribute.getMax(vec3.create());
      const size = vec3.sub(vec3.create(), max, min);
      const scale = (
        Math.min(volume.width, volume.height, volume.depth)
        / Math.max(size[0], size[1], size[2])
      );
      return {
        indices,
        vertices,
        position: vec3.fromValues(volume.width * 0.5, volume.height * 0.5, volume.depth * 0.5),
        scale: vec3.fromValues(scale, scale, scale),
        source: `
        fn getValueAt(pos : vec3<f32>) -> f32 {
          return 1 + (pos.y / ${volume.height}) * 254;
        }
        `,
      };
    })
);

const GeometryScene = (model, volume, scene) => {
  scene.loading = true;
  loadGeometry(`/models/${model}.glb`, volume)
    .then((geometry) => {
      scene.geometry = geometry;
      delete scene.loading;
    });
  return scene;
};

const _epsilon = 0.000001;
const _offset = vec3.fromValues(0, 0, 0);
const _state = vec2.fromValues(Math.PI * 0.5, 0);
const _target = vec2.fromValues(Math.PI * 0.5, 0);
const damp = (x, y, lambda, dt) => (
  vec2.lerp(x, x, y, 1 - Math.exp(-lambda * dt))
);
const Orbit = (delta, time, input, renderer, volume) => {
  if (input.pointer.isDown) {
    _target[1] += input.look[0];
    _target[0] = Math.max(_epsilon, Math.min(Math.PI - _epsilon, _target[0] + input.look[1]));
  } else {
    _target[1] += delta * 0.2;
  }
  damp(_state, _target, 10, delta);
  const radius = volume.width * 0.75;
  const sinPhiRadius = Math.sin(_state[0]) * radius;
  vec3.add(
    renderer.camera.position,
    renderer.camera.target,
    vec3.set(
      _offset,
      sinPhiRadius * Math.sin(_state[1]),
      Math.cos(_state[0]) * radius,
      sinPhiRadius * Math.cos(_state[1])
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
    var t : f32 = sin(time * 2);
    var size : f32 = volume.size.x * (0.25 + t * 0.01);
    return opSmoothUnion(
      sdSphere(origin - vec3<f32>(size * (0.6 * t * -1), size * 0.2 * t * -1, 0), size),
      sdSphere(origin - vec3<f32>(size * (0.6 * t), size * 0.2 * t, 0), size),
      100
    );
  }
  fn getValueAt(pos : vec3<f32>) -> f32 {
    if (distanceToScene(pos) > 0.01) {
      return 0;
    }
    return 1 + abs(simplexNoise3(pos * 0.01)) * 254;
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
  fn getValueAt(pos : vec3<f32>) -> f32 {
    if (distanceToScene(pos) > 0.01) {
      return 0;
    }
    return 1 + abs(simplexNoise3(pos * 0.01)) * 254;
  }
  `,
};

const SceneC = {
  onAnimation: Orbit,
  onLoad: (renderer) => renderer.setClearColor(0.1, 0.2, 0.4),
  source: `
  fn getValueAt(pos : vec3<f32>) -> f32 {
    var p : vec3<f32> = pos + vec3<f32>(0, 0, round(time * 100));
    var h : f32 = abs(simplexNoise3(p * 0.01)) * volume.size.y;
    if (pos.y > h) {
      return 0;
    }
    return 1 + abs(simplexNoise3(p * -0.001)) * 254;
  }
  `,
};

const SceneD = {
  onAnimation: Orbit,
  onLoad: (renderer) => renderer.setClearColor(0.1, 0.1, 0.1),
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
  fn getValueAt(pos : vec3<f32>) -> f32 {
    if (distanceToScene(pos) > 0.01) {
      return 0;
    }
    return 1 + abs(simplexNoise3(floor(pos / 32))) * 254;
  }
  `,
};

export default (volume, onDrop) => {
  window.addEventListener('dragenter', (e) => e.preventDefault(), false);
  window.addEventListener('dragover', (e) => e.preventDefault(), false);
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    const [file] = e.dataTransfer.files;
    if (!file) {
      return;
    }
    loadGeometry(file, volume)
      .then((geometry) => onDrop({
        onAnimation: Orbit,
        onLoad: (renderer) => renderer.setClearColor(0.1, 0.1, 0.1),
        geometry,
        maxFPS: 0,
      }));
  }, false);

  const Suzanne = GeometryScene('suzanne', volume, {
    onAnimation: Orbit,
    onLoad: (renderer) => renderer.setClearColor(0.1, 0.1, 0.1),
    maxFPS: 0,
  });

  return [SceneA, SceneB, Suzanne, SceneC, SceneD];
};
