import { glMatrix, mat3, mat4, vec3 } from 'gl-matrix';

const _up = vec3.fromValues(0, 1, 0);
const _matrix = mat4.create();

class Camera {
  constructor({ device, aspect = 1, fov = 75, near = 0.1, far = 1000 }) {
    this.device = device;
    this.buffer = device.createBuffer({
      size: 16 * 3 * Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
    });
    this.aspect = aspect;
    this.fov = fov;
    this.near = near;
    this.far = far;

    this.position = vec3.create();
    this.target = vec3.create();

    this.normal = mat3.create();
    this.view = mat4.create();
    this.projection = mat4.create();
  }

  updateProjection() {
    const { device, buffer, projection, aspect, fov, near, far } = this;
    mat4.perspective(projection, glMatrix.toRadian(fov), aspect, near, far);
    device.queue.writeBuffer(buffer, 0, projection);
  }

  updateView() {
    const { device, buffer, view, normal, position, target } = this;
    mat4.lookAt(view, position, target, _up);
    mat3.normalFromMat4(normal, mat4.invert(_matrix, view));
    device.queue.writeBuffer(buffer, 64, view);
    device.queue.writeBuffer(buffer, 64 * 2, normal);
  }
}

export default Camera;
