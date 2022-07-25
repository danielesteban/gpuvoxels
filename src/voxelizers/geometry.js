import { mat4 } from 'gl-matrix';
import Voxel from '../lib/voxel.js';

const Compute = ({ chunkSize, source, triangles }) => `
@group(0) @binding(0) var<uniform> chunk : vec3<i32>;
@group(0) @binding(1) var<uniform> transform : mat4x4<f32>;
@group(0) @binding(2) var<storage, read> indices : array<array<u32, 3>>;
@group(0) @binding(3) var<storage, read> vertices : array<array<f32, 3>>;
@group(0) @binding(4) var<storage, read_write> voxels : array<f32>;

${Voxel({ chunkSize })}

struct AxisTest {
  ann : vec3<f32>,
  fnn : vec3<f32>,
  aa : i32,
  bb : i32,
}

fn intersects(triangle : array<vec3<f32>, 3>, voxel : vec3<f32>) -> bool {
  var v0 : vec3<f32> = triangle[0] - voxel;
  var v1 : vec3<f32> = triangle[1] - voxel;
  var v2 : vec3<f32> = triangle[2] - voxel;

  var f0 : vec3<f32> = v1 - v0;
  var f1 : vec3<f32> = v2 - v1;
  var f2 : vec3<f32> = v0 - v2;

  var axis_test = array<AxisTest, 9>(
    AxisTest(vec3<f32>(0, -f0.z, f0.y), f0, 1, 2),
    AxisTest(vec3<f32>(0, -f1.z, f1.y), f1, 1, 2),
    AxisTest(vec3<f32>(0, -f2.z, f2.y), f2, 1, 2),
    AxisTest(vec3<f32>(f0.z, 0, -f0.x), f0, 0, 2),
    AxisTest(vec3<f32>(f1.z, 0, -f1.x), f1, 0, 2),
    AxisTest(vec3<f32>(f2.z, 0, -f2.x), f2, 0, 2),
    AxisTest(vec3<f32>(-f0.y, f0.x, 0), f0, 0, 1),
    AxisTest(vec3<f32>(-f1.y, f1.x, 0), f1, 0, 1),
    AxisTest(vec3<f32>(-f2.y, f2.x, 0), f2, 0, 1),
  );

  for (var i : i32 = 0; i < 9; i++) {
    var t : AxisTest = axis_test[i];
    var p0 : f32 = dot(v0, t.ann);
    var p1 : f32 = dot(v1, t.ann);
    var p2 : f32 = dot(v2, t.ann);
    var r : f32 = 0.5 * abs(t.fnn[t.bb]) + 0.5 * abs(t.fnn[t.aa]);
    if (max(-max(p0, max(p1, p2)), min(p0, min(p1, p2))) > r) {
      return false;
    }
  }

  if (max(v0.x, max(v1.x, v2.x)) < -0.5 || min(v0.x, min(v1.x, v2.x)) > 0.5) {
    return false;
  }
  if (max(v0.y, max(v1.y, v2.y)) < -0.5 || min(v0.y, min(v1.y, v2.y)) > 0.5) {
    return false;
  }
  if (max(v0.z, max(v1.z, v2.z)) < -0.5 || min(v0.z, min(v1.z, v2.z)) > 0.5) {
    return false;
  }

  var planeNorm : vec3<f32> = normalize(cross(f1, f0));
  var planeConst : f32 = dot(planeNorm, triangle[0]);
  var r : f32 = 0.5 * abs(planeNorm.x) + 0.5 * abs(planeNorm.y) + 0.5 * abs(planeNorm.z);
  var s : f32 = abs(dot(planeNorm, voxel) - planeConst);
  return s <= r;
}

fn getVertex(index : u32) -> vec3<f32> {
  var vertex : vec4<f32> = vec4<f32>(vertices[index][0], vertices[index][1], vertices[index][2], 1);
  return (transform * vertex).xyz - vec3<f32>(chunk);
}

const triangles : u32 = ${triangles};

${source}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) GlobalInvocationID : vec3<u32>) {
  var id : u32 = GlobalInvocationID.x;
  if (id >= triangles) {
    return;
  }

  var triangle = array<vec3<f32>, 3>(
    getVertex(indices[id][0]),
    getVertex(indices[id][1]),
    getVertex(indices[id][2]),
  );

  var tmin : vec3<i32> = vec3<i32>(chunkSize);
  var tmax : vec3<i32> = vec3<i32>(0);
  for (var i : i32 = 0; i < 3; i++) {
    var p = vec3<i32>(triangle[i]);
    tmin = min(tmin, p);
    tmax = max(tmax, p);
  }
  tmin = clamp(tmin, vec3<i32>(0), vec3<i32>(chunkSize - 1));
  tmax = clamp(tmax, vec3<i32>(0), vec3<i32>(chunkSize - 1));

  for (var z : i32 = tmin.z; z <= tmax.z; z++) {
    for (var y : i32 = tmin.y; y <= tmax.y; y++) {
      for (var x : i32 = tmin.x; x <= tmax.x; x++) {
        if (intersects(triangle, vec3<f32>(f32(x) + 0.5, f32(y) + 0.5, f32(z) + 0.5))) {
          var pos : vec3<i32> = vec3<i32>(x, y, z);
          voxels[getVoxel(pos)] = getValueAt(vec3<f32>(chunk + pos));
        }
      }
    }
  }
}
`;

const DefaultSource = `
fn getValueAt(pos : vec3<f32>) -> f32 {
  return 1;
}
`;

class Transform {
  constructor({
    device,
    position = new Float32Array([0, 0, 0]),
    rotation = new Float32Array([0, 0, 0, 1]),
    scale = new Float32Array([1, 1, 1]),
  }) {
    this.device = device;
    this.data = mat4.create();
    this.buffer = device.createBuffer({
      mappedAtCreation: true,
      size: this.data.byteLength,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
    });
    mat4.fromRotationTranslationScale(this.data, rotation, position, scale);
    new Float32Array(this.buffer.getMappedRange()).set(this.data);
    this.buffer.unmap();
  }

  destroy() {
    const { buffer } = this;
    buffer.destroy();
  }

  set(position, rotation, scale) {
    const { device, buffer, data } = this;
    mat4.fromRotationTranslationScale(data, rotation, position, scale);
    device.queue.writeBuffer(buffer, 0, data);
  }
}

class GeometryVoxelizer {
  constructor({ geometry, volume }) {
    const triangles = geometry.indices.length / 3;
    this.pipeline = volume.device.createComputePipeline({
      layout: 'auto',
      compute: {
        module: volume.device.createShaderModule({
          code: Compute({
            chunkSize: volume.chunkSize,
            source: geometry.source || DefaultSource,
            triangles,
          }),
        }),
        entryPoint: 'main',
      },
    });

    this.transform = new Transform({
      device: volume.device,
      position: geometry.position,
      rotation: geometry.rotation,
      scale: geometry.scale,
    });

    this.indices = volume.device.createBuffer({
      mappedAtCreation: true,
      size: geometry.indices.byteLength,
      usage: GPUBufferUsage.STORAGE,
    });
    new Uint32Array(this.indices.getMappedRange()).set(geometry.indices);
    this.indices.unmap();

    this.vertices = volume.device.createBuffer({
      mappedAtCreation: true,
      size: geometry.vertices.byteLength,
      usage: GPUBufferUsage.STORAGE,
    });
    new Float32Array(this.vertices.getMappedRange()).set(geometry.vertices);
    this.vertices.unmap();

    this.bindings = volume.chunks.map(({ position, voxels }) => ({
      bindings: volume.device.createBindGroup({
        layout: this.pipeline.getBindGroupLayout(0),
        entries: [position, this.transform.buffer, this.indices, this.vertices, voxels].map((buffer, binding) => ({
          binding,
          resource: { buffer },
        })),
      }),
      clearChunk: (command) => (
        command.clearBuffer(voxels)
      ),
    }));
    this.workgroups = Math.ceil(triangles / 64);
  }

  compute(command) {
    const { bindings, pipeline, workgroups } = this;
    bindings.forEach(({ bindings, clearChunk }) => {
      clearChunk(command);
      const pass = command.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindings);
      pass.dispatchWorkgroups(workgroups);
      pass.end();
    });
  }

  destroy() {
    const { transform, indices, vertices } = this;
    transform.destroy();
    indices.destroy();
    vertices.destroy();
  }
}

export default GeometryVoxelizer;
