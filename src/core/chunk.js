class Chunk {
  static createVoxelsBuffer({ device, chunkSize }) {
    return device.createBuffer({
      size: chunkSize * chunkSize * chunkSize * Uint32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.STORAGE,
    });
  }

  constructor({ device, chunk, chunkSize }) {
    this.chunk = chunk;

    this.faces = device.createBuffer({
      mappedAtCreation: true,
      size: (
        // Indirect drawing buffer
        4 * Uint32Array.BYTES_PER_ELEMENT
        + (
          // Worst-case scenario
          Math.ceil(chunkSize * chunkSize * chunkSize * 0.5)
        ) * 6 * 4 * Float32Array.BYTES_PER_ELEMENT
      ),
      usage: (
        GPUBufferUsage.COPY_DST
        | GPUBufferUsage.INDIRECT
        | GPUBufferUsage.STORAGE
        | GPUBufferUsage.VERTEX
      ),
    });
    new Uint32Array(this.faces.getMappedRange())[0] = 6;
    this.faces.unmap();

    this.position = device.createBuffer({
      mappedAtCreation: true,
      size: 3 * Int32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.UNIFORM,
    });
    new Int32Array(this.position.getMappedRange()).set([
      chunk.x * chunkSize,
      chunk.y * chunkSize,
      chunk.z * chunkSize,
    ]);
    this.position.unmap();

    this.voxels = Chunk.createVoxelsBuffer({ device, chunkSize });
  }

  destroy() {
    const { faces, position, voxels } = this;
    faces.destroy();
    position.destroy();
    voxels.destroy();
  }

  resetInstanceCount(command) {
    const { faces } = this;
    command.clearBuffer(faces, 4, 4);
  }
}

export default Chunk;
