import Noise from '../lib/noise.wgsl';
import Rotation from '../lib/rotation.wgsl';
import SDF from '../lib/sdf.wgsl';

const Voxel = ({ chunkSize }) => `
const chunkSize : i32 = ${chunkSize};

fn getVoxel(pos : vec3<i32>) -> u32 {
  return u32(pos.z * chunkSize * chunkSize + pos.y * chunkSize + pos.x);
}
`;

const Voxelizer = ({ chunkSize, width, height, depth, scene }) => `
@group(0) @binding(0) var<uniform> time : f32;
@group(0) @binding(1) var<uniform> chunk : vec3<i32>;
@group(0) @binding(2) var<storage, read_write> voxels : array<u32>;

${Noise}
${Rotation}
${SDF}
${Voxel({ chunkSize })}

struct Volume {
  center : vec3<f32>,
  size : vec3<f32>,
}

const volume : Volume = Volume(
  vec3<f32>(${width * 0.5}, ${height * 0.5}, ${depth * 0.5}),
  vec3<f32>(${width}, ${height}, ${depth})
);

${scene}

@compute @workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) GlobalInvocationID : vec3<u32>) {
  var pos : vec3<i32> = vec3<i32>(GlobalInvocationID.xyz);
  if (
    pos.x >= chunkSize || pos.y >= chunkSize || pos.z >= chunkSize
  ) {
    return;
  }
  voxels[getVoxel(pos)] = getValueAt(vec3<f32>(chunk + pos));
}
`;

const Mesher = ({ chunkSize }) => `
struct Faces {
  vertexCount : u32,
  instanceCount : atomic<u32>,
  firstVertex : u32,
  firstInstance : u32,
  data : array<f32>,
}

@group(0) @binding(0) var<uniform> chunk : vec3<i32>;
@group(0) @binding(1) var<storage, read_write> faces : Faces;
@group(0) @binding(2) var<storage, read> voxels : array<u32>;
@group(0) @binding(3) var<storage, read> voxels_north : array<u32>;
@group(0) @binding(4) var<storage, read> voxels_top : array<u32>;
@group(0) @binding(5) var<storage, read> voxels_bottom : array<u32>;
@group(0) @binding(6) var<storage, read> voxels_west : array<u32>;
@group(0) @binding(7) var<storage, read> voxels_east : array<u32>;
@group(0) @binding(8) var<storage, read> voxels_south : array<u32>;

${Voxel({ chunkSize })}

fn getValue(pos : vec3<i32>) -> u32 {
  if (pos.x == -1) {
    return voxels_west[getVoxel(vec3<i32>(chunkSize - 1, pos.y, pos.z))];
  }
  if (pos.x == chunkSize) {
    return voxels_east[getVoxel(vec3<i32>(0, pos.y, pos.z))];
  }
  if (pos.y == -1) {
    return voxels_bottom[getVoxel(vec3<i32>(pos.x, chunkSize - 1, pos.z))];
  }
  if (pos.y == chunkSize) {
    return voxels_top[getVoxel(vec3<i32>(pos.x, 0, pos.z))];
  }
  if (pos.z == -1) {
    return voxels_south[getVoxel(vec3<i32>(pos.x, pos.y, chunkSize - 1))];
  }
  if (pos.z == chunkSize) {
    return voxels_north[getVoxel(vec3<i32>(pos.x, pos.y, 0))];
  }
  return voxels[getVoxel(pos)]; 
}

fn pushFace(pos : vec3<i32>, face : u32, texture : u32) {
  var offset : u32 = atomicAdd(&(faces.instanceCount), 1) * 4;
  faces.data[offset] = f32(pos.x) + 0.5;
  faces.data[offset + 1] = f32(pos.y) + 0.5;
  faces.data[offset + 2] = f32(pos.z) + 0.5;
  faces.data[offset + 3] = f32(texture * 6 + face);
}

const faceNormals = array<vec3<i32>, 6>(
  vec3<i32>(0, 0, 1),
  vec3<i32>(0, 1, 0),
  vec3<i32>(0, -1, 0),
  vec3<i32>(-1, 0, 0),
  vec3<i32>(1, 0, 0),
  vec3<i32>(0, 0, -1),
);

@compute @workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) GlobalInvocationID : vec3<u32>) {
  var pos : vec3<i32> = vec3<i32>(GlobalInvocationID.xyz);
  if (
    pos.x >= chunkSize || pos.y >= chunkSize || pos.z >= chunkSize
  ) {
    return;
  }
  var value : u32 = voxels[getVoxel(pos)]; 
  if (value != 0) {
    for (var face : u32 = 0; face < 6; face++) {
      var npos : vec3<i32> = pos + faceNormals[face];
      if (getValue(npos) == 0) {
        pushFace(chunk + pos, face, value - 1);
      }
    }
  }
}
`;

const Chunk = (device, chunkSize, chunk) => {
  const faces = device.createBuffer({
    mappedAtCreation: true,
    size: (4 + Math.ceil((chunkSize * chunkSize * chunkSize) * 0.5) * 6 * 4) * Float32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.INDIRECT | GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX,
  });
  new Uint32Array(faces.getMappedRange())[0] = 6;
  faces.unmap();
  const position = device.createBuffer({
    mappedAtCreation: true,
    size: 3 * Int32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.UNIFORM,
  });
  new Int32Array(position.getMappedRange()).set([
    chunk.x * chunkSize,
    chunk.y * chunkSize,
    chunk.z * chunkSize,
  ]);
  position.unmap();
  return {
    chunk,
    position,
    faces,
    voxels: device.createBuffer({
      size: chunkSize * chunkSize * chunkSize * Uint32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.STORAGE,
    }),
    resetInstanceCount(command) {
      command.clearBuffer(faces, 4, 4);
    },
  };
};

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
    device,
    width,
    height,
    depth,
    chunkSize = 100,
  }) {
    this.chunkSize = chunkSize;
    this.device = device;
    this.width = width;
    this.height = height;
    this.depth = depth;
    this.time = Time(device);

    const chunks = {
      x: Math.ceil(width / chunkSize),
      y: Math.ceil(height / chunkSize),
      z: Math.ceil(depth / chunkSize),
    };
    this.chunks = [];
    for (let z = 0; z < chunks.z; z++) {
      for (let y = 0; y < chunks.y; y++) {
        for (let x = 0; x < chunks.x; x++) {
          this.chunks.push(Chunk(device, chunkSize, { x, y, z }));
        }
      }
    }
    this.edge = device.createBuffer({
      size: chunkSize * chunkSize * chunkSize * Uint32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.STORAGE,
    });
    const getNeighbor = (chunk, offset) => {
      const neighbor = { x: chunk.x + offset.x, y: chunk.y + offset.y, z: chunk.z + offset.z };
      if (
        neighbor.x < 0 || neighbor.x >= chunks.x
        || neighbor.y < 0 || neighbor.y >= chunks.y
        || neighbor.z < 0 || neighbor.z >= chunks.z
      ) {
        return this.edge;
      }
      const index = neighbor.z * chunks.x * chunks.y + neighbor.y * chunks.x + neighbor.x;
      return this.chunks[index].voxels;
    };
    const mesherPipeline = device.createComputePipeline({
      layout: 'auto',
      compute: {
        module: device.createShaderModule({
          code: Mesher({ chunkSize }),
        }),
        entryPoint: 'main',
      },
    });
    this.mesher = {
      bindings: this.chunks.map((chunk) => (
        device.createBindGroup({
          layout: mesherPipeline.getBindGroupLayout(0),
          entries: [
            chunk.position,
            chunk.faces,
            chunk.voxels,
            getNeighbor(chunk.chunk, { x: 0, y: 0, z: 1 }),
            getNeighbor(chunk.chunk, { x: 0, y: 1, z: 0 }),
            getNeighbor(chunk.chunk, { x: 0, y: -1, z: 0 }),
            getNeighbor(chunk.chunk, { x: -1, y: 0, z: 0 }),
            getNeighbor(chunk.chunk, { x: 1, y: 0, z: 0 }),
            getNeighbor(chunk.chunk, { x: 0, y: 0, z: -1 }),
          ].map((buffer, binding) => ({
            binding,
            resource: { buffer },
          })),
        })
      )),
      pipeline: mesherPipeline,
    };
  }

  compute(command, frameTime) {
    const {
      chunks,
      chunkSize,
      time,
      mesher,
      voxelizer,
    } = this;
    time.set(frameTime);
    chunks.forEach((chunk, index) => {
      const pass = command.beginComputePass();
      pass.setPipeline(voxelizer.pipeline);
      pass.setBindGroup(0, voxelizer.bindings[index]);
      pass.dispatchWorkgroups(Math.ceil(chunkSize / 4), Math.ceil(chunkSize / 4), Math.ceil(chunkSize / 4));
      pass.end();
    });
    chunks.forEach((chunk, index) => {
      chunk.resetInstanceCount(command);
      const pass = command.beginComputePass();
      pass.setPipeline(mesher.pipeline);
      pass.setBindGroup(0, mesher.bindings[index]);
      pass.dispatchWorkgroups(Math.ceil(chunkSize / 4), Math.ceil(chunkSize / 4), Math.ceil(chunkSize / 4));
      pass.end();
    });
  }

  destroy() {
    const { chunks, edge, time } = this;
    chunks.forEach(({ faces, position, voxels }) => {
      faces.destroy();
      position.destroy();
      voxels.destroy();
    });
    edge.destroy();
    time.buffer.destroy();
  }

  setScene(scene) {
    const {
      device,
      chunks,
      chunkSize,
      width, height, depth,
      time,
    } = this;
    const voxelizerPipeline = device.createComputePipeline({
      layout: 'auto',
      compute: {
        module: device.createShaderModule({
          code: Voxelizer({ chunkSize, width, height, depth, scene }),
        }),
        entryPoint: 'main',
      },
    });
    this.voxelizer = {
      bindings: chunks.map(({ position, voxels }) => (
        device.createBindGroup({
          layout: voxelizerPipeline.getBindGroupLayout(0),
          entries: [time.buffer, position, voxels].map((buffer, binding) => ({
            binding,
            resource: { buffer },
          })),
        })
      )),
      pipeline: voxelizerPipeline,
    };
  }
}

export default Volume;
