import { glMatrix, mat4, vec3 } from 'gl-matrix';

const _matrix = mat4.create();
const _up = vec3.fromValues(0, 1, 0);

class Camera {
  constructor({ device, aspect = 1, fov = 75, near = 0.1, far = 1000 }) {
    this.device = device;
    this.buffer = device.createBuffer({
      size: _matrix.byteLength,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
    });
    this.aspect = aspect;
    this.fov = fov;
    this.near = near;
    this.far = far;

    this.position = vec3.create();
    this.target = vec3.create();

    this.projection = mat4.create();
    this.view = mat4.create();
  }

  updateBuffer() {
    const { device, buffer, projection, view } = this;
    mat4.multiply(_matrix, projection, view);
    device.queue.writeBuffer(buffer, 0, _matrix);
  }

  updateProjection() {
    const { projection, aspect, fov, near, far } = this;
    mat4.perspective(projection, glMatrix.toRadian(fov), aspect, near, far);
    this.updateBuffer();
  }

  updateView() {
    const { view, position, target } = this;
    mat4.lookAt(view, position, target, _up);
    this.updateBuffer();
  }
}

export default Camera;
