import Chunk from './chunk.js';
import Mesher from './mesher.js';
import Voxelizer from './voxelizer.js';

const Time = (device) => {
  const time = new Float32Array(1);
  return {
    buffer: device.createBuffer({
      size: time.byteLength,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
    }),
    set(value) {
      time[0] = value;
      device.queue.writeBuffer(this.buffer, 0, time);
    },
  };
};

class Volume {
  constructor({
    chunkSize = 100,
    device,
    width,
    height,
    depth,
  }) {
    this.chunkSize = chunkSize;
    this.device = device;
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
    this.time = Time(device);
  }

  compute(command, frameTime) {
    const { mesher, time, voxelizer } = this;
    time.set(frameTime);
    voxelizer.compute(command);
    mesher.compute(command);
  }

  destroy() {
    const { chunks, edge, time } = this;
    chunks.forEach((chunk) => chunk.destroy());
    edge.destroy();
    time.buffer.destroy();
  }

  setScene(scene) {
    this.voxelizer = new Voxelizer({ scene, volume: this });
  }
}

export default Volume;
