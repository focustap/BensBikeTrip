/** Canvas pixels, shared by the collision fixtures and original vector artwork. */
export const BIKE_GEOMETRY = {
  axleX: 40,
  axleY: 27,
  tireRadius: 21,
  head: { x: -16, y: -55, radius: 13 },
  torso: { ax: -13, ay: -44, bx: -7, by: -27, radius: 6.5 },
  legs: [[-9, -26], [5, -15], [12, -6]],
  arms: [[-10, -37], [12, -27], [31, -24]],
  handlebar: [[21, -11], [32, -26], [44, -24]],
  chassis: [[-24, -24], [5, -24], [28, -9], [18, 7], [-20, 7]],
} as const;
