import Voxel from '../lib/voxel.js';

const Compute = ({ chunkSize }) => `
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

class Mesher {
  constructor({ chunks, volume }) {
    this.pipeline = volume.device.createComputePipeline({
      layout: 'auto',
      compute: {
        module: volume.device.createShaderModule({
          code: Compute({ chunkSize: volume.chunkSize }),
        }),
        entryPoint: 'main',
      },
    });
    const neighbor = { x: 0, y: 0, z: 0 };
    const getNeighbor = (chunk, offset) => {
      neighbor.x = chunk.x + offset.x;
      neighbor.y = chunk.y + offset.y;
      neighbor.z = chunk.z + offset.z;
      if (
        neighbor.x < 0 || neighbor.x >= chunks.x
        || neighbor.y < 0 || neighbor.y >= chunks.y
        || neighbor.z < 0 || neighbor.z >= chunks.z
      ) {
        return volume.edge;
      }
      const index = neighbor.z * chunks.x * chunks.y + neighbor.y * chunks.x + neighbor.x;
      return volume.chunks[index].voxels;
    };
    const neighbors = [
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 1, z: 0 },
      { x: 0, y: -1, z: 0 },
      { x: -1, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 0, z: -1 },
    ];
    this.bindings = volume.chunks.map((chunk) => ({
      bindings: volume.device.createBindGroup({
        layout: this.pipeline.getBindGroupLayout(0),
        entries: [
          chunk.position,
          chunk.faces,
          chunk.voxels,
          ...neighbors.map((neighbor) => (
            getNeighbor(chunk.chunk, neighbor)
          )),
        ].map((buffer, binding) => ({
          binding,
          resource: { buffer },
        })),
      }),
      chunk,
    }));
    this.workgroups = Math.ceil(volume.chunkSize / 4);
  }

  compute(command) {
    const { bindings, pipeline, workgroups } = this;
    bindings.forEach(({ bindings, chunk }) => {
      chunk.resetInstanceCount(command);
      const pass = command.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindings);
      pass.dispatchWorkgroups(workgroups, workgroups, workgroups);
      pass.end();
    });
  }
}

export default Mesher;
