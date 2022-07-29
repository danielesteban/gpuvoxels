import Mesher from './mesher.js';
import GeometryVoxelizer from './voxelizers/geometry.js';
import SDFVoxelizer from './voxelizers/sdf.js';

class Chunk {
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

  static createVoxelsBuffer({ device, chunkSize }) {
    return device.createBuffer({
      size: chunkSize * chunkSize * chunkSize * Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE,
    });
  }
}

class Volume {
  constructor({
    chunkSize = 100,
    device,
    time,
    width,
    height,
    depth,
  }) {
    this.chunkSize = chunkSize;
    this.device = device;
    this.time = time;
    this.width = width;
    this.height = height;
    this.depth = depth;

    const chunks = {
      x: Math.ceil(width / chunkSize),
      y: Math.ceil(height / chunkSize),
      z: Math.ceil(depth / chunkSize),
    };
    this.chunks = [];
    for (let z = 0; z < chunks.z; z++) {
      for (let y = 0; y < chunks.y; y++) {
        for (let x = 0; x < chunks.x; x++) {
          this.chunks.push(new Chunk({
            device,
            chunk: { x, y, z },
            chunkSize,
          }));
        }
      }
    }
    this.edge = Chunk.createVoxelsBuffer({ device, chunkSize });
    this.mesher = new Mesher({ chunks, volume: this });
  }

  compute(command) {
    const { mesher, voxelizer } = this;
    voxelizer.compute(command);
    mesher.compute(command);
  }

  destroy() {
    const { chunks, edge, voxelizer } = this;
    chunks.forEach((chunk) => chunk.destroy());
    edge.destroy();
    if (voxelizer && voxelizer.destroy) {
      voxelizer.destroy();
    }
  }

  setScene(scene) {
    const { voxelizer } = this;
    if (voxelizer && voxelizer.destroy) {
      voxelizer.destroy();
    }
    if (scene.geometry) {
      this.voxelizer = new GeometryVoxelizer({ geometry: scene.geometry, volume: this });
    } else if (scene.source) {
      this.voxelizer = new SDFVoxelizer({ source: scene.source, volume: this });
    }
  }
}

export default Volume;
