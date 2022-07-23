export default ({ chunkSize }) => `
const chunkSize : i32 = ${chunkSize};

fn getVoxel(pos : vec3<i32>) -> u32 {
  return u32(pos.z * chunkSize * chunkSize + pos.y * chunkSize + pos.x);
}
`;
