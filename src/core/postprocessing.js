const Vertex = `
@vertex
fn main(@location(0) position : vec4<f32>) -> @builtin(position) vec4<f32> {
  return position;
}
`;

const Fragment = `
struct Edges {
  color : vec3<f32>,
  intensity : f32,
  depthScale : f32,
  normalScale : f32,
}

struct Effects {
  edges : Edges,
}

@group(0) @binding(0) var<uniform> effects : Effects;
@group(0) @binding(1) var colorTexture : texture_2d<f32>;
@group(0) @binding(2) var normalTexture : texture_2d<f32>;
@group(0) @binding(3) var positionTexture : texture_2d<f32>;

const offset : vec3<i32> = vec3<i32>(1, 1, 0);

fn edgesDepth(pixel : vec2<i32>) -> f32 {
  var pixelCenter : f32 = textureLoad(positionTexture, pixel, 0).z;
  var pixelLeft : f32 = textureLoad(positionTexture, pixel - offset.xz, 0).z;
  var pixelRight : f32 = textureLoad(positionTexture, pixel + offset.xz, 0).z;
  var pixelUp : f32 = textureLoad(positionTexture, pixel + offset.zy, 0).z;
  var pixelDown : f32 = textureLoad(positionTexture, pixel - offset.zy, 0).z;
  return (
    abs(pixelLeft    - pixelCenter) 
    + abs(pixelRight - pixelCenter) 
    + abs(pixelUp    - pixelCenter) 
    + abs(pixelDown  - pixelCenter) 
  ) * effects.edges.depthScale;
}

fn edgesNormal(pixel : vec2<i32>) -> f32 {
  var pixelCenter : vec3<f32> = textureLoad(normalTexture, pixel, 0).xyz;
  var pixelLeft : vec3<f32> = textureLoad(normalTexture, pixel - offset.xz, 0).xyz;
  var pixelRight : vec3<f32> = textureLoad(normalTexture, pixel + offset.xz, 0).xyz;
  var pixelUp : vec3<f32> = textureLoad(normalTexture, pixel + offset.zy, 0).xyz;
  var pixelDown : vec3<f32> = textureLoad(normalTexture, pixel - offset.zy, 0).xyz;
  var edge : vec3<f32> = (
    abs(pixelLeft    - pixelCenter)
    + abs(pixelRight - pixelCenter) 
    + abs(pixelUp    - pixelCenter) 
    + abs(pixelDown  - pixelCenter)
  );
  return (edge.x + edge.y + edge.z) * effects.edges.normalScale;
}

@fragment
fn main(@builtin(position) uv : vec4<f32>) -> @location(0) vec4<f32> {
  var pixel : vec2<i32> = vec2<i32>(floor(uv.xy));
  var color : vec3<f32> = textureLoad(colorTexture, pixel, 0).xyz;
  if (effects.edges.intensity != 0) {
    color = mix(color, effects.edges.color, clamp(max(edgesDepth(pixel), edgesNormal(pixel)), 0, 1) * effects.edges.intensity);
  }
  return vec4<f32>(color, 1);
}
`;

const Effects = (device) => {
  const data = new Float32Array([
    0, 0, 0,
    0.3,
    0.5,
    0.5,
  ]);
  const buffer = device.createBuffer({
    size: 32,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
    mappedAtCreation: true,
  });
  new Float32Array(buffer.getMappedRange()).set(data);
  buffer.unmap();
  return {
    buffer,
    edges: {
      get color() {
        return data.subarray(0, 3);
      },
      set color(value) {
        data.set(value);
        device.queue.writeBuffer(buffer, 0, data, 0, 3);
      },
      get intensity() {
        return data[3];
      },
      set intensity(value) {
        data[3] = value;
        device.queue.writeBuffer(buffer, 12, data, 3, 1);
      },
      get depthScale() {
        return data[4];
      },
      set depthScale(value) {
        data[4] = value;
        device.queue.writeBuffer(buffer, 16, data, 4, 1);
      },
      get normalScale() {
        return data[5];
      },
      set normalScale(value) {
        data[5] = value;
        device.queue.writeBuffer(buffer, 20, data, 5, 1);
      },
    },
  };
};

const Screen = (device) => {
  const buffer = device.createBuffer({
    size: 18 * Float32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true,
  });
  new Float32Array(buffer.getMappedRange()).set([
    -1, -1,  1,
     1, -1,  1,
     1,  1,  1,
     1,  1,  1,
    -1,  1,  1,
    -1, -1,  1,
  ]);
  buffer.unmap();
  return buffer;
};

class Postprocessing {
  constructor({ device, format }) {
    this.device = device;
    this.descriptor = {
      colorAttachments: [{
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
    };
    this.effects = Effects(device);
    this.geometry = Screen(device);
    this.pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: device.createShaderModule({
          code: Vertex,
        }),
        entryPoint: 'main',
        buffers: [
          {
            arrayStride: 3 * Float32Array.BYTES_PER_ELEMENT,
            attributes: [
              {
                shaderLocation: 0,
                offset: 0,
                format: 'float32x3',
              },
            ],
          },
        ],
      },
      fragment: {
        module: device.createShaderModule({
          code: Fragment,
        }),
        entryPoint: 'main',
        targets: [{ format }],
      },
      primitive: {
        topology: 'triangle-list',
      },
    });
  }

  bindTextures({ color, normal, position }) {
    const { device, effects, pipeline } = this;
    this.bindings = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: { buffer: effects.buffer },
        },
        {
          binding: 1,
          resource: color,
        },
        {
          binding: 2,
          resource: normal,
        },
        {
          binding: 3,
          resource: position,
        },
      ],
    });
  }

  render(command, view) {
    const { bindings, descriptor, geometry, pipeline } = this;
    descriptor.colorAttachments[0].view = view;
    const pass = command.beginRenderPass(descriptor);
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindings);
    pass.setVertexBuffer(0, geometry);
    pass.draw(6, 1, 0, 0);
    pass.end();
  }
}

export default Postprocessing;