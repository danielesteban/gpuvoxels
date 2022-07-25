import Atlas from './atlas.js';
import Camera from './camera.js';
import Rotation from './lib/rotation.wgsl';
import Postprocessing from './postprocessing.js';

const Vertex = `
struct VertexInput {
  @location(0) position : vec3<f32>,
  @location(1) uv : vec2<f32>,
  @location(2) face : vec4<f32>,
}

struct VertexOutput {
  @builtin(position) position : vec4<f32>,
  @location(0) viewPosition: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) uv: vec2<f32>,
  @location(3) @interpolate(flat) texture: i32,
}

struct Camera {
  projection : mat4x4<f32>,
  view : mat4x4<f32>,
  normal : mat3x3<f32>,
}

@group(0) @binding(0) var<uniform> camera : Camera;

${Rotation}

const faceNormal : vec3<f32> = vec3<f32>(0, 0, 1);

@vertex
fn main(voxel : VertexInput) -> VertexOutput {
  var rotation : mat3x3<f32>;
  switch (i32(voxel.face.w % 6)) {
    default {
      rotation = mat3x3<f32>(
        1, 0, 0,
        0, 1, 0,
        0, 0, 1,
      );
    }
    case 1 {
      rotation = rotateX(PI * -0.5);
    }
    case 2 {
      rotation = rotateX(PI * 0.5);
    }
    case 3 {
      rotation = rotateY(PI * -0.5);
    }
    case 4 {
      rotation = rotateY(PI * 0.5);
    }
    case 5 {
      rotation = rotateY(PI);
    }
  }
  var mvPosition : vec4<f32> = camera.view * vec4<f32>(rotation * voxel.position + voxel.face.xyz, 1);
  var out : VertexOutput;
  out.position = camera.projection * mvPosition;
  out.viewPosition = -mvPosition.xyz;
  out.normal = normalize(camera.normal * rotation * faceNormal);
  out.uv = voxel.uv;
  out.texture = i32(floor(voxel.face.w / 6));
  return out;
}
`;

const Fragment = `
struct FragmentInput {
  @location(0) position : vec3<f32>,
  @location(1) normal : vec3<f32>,
  @location(2) uv : vec2<f32>,
  @location(3) @interpolate(flat) texture : i32,
}

struct FragmentOutput {
  @location(0) color : vec4<f32>,
  @location(1) normal : vec4<f32>,
  @location(2) position : vec4<f32>,
}

@group(0) @binding(1) var atlas : texture_2d_array<f32>;
@group(0) @binding(2) var atlasSampler : sampler;

@fragment
fn main(face : FragmentInput) -> FragmentOutput {
  var output : FragmentOutput;
  output.color = textureSample(atlas, atlasSampler, face.uv, face.texture);
  output.normal = vec4<f32>(normalize(face.normal), 1);
  output.position = vec4<f32>(face.position, 1);
  return output;
}
`;

const Face = (device) => {
  const buffer = device.createBuffer({
    size: 30 * Float32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true,
  });
  new Float32Array(buffer.getMappedRange()).set([
    -0.5, -0.5,  0.5,        0, 1,
     0.5, -0.5,  0.5,        1, 1,
     0.5,  0.5,  0.5,        1, 0,
     0.5,  0.5,  0.5,        1, 0,
    -0.5,  0.5,  0.5,        0, 0,
    -0.5, -0.5,  0.5,        0, 1,
  ]);
  buffer.unmap();
  return buffer;
};

class Renderer {
  constructor({
    adapter,
    device,
    atlas = null,
    camera = null,
    canvas = null,
    samples = 4,
  }) {
    const format = navigator.gpu.getPreferredCanvasFormat(adapter);
    this.atlas = atlas || new Atlas({ device });
    this.camera = camera || new Camera({ device });
    this.canvas = canvas || document.createElement('canvas');
    // I have no idea why but if I don't do this, sometimes it crashes with:
    // D3D12 reset command allocator failed with E_FAIL
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.context = this.canvas.getContext('webgpu');
    this.context.configure({ alphaMode: 'opaque', device, format });
    this.device = device;
    this.samples = samples;
    const renderingPipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: device.createShaderModule({
          code: Vertex,
        }),
        entryPoint: 'main',
        buffers: [
          {
            arrayStride: 5 * Float32Array.BYTES_PER_ELEMENT,
            attributes: [
              {
                shaderLocation: 0,
                offset: 0,
                format: 'float32x3',
              },
              {
                shaderLocation: 1,
                offset: 3 * Float32Array.BYTES_PER_ELEMENT,
                format: 'float32x2',
              },
            ],
          },
          {
            arrayStride: 4 * Float32Array.BYTES_PER_ELEMENT,
            stepMode: 'instance',
            attributes: [
              {
                shaderLocation: 2,
                offset: 0,
                format: 'float32x4',
              },
            ],
          }
        ],
      },
      fragment: {
        module: device.createShaderModule({
          code: Fragment,
        }),
        entryPoint: 'main',
        targets: [
          { format: 'rgba8unorm' },
          { format: 'rgba16float' },
          { format: 'rgba16float' },
        ],
      },
      primitive: {
        topology: 'triangle-list',
        cullMode: 'back',
      },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less',
        format: 'depth24plus',
      },
      multisample: {
        count: this.samples,
      },
    });
    this.rendering = {
      bindings: device.createBindGroup({
        layout: renderingPipeline.getBindGroupLayout(0),
        entries: [
          {
            binding: 0,
            resource: { buffer: this.camera.buffer },
          },
          {
            binding: 1,
            resource: this.atlas.texture.createView(),
          },
          {
            binding: 2,
            resource: device.createSampler(),
          },
        ],
      }),
      descriptor: {
        colorAttachments: [
          {
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: 'clear',
            storeOp: 'store',
          },
          {
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
            loadOp: 'clear',
            storeOp: 'store',
          },
          {
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
            loadOp: 'clear',
            storeOp: 'store',
          }
        ],
        depthStencilAttachment: {
          depthClearValue: 1,
          depthLoadOp: 'clear',
          depthStoreOp: 'store',
        },
      },
      geometry: Face(device),
      pipeline: renderingPipeline,
    };
    this.postprocessing = new Postprocessing({ device, format });
  }

  render(command, volume) {
    const {
      context,
      postprocessing,
      rendering: { bindings, descriptor, geometry, pipeline },
    } = this;
    const pass = command.beginRenderPass(descriptor);
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindings);
    pass.setVertexBuffer(0, geometry);
    volume.chunks.forEach(({ faces }) => {
      pass.setVertexBuffer(1, faces, 16);
      pass.drawIndirect(faces, 0);
    });
    pass.end();
    postprocessing.render(command, context.getCurrentTexture().createView());
  }

  setClearColor(r, g, b) {
    const { rendering: { descriptor: { colorAttachments: [{ clearValue }] } } } = this;
    clearValue.r = r;
    clearValue.g = g;
    clearValue.b = b;
  }

  setSize(width, height) {
    const {
      camera,
      canvas,
      device,
      postprocessing,
      rendering,
      samples,
    } = this;
    const pixelRatio = window.devicePixelRatio || 1;
    const size = [Math.floor(width * pixelRatio), Math.floor(height * pixelRatio)];
    canvas.width = size[0];
    canvas.height = size[1];
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    camera.aspect = width / height;
    camera.updateProjection();

    const updateTexture = (object, key, sampleCount, format) => {
      if (object[key]) {
        object[key].destroy();
      }
      object[key] = device.createTexture({
        size,
        sampleCount,
        format,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });
      return object[key].createView();
    };
    rendering.descriptor.colorAttachments[0].view = updateTexture(rendering, 'colorTexture', samples, 'rgba8unorm');
    rendering.descriptor.colorAttachments[0].resolveTarget = updateTexture(rendering, 'colorTarget', 1, 'rgba8unorm');
    rendering.descriptor.colorAttachments[1].view = updateTexture(rendering, 'normalTexture', samples, 'rgba16float');
    rendering.descriptor.colorAttachments[1].resolveTarget = updateTexture(rendering, 'normalTarget', 1, 'rgba16float');
    rendering.descriptor.colorAttachments[2].view = updateTexture(rendering, 'positionTexture', samples, 'rgba16float');
    rendering.descriptor.colorAttachments[2].resolveTarget = updateTexture(rendering, 'positionTarget', 1, 'rgba16float');
    rendering.descriptor.depthStencilAttachment.view = updateTexture(rendering, 'depthTexture', samples, 'depth24plus');
    postprocessing.bindTextures({
      color: rendering.colorTarget.createView(),
      normal: rendering.normalTarget.createView(),
      position: rendering.positionTarget.createView(),
    });
  }
}

export default Renderer;
