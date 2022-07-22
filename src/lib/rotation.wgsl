const PI : f32 = 3.141592653589793;

fn rotateX(rad : f32) -> mat3x3<f32> {
  var c : f32 = cos(rad);
  var s : f32 = sin(rad);
  return mat3x3<f32>(
    1, 0, 0,
    0, c, s,
    0, -s, c,
  );
}

fn rotateY(rad : f32) -> mat3x3<f32> {
  var c : f32 = cos(rad);
  var s : f32 = sin(rad);
  return mat3x3<f32>(
    c, 0, -s,
    0, 1, 0,
    s, 0, c,
  );
}

fn rotateZ(rad : f32) -> mat3x3<f32> {
  var c : f32 = cos(rad);
  var s : f32 = sin(rad);
  return mat3x3<f32>(
    c, s, 0,
    -s, c, 0,
    0, 0, 1,
  );
}
