fn sdBox(p : vec3<f32>, r : vec3<f32>) -> f32 {
  var q : vec3<f32> = abs(p) - r;
  return length(max(q, vec3<f32>(0))) + min(max(q.x, max(q.y, q.z)), 0);
}

fn sdCapsule(p : vec3<f32>, r : vec2<f32>) -> f32 {
  var q : vec3<f32> = vec3<f32>(p.x, p.y - clamp(p.y, -r.y + r.x, r.y - r.x), p.z);
  return length(q) - r.x;
}

fn sdEllipsoid(p : vec3<f32>, r : vec3<f32>) -> f32 {
  var k0 : f32 = length(p / r);
  var k1 : f32 = length(p / (r * r));
  return k0 * (k0 - 1.0) / k1;
}

fn sdSphere(p : vec3<f32>, r : f32) -> f32 {
  return length(p) - r;
}

fn sdTorus(p : vec3<f32>, r : vec2<f32>) -> f32 {
  var q : vec2<f32> = vec2<f32>(length(p.xz) - r.x, p.y);
  return length(q) - r.y;
}

fn opUnion(d1 : f32, d2 : f32) -> f32 {
  return min(d1, d2);
}

fn opSubstraction(d1 : f32, d2 : f32) -> f32 {
  return max(d1, -d2);
}

fn opSmoothUnion(d1 : f32, d2 : f32, k : f32) -> f32 {
  var h : f32 = clamp(0.5 + 0.5 * (d2 - d1) / k, 0, 1);
  return mix(d2, d1, h) + k * h * (1 - h);
}

fn opSmoothSubstraction(d1 : f32, d2 : f32, k : f32) -> f32 {
  var h : f32 = clamp(0.5 - 0.5 * (d2 + d1) / k, 0, 1);
  return mix(d1, -d2, h) + k * h * (1 - h);
}
