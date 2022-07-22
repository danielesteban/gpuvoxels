import Camera from './camera.js';
import Rotation from '../lib/rotation.wgsl';

const Vertex = `
struct VertexInput {
  @location(0) position : vec3<f32>,
  @location(1) uv : vec2<f32>,
  @location(2) face : vec4<f32>,
}

struct VertexOutput {
  @builtin(position) position : vec4<f32>,
  @location(0) normal: vec3<f32>,
  @location(1) uv: vec2<f32>,
  @location(2) @interpolate(flat) texture: i32,
}

@group(0) @binding(0) var<uniform> camera : mat4x4<f32>;

${Rotation}

const faceNormal : vec3<f32> = vec3<f32>(0, 0, 1);

@vertex
fn main(voxel : VertexInput) -> VertexOutput {
  var rotation : mat3x3<f32>;
  switch (u32(voxel.face.w % 6)) {
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
  var out : VertexOutput;
  out.position = camera * vec4<f32>(rotation * voxel.position + voxel.face.xyz, 1);
  out.normal = rotation * faceNormal;
  out.uv = voxel.uv;
  out.texture = i32(floor(voxel.face.w / 6));
  return out;
}
`;

const Fragment = `
struct FragmentInput {
  @location(0) normal: vec3<f32>,
  @location(1) uv: vec2<f32>,
  @location(2) @interpolate(flat) texture: i32,
}

@group(0) @binding(1) var atlas : texture_2d_array<f32>;
@group(0) @binding(2) var atlasSampler : sampler;

@fragment
fn main(face : FragmentInput) -> @location(0) vec4<f32> {
  return textureSample(atlas, atlasSampler, face.uv, face.texture);
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
    atlas = { data: new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF]), size: [1, 1, 1] },
    camera = null,
    canvas = null,
    samples = 4,
  }) {
    this.atlas = device.createTexture({
      dimension: '2d',
      size: atlas.size,
      format: 'rgba8unorm',
      usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    if (atlas.data) {
      device.queue.writeTexture(
        { texture: this.atlas },
        atlas.data,
        { bytesPerRow: atlas.size[0] * 4, rowsPerImage: atlas.size[1] },
        atlas.size
      );
    } else {
      device.queue.copyExternalImageToTexture(
        { source: atlas.image },
        { texture: this.atlas },
        atlas.size
      );
    }
    this.camera = camera || new Camera({ device });
    this.canvas = canvas || document.createElement('canvas');
    // I have no idea why but if I don't do this, sometimes it crashes with:
    // D3D12 reset command allocator failed with E_FAIL
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.colorFormat = navigator.gpu.getPreferredCanvasFormat(adapter);
    this.context = this.canvas.getContext('webgpu');
    this.context.configure({ alphaMode: 'opaque', device, format: this.colorFormat });
    this.device = device;
    this.descriptor = {
      colorAttachments: [{
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: 'clear',
        storeOp: 'discard',
      }],
      depthStencilAttachment: {
        depthClearValue: 1,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    };
    this.face = Face(device);
    this.samples = samples;
    this.pipeline = device.createRenderPipeline({
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
        targets: [{ format: this.colorFormat }],
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
    this.bindings = device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: { buffer: this.camera.buffer },
        },
        {
          binding: 1,
          resource: this.atlas.createView({ dimension: '2d-array' }),
        },
        {
          binding: 2,
          resource: device.createSampler(),
        },
      ],
    });
  }

  render(command, volume) {
    const { bindings, context, descriptor, face, pipeline } = this;
    descriptor.colorAttachments[0].resolveTarget = context.getCurrentTexture().createView();
    const pass = command.beginRenderPass(descriptor);
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindings);
    pass.setVertexBuffer(0, face);
    volume.chunks.forEach(({ faces }) => {
      pass.setVertexBuffer(1, faces, 16);
      pass.drawIndirect(faces, 0);
    });
    pass.end();
  }

  setClearColor(r, g, b) {
    const { descriptor: { colorAttachments: [{ clearValue }] } } = this;
    clearValue.r = r;
    clearValue.g = g;
    clearValue.b = b;
  }

  setSize(width, height) {
    const {
      camera,
      canvas,
      colorFormat,
      colorTexture,
      device,
      descriptor,
      depthTexture,
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
    if (colorTexture) {
      colorTexture.destroy();
    }
    this.colorTexture = device.createTexture({
      size,
      sampleCount: samples,
      format: colorFormat,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    descriptor.colorAttachments[0].view = this.colorTexture.createView();
    if (depthTexture) {
      depthTexture.destroy();
    }
    this.depthTexture = device.createTexture({
      size,
      sampleCount: samples,
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    descriptor.depthStencilAttachment.view = this.depthTexture.createView();
  }
}

export default Renderer;
