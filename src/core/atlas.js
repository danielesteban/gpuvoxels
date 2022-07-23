import Noise from '../lib/noise.wgsl';

const Compute = ({ count, width, height, generator }) => `
@group(0) @binding(0) var texture : texture_storage_2d_array<rgba8unorm, write>;

${Noise}

struct Atlas {
  count : i32,
  width : i32,
  height : i32,
  stride : i32,
  length : i32,
}

const atlas : Atlas = Atlas(
  ${count},
  ${width},
  ${height},
  ${width * height},
  ${count * width * height},
);

fn hue2Rgb(p : f32, q : f32, t : f32) -> f32 {
  var h : f32 = t;
  if (h < 0) { h += 1; }
  if (h > 1) { h -= 1; }
  if (h < 1 / 6.0) { return p + (q - p) * 6 * h; }
  if (h < 1 / 2.0) { return q; }
  if (h < 2 / 3.0) { return p + (q - p) * (2.0 / 3.0 - h) * 6; }
  return p;
}

fn hsl2Rgba(h : f32, s: f32, l: f32) -> vec4<f32> {
  var rgba : vec4<f32> = vec4<f32>(0, 0, 0, 1);
  if (s == 0) {
    rgba.r = l;
    rgba.g = l;
    rgba.b = l;
  } else {
    var q : f32;
    if (l < 0.5) {
      q = l * (1 + s);
    } else {
      q = l + s - l * s;
    }
    var p : f32 = 2 * l - q;
    rgba.r = hue2Rgb(p, q, h + 1 / 3.0);
    rgba.g = hue2Rgb(p, q, h);
    rgba.b = hue2Rgb(p, q, h - 1 / 3.0);
  }
  return rgba;
};

${generator}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) GlobalInvocationID : vec3<u32>) {
  var id : i32 = i32(GlobalInvocationID.x);
  if (id >= atlas.length) {
    return;
  }
  var tex : i32 = id / atlas.stride;
  var index : i32 = id - tex * atlas.stride;
  var y : i32 = index / atlas.width;
  var pixel : vec2<i32> = vec2<i32>(index - y * atlas.width, y);
  textureStore(texture, pixel, tex, getColorAt(tex, pixel));
}
`;

const DefaultGenerator = `
fn getColorAt(texture : i32, pixel : vec2<i32>) -> vec4<f32> {
  var h : f32 = f32(texture) / f32(atlas.count);
  var s : f32 = 0.5;
  var l : f32 = 0.5;
  if (pixel.x == 0 || pixel.y == 0 || pixel.x == (atlas.width - 1) || pixel.y == (atlas.height - 1)) {
    l = min(l * 1.1, 1);
  }
  return hsl2Rgba(h, s, l);
}
`;

class Atlas {
  constructor({ device, count = 254, width = 16, height = 16 }) {
    this.device = device;
    this.count = count;
    this.width = width;
    this.height = height;
    this.texture = device.createTexture({
      dimension: '2d',
      size: [width, height, count],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    });
  }

  compute(generator = DefaultGenerator) {
    if (this.generator === generator) {
      return;
    }
    this.generator = generator;
    const { device, count, width, height, texture } = this;
    const pipeline = device.createComputePipeline({
      layout: 'auto',
      compute: {
        module: device.createShaderModule({
          code: Compute({ count, width, height, generator }),
        }),
        entryPoint: 'main',
      },
    });
    const command = device.createCommandEncoder();
    const pass = command.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{
        binding: 0,
        resource: texture.createView(),
      }],
    }));
    pass.dispatchWorkgroups(Math.ceil((count * width * height) / 64));
    pass.end();
    device.queue.submit([command.finish()]);
  }
}

export default Atlas;
