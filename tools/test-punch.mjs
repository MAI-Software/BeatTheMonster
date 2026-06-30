// Faithful simulation of PoseInput.detectPunch (pure math) to validate behaviour
// without a camera: one fire per jab, fires on the ONSET, fast re-arm, distance-invariant.
// Run: node tools/test-punch.mjs
const mx = (p) => 1 - p.x;

function makeDetector() {
  const st = { restReach: 0, prevReach: 0, vReach: 0, prevFwd: 0, peakReach: 0, armed: true, cooldown: 0 };
  const fires = [];
  function detect(wrist, sh, sw, shZ, dt, nowMs, up) {
    const reach = Math.hypot(mx(wrist) - mx(sh), wrist.y - sh.y) / sw;
    const fwd = (shZ - (wrist.z ?? 0)) / sw;
    if (st.restReach === 0) st.restReach = reach;
    const prevReach = st.prevReach; st.prevReach = reach;
    const prevFwd = st.prevFwd; st.prevFwd = fwd;
    st.vReach += (((reach - prevReach) / dt) - st.vReach) * 0.5;
    const v = st.vReach;
    const vFwd = (fwd - prevFwd) / dt;
    const thrust = v + 0.8 * Math.max(0, vFwd);
    const out = reach - st.restReach;
    if (st.armed) {
      if (up && nowMs > st.cooldown && out > 0.15 && thrust > 2.0) {
        fires.push(Math.round(nowMs)); st.cooldown = nowMs + 140; st.armed = false; st.peakReach = reach;
      }
    } else {
      st.peakReach = Math.max(st.peakReach, reach);
      if (v < -1.0 || reach < st.peakReach - 0.22 || out < 0.10) st.armed = true;
    }
    if (Math.abs(v) < 1.2 && out < 0.5) st.restReach += (reach - st.restReach) * 0.04;
  }
  return { detect, fires };
}

// Build a frame where the right wrist sits `reach` shoulder-widths above its shoulder,
// lunging `fwd` toward the camera. Shoulders centred; `sw` = shoulder width.
function frame(reach, fwd, sw) {
  const sh = { x: 0.5 + sw / 2, y: 0.5, z: 0 };          // right shoulder (unmirrored)
  const wrist = { x: sh.x, y: sh.y - reach * sw, z: -fwd * sw };
  return { wrist, sh, sw, shZ: 0 };
}

// piecewise reach profile of a jab over time
function jabReach(tInJab) {
  const GUARD = 0.45, EXT = 1.7;
  if (tInJab < 0) return GUARD;
  if (tInJab < 120) return GUARD + (EXT - GUARD) * (tInJab / 120);     // thrust out
  if (tInJab < 180) return EXT;                                         // brief hold
  if (tInJab < 330) return EXT - (EXT - GUARD) * ((tInJab - 180) / 150);// retract
  return GUARD;
}

function run(name, { fps, sw, jabStarts, noise = 0 }, expectFires) {
  const d = makeDetector();
  const dtMs = 1000 / fps;
  let rng = 12345;
  const rand = () => { rng = (rng * 9301 + 49297) % 233280; return rng / 233280 - 0.5; };
  for (let t = 0; t < 3000; t += dtMs) {
    let reach = 0.45;
    for (const s of jabStarts) reach = Math.max(reach, jabReach(t - s));
    const inJab = jabStarts.some((s) => t - s >= 0 && t - s < 180);
    const fwd = inJab ? Math.max(0, (reach - 0.45) / 1.25) : 0;
    reach += rand() * noise;
    const f = frame(reach, fwd, sw);
    d.detect(f.wrist, f.sh, f.sw, f.shZ, dtMs / 1000, t, true);
  }
  const ok = d.fires.length === expectFires;
  // latency of first fire relative to its jab start
  const lat = d.fires.length && jabStarts.length ? d.fires[0] - jabStarts[0] : "-";
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(34)} fires=${d.fires.length} (want ${expectFires})  onset+${lat}ms  @${fps}fps sw=${sw}`);
  return ok;
}

let all = true;
all &= run("guard hold, no punch",        { fps: 30, sw: 0.2, jabStarts: [], noise: 0.05 }, 0);
all &= run("single jab (near)",           { fps: 30, sw: 0.4, jabStarts: [400] }, 1);
all &= run("single jab (far/small)",      { fps: 30, sw: 0.15, jabStarts: [400] }, 1);
all &= run("single jab @60fps",           { fps: 60, sw: 0.2, jabStarts: [400] }, 1);
all &= run("single jab @24fps (slow dev)",{ fps: 24, sw: 0.2, jabStarts: [400] }, 1);
all &= run("double jab (combo)",          { fps: 30, sw: 0.2, jabStarts: [400, 850] }, 2);
all &= run("triple rapid jab",            { fps: 30, sw: 0.2, jabStarts: [300, 720, 1140] }, 3);
all &= run("jab with camera noise",       { fps: 30, sw: 0.2, jabStarts: [400], noise: 0.04 }, 1);
console.log(all ? "\nALL PASS" : "\nSOME FAILED");
process.exit(all ? 0 : 1);
