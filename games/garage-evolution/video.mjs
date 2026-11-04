// The preview video (`gp video`: 15 s, both orientations, on a virtual clock): the first muddy car scrubbed clean by
// the demo bot — mud gone, rust under it ground off, the shine, the parts bolted on, headlights and the drive-out.
export default async function video(v) {
  await v.until('[data-gp=play]', 10);
  // The first screen off camera (no "Play" text in a preview); the tap lands right on the car
  await v.step(v.sec(0.3), { film: false });
  await v.tap('[data-gp=play]');
  await v.demo();
  await v.step(v.sec(14.5));
}
