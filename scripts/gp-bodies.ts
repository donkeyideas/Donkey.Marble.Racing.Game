import { buildTrack } from '../engine/tracks';

const ids = ['gp-100-neon', 'grand-prix-cyber', 'classic-zigzag', 'bumper-blitz', 'cradle-drop', 'gauntlet', 'gen-1043'];

for (const id of ids) {
  const t = buildTrack(id);
  const rampSeg = (t.ramps || []).reduce((s, r) => s + Math.max(0, (r.points?.length ?? 0) - 1), 0);
  const cradleBobs = (t.cradles || []).reduce((s, c) => s + c.count, 0);
  const pitBalls = (t.ballPits || []).reduce((s, p) => s + (p.ballCount ?? 0), 0);
  const staticBodies = 4 + rampSeg + (t.obstacles?.length ?? 0) +
    (t.windmillConfigs?.length ?? 0) + ((t.funnels?.length ?? 0) * 2) +
    5 + 2 + (t.springs?.length ?? 0) + (t.trampolines?.length ?? 0) +
    (t.speedBursts?.length ?? 0) + (t.swingingDoors?.length ?? 0);
  const dynamic = 8 + (t.pendulums?.length ?? 0) + cradleBobs + pitBalls;
  console.log(
    `${id.padEnd(22)} rampSeg=${String(rampSeg).padStart(4)}  obs=${String(t.obstacles?.length ?? 0).padStart(3)}  wm=${t.windmillConfigs?.length ?? 0}  pend=${t.pendulums?.length ?? 0}  pit=${pitBalls}  cradleBobs=${cradleBobs}  | static=${staticBodies}  dynamic=${dynamic}  TOTAL=${staticBodies + dynamic}  finishY=${t.finishY}`,
  );
}
