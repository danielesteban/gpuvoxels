import Noise from '../lib/noise.wgsl';
import Rotation from '../lib/rotation.wgsl';
import SDF from '../lib/sdf.wgsl';
import Voxel from '../lib/voxel.js';

const Compute = ({ chunkSize, width, height, depth, source }) => `
@group(0) @binding(0) var<uniform> time : f32;
@group(0) @binding(1) var<uniform> chunk : vec3<i32>;
@group(0) @binding(2) var<storage, read_write> voxels : array<f32>;

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

${source}

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

class SDFVoxelizer {
  constructor({ source, volume }) {
    this.code = Compute({
      chunkSize: volume.chunkSize,
      width: volume.width,
      height: volume.height,
      depth: volume.depth,
      source,
    });
    this.shader = volume.device.createShaderModule({
      code: this.code,
    });
    this.pipeline = volume.device.createComputePipeline({
      layout: 'auto',
      compute: {
        module: this.shader,
        entryPoint: 'main',
      },
    });
    this.bindings = volume.chunks.map(({ position, voxels }) => (
      volume.device.createBindGroup({
        layout: this.pipeline.getBindGroupLayout(0),
        entries: [volume.time.buffer, position, voxels].map((buffer, binding) => ({
          binding,
          resource: { buffer },
        })),
      })
    ));
    this.workgroups = Math.ceil(volume.chunkSize / 4);
  }

  compute(command) {
    const { bindings, pipeline, workgroups } = this;
    bindings.forEach((bindings) => {
      const pass = command.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindings);
      pass.dispatchWorkgroups(workgroups, workgroups, workgroups);
      pass.end();
    });
  }
}

export default SDFVoxelizer;
