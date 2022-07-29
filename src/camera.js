import { glMatrix, mat4, vec3 } from 'gl-matrix';

const _offset = vec3.create();
const _up = vec3.fromValues(0, 1, 0);

class Camera {
  constructor({ device, aspect = 1, fov = 75, near = 0.1, far = 1000 }) {
    this.device = device;
    this.buffer = device.createBuffer({
      size: 39 * Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
    });
    this.aspect = aspect;
    this.fov = fov;
    this.near = near;
    this.far = far;

    this.projectionMatrix = mat4.create();
    this.viewBuffer = new Float32Array(22);
    this.viewMatrix = this.viewBuffer.subarray(0, 16);
    this.position = this.viewBuffer.subarray(16, 19);
    this.direction = this.viewBuffer.subarray(19, 22);
    this.target = vec3.create();
  }

  setOrbit(phi, theta, radius) {
    const { position, target } = this;
    const sinPhiRadius = Math.sin(phi) * radius;
    vec3.add(
      position,
      target,
      vec3.set(
        _offset,
        sinPhiRadius * Math.sin(theta),
        Math.cos(phi) * radius,
        sinPhiRadius * Math.cos(theta)
      )
    );
    this.updateView();
  }

  updateProjection() {
    const { device, buffer, projectionMatrix, aspect, fov, near, far } = this;
    mat4.perspective(projectionMatrix, glMatrix.toRadian(fov), aspect, near, far);
    device.queue.writeBuffer(buffer, 0, projectionMatrix);
  }

  updateView() {
    const { device, buffer, viewBuffer, direction, position, target, viewMatrix } = this;
    mat4.lookAt(viewMatrix, position, target, _up);
    vec3.normalize(direction, vec3.sub(direction, target, position));
    device.queue.writeBuffer(buffer, 64, viewBuffer);
  }
}

export default Camera;
