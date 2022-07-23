import { glMatrix, mat3, mat4, vec3 } from 'gl-matrix';

const _up = vec3.fromValues(0, 1, 0);
const _matrix = mat4.create();

class Camera {
  constructor({ device, aspect = 1, fov = 75, near = 0.1, far = 1000 }) {
    this.device = device;
    this.buffer = device.createBuffer({
      size: (16 + 16 + 9) * Float32Array.BYTES_PER_ELEMENT + 12,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
    });
    this.aspect = aspect;
    this.fov = fov;
    this.near = near;
    this.far = far;

    this.position = vec3.create();
    this.target = vec3.create();

    this.projectionMatrix = mat4.create();
    this.viewBuffer = new Float32Array(25);
    this.viewMatrix = this.viewBuffer.subarray(0, 16);
    this.normalMatrix = this.viewBuffer.subarray(16, 25);
  }

  updateProjection() {
    const { device, buffer, projectionMatrix, aspect, fov, near, far } = this;
    mat4.perspective(projectionMatrix, glMatrix.toRadian(fov), aspect, near, far);
    device.queue.writeBuffer(buffer, 0, projectionMatrix);
  }

  updateView() {
    const { device, buffer, viewBuffer, viewMatrix, normalMatrix, position, target } = this;
    mat4.lookAt(viewMatrix, position, target, _up);
    mat3.normalFromMat4(normalMatrix, mat4.invert(_matrix, viewMatrix));
    device.queue.writeBuffer(buffer, 64, viewBuffer);
  }
}

export default Camera;
