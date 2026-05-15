// Headless track physics tester — runs each track and reports issues
// Usage: node test-tracks.js [track-name]

const Matter = require('matter-js');
const { Engine, Bodies, Body, Composite, Constraint, Events } = Matter;

// ═══════════════════════════════════════════
// CONSTANTS (matching race.ts)
// ═══════════════════════════════════════════
const W = 400;
const ENTRY = -30, GAP = 100;
const SUBSTEPS = 3;
const FIXED_DT = (1000/60) / SUBSTEPS;
const CAT_WALL = 0x0001, CAT_MARBLE = 0x0002, CAT_OBS = 0x0004, CAT_DOOMSDAY = 0x0008;
const MARBLE_F = { category: CAT_MARBLE, mask: CAT_WALL|CAT_MARBLE|CAT_OBS|CAT_DOOMSDAY };
const OBS_F    = { category: CAT_OBS, mask: CAT_WALL|CAT_MARBLE };
const CRADLE_F = { category: CAT_OBS, mask: CAT_WALL|CAT_MARBLE|CAT_OBS };
const DOOMSDAY_F = { category: CAT_DOOMSDAY, mask: CAT_MARBLE };

const MARBLES = [
  { id:'rocky',  name:'Rocky',  color:'#e74c3c', stats:{speed:3,power:4,bounce:2,luck:3} },
  { id:'dash',   name:'Dash',   color:'#228be6', stats:{speed:5,power:2,bounce:3,luck:2} },
  { id:'lucky',  name:'Lucky',  color:'#2ecc71', stats:{speed:3,power:3,bounce:2,luck:5} },
  { id:'spike',  name:'Spike',  color:'#ffc220', stats:{speed:2,power:5,bounce:4,luck:2} },
  { id:'nova',   name:'Nova',   color:'#9b59b6', stats:{speed:4,power:2,bounce:3,luck:4} },
  { id:'frosty', name:'Frosty', color:'#e67e22', stats:{speed:3,power:3,bounce:4,luck:3} },
  { id:'aqua',   name:'Aqua',   color:'#17a2b8', stats:{speed:4,power:2,bounce:2,luck:4} },
  { id:'shadow', name:'Shadow', color:'#495057', stats:{speed:3,power:4,bounce:3,luck:3} },
];

// ═══════════════════════════════════════════
// TRACK HELPERS
// ═══════════════════════════════════════════
function rampPts(cy, isR, drop) {
  const sx = isR ? ENTRY : GAP, ex = isR ? W-GAP : W-ENTRY;
  const sy = isR ? cy-drop : cy+drop, ey = isR ? cy+drop : cy-drop;
  return [{x:sx,y:sy},{x:ex,y:ey}];
}
function mkSprings(cys, drop) {
  return cys.map((cy,i) => {
    const isR = i%2===0;
    return { x: isR ? W-GAP/2 : GAP/2, y: cy+drop+25, w:35, h:12 };
  });
}
function mkPegs(pegY, rows, cols, hs, vs) {
  const o = [];
  for (let r=0; r<rows; r++) {
    const off = r%2===0 ? 0 : hs/2;
    for (let c=0; c<cols; c++) {
      const px = 40+off+c*hs, py = pegY-(rows*vs)/2+r*vs;
      if (px>25 && px<W-25) o.push({x:px,y:py,r:6,type:'peg'});
    }
  }
  return o;
}
function mkFunnel(pegY, above, below) {
  return { y1:pegY-above, y2:pegY-below, lx1:15, lx2:155, rx1:W-15, rx2:W-155 };
}
function mkFinish(fy) {
  const cw=35, cx=W/2, cl=cx-cw/2, cr=cx+cw/2, cd=220;
  return { cx,cl,cr,cd, funnel:{ y1:fy-160, y2:fy, lx1:0, lx2:cl, rx1:W, rx2:cr } };
}
function gapBumpers(cy, sp) {
  return [
    {x:130, y:cy-sp*0.5, r:14, type:'bumper'},
    {x:270, y:cy+sp*0.5, r:14, type:'bumper'},
  ];
}
function gapPegs(cy, rows) { return mkPegs(cy, Math.min(rows,2), 4, 70, 35); }

// ═══════════════════════════════════════════
// TRACK BUILDERS (matching tracks.ts exactly)
// ═══════════════════════════════════════════
function buildClassicZigzag() {
  const D=65, CYS=[300,520,740,1500,1720,1940], PZ=[1150,2350], FY=2700, CD=220;
  const ramps = CYS.map((cy,i)=>({pts:rampPts(cy,i%2===0,D),cy}));
  const obs = [];
  PZ.forEach(y => obs.push(...mkPegs(y,3,5,65,35)));
  const m12=(520+740)/2, m45=(1720+1940)/2;
  obs.push({x:150,y:m12-40,r:14,type:'bumper'},{x:250,y:m12,r:14,type:'bumper'},{x:150,y:m12+40,r:14,type:'bumper'});
  obs.push({x:250,y:m45-40,r:14,type:'bumper'},{x:150,y:m45,r:14,type:'bumper'},{x:250,y:m45+40,r:14,type:'bumper'});
  obs.push(...gapBumpers(950,40),...gapBumpers(2150,40));
  const wm = [
    {x:200,y:(300+520)/2,w:340,s:0.007},{x:200,y:950,w:200,s:0.009},
    {x:200,y:(1500+1720)/2,w:320,s:0.008},{x:200,y:2150,w:200,s:0.009},
  ];
  PZ.forEach(y => wm.push({x:200,y:y-80,w:120,s:0.04}));
  const fn = PZ.map(y=>mkFunnel(y,200,70));
  const sp = mkSprings(CYS,D), fi = mkFinish(FY);
  return {id:'classic-zigzag',w:W,h:FY+CD+10,fy:FY,...fi,ramps,obs,wm,fn,sp,g:{x:0,y:1.0,scale:0.001}};
}

function buildBumperBlitz() {
  const D=50, CYS=[300,520,740,1500,1720,1940], PZ=[1150,2350], FY=2700, CD=220;
  const ramps = CYS.map((cy,i)=>({pts:rampPts(cy,i%2===0,D),cy}));
  const obs = [];
  PZ.forEach(y => obs.push(...mkPegs(y,3,5,65,35)));
  const mids=[(300+520)/2,(520+740)/2,(1500+1720)/2,(1720+1940)/2];
  mids.forEach((m,i) => obs.push({x:i%2===0?150:250,y:m,r:14,type:'bumper'}));
  obs.push(...gapBumpers(950,40),...gapBumpers(2150,40));
  const wm = [
    {x:200,y:(300+520)/2,w:300,s:0.008},{x:200,y:950,w:280,s:0.007},
    {x:200,y:(1500+1720)/2,w:300,s:0.009},
  ];
  PZ.forEach(y => wm.push({x:200,y:y-80,w:130,s:0.04}));
  const fn = PZ.map(y=>mkFunnel(y,180,60));
  const sp = mkSprings(CYS,D), fi = mkFinish(FY);
  return {id:'bumper-blitz',w:W,h:FY+CD+10,fy:FY,...fi,ramps,obs,wm,fn,sp,g:{x:0,y:1.0,scale:0.001}};
}

function buildPendulumAlley() {
  const D=60, CYS=[300,520,740,1500,1720,1940], PZ=[1150,2350], FY=2700, CD=220;
  const ramps = CYS.map((cy,i)=>({pts:rampPts(cy,i%2===0,D),cy}));
  const obs = [];
  PZ.forEach(y => obs.push(...mkPegs(y,3,5,65,35)));
  obs.push(...gapPegs(900,2),...gapPegs(1350,2),...gapPegs(2150,2));
  const wm = [{x:200,y:(300+520)/2,w:280,s:0.007}];
  const fn = PZ.map(y=>mkFunnel(y,200,70));
  const sp = mkSprings(CYS,D), fi = mkFinish(FY);
  const pend = [
    {ax:200,ay:720,len:100,br:18,vx:7},{ax:150,ay:800,len:100,br:18,vx:-7},
    {ax:250,ay:900,len:110,br:20,vx:8},{ax:200,ay:1250,len:100,br:16,vx:-6},
    {ax:150,ay:1920,len:100,br:18,vx:7},{ax:250,ay:2000,len:110,br:18,vx:-7},
    {ax:200,ay:2100,len:100,br:20,vx:8},
  ];
  return {id:'pendulum-alley',w:W,h:FY+CD+10,fy:FY,...fi,ramps,obs,wm,fn,sp,g:{x:0,y:1.0,scale:0.001},pend};
}

function buildBallPitRun() {
  const D=55, CYS=[300,520,740,1500,1720,1940], FY=2700, CD=220;
  const ramps = CYS.map((cy,i)=>({pts:rampPts(cy,i%2===0,D),cy}));
  const obs = [
    {x:150,y:950,r:12,type:'bumper'},{x:250,y:950,r:12,type:'bumper'},
    {x:200,y:1350,r:14,type:'bumper'},{x:150,y:2050,r:12,type:'bumper'},{x:250,y:2050,r:12,type:'bumper'},
  ];
  obs.push(...gapPegs(1350,3));
  const wm = [{x:200,y:(300+520)/2,w:300,s:0.007},{x:200,y:(1500+1720)/2,w:280,s:0.008}];
  const fn = [mkFunnel(1000,160,50),mkFunnel(2200,160,50)];
  const sp = mkSprings(CYS,D), fi = mkFinish(FY);
  const pits = [{x:30,y:850,w:340,h:200,n:18,br:8},{x:30,y:1250,w:340,h:160,n:12,br:10},{x:30,y:2100,w:340,h:200,n:18,br:8}];
  return {id:'ball-pit-run',w:W,h:FY+CD+10,fy:FY,...fi,ramps,obs,wm,fn,sp,g:{x:0,y:1.0,scale:0.001},pits};
}

function buildPegStorm() {
  const D=55, CYS=[300,520,740,1500,1720,1940], PZ=[1100,2350], FY=2700, CD=220;
  const ramps = CYS.map((cy,i)=>({pts:rampPts(cy,i%2===0,D),cy}));
  const obs = [];
  PZ.forEach((pegY) => {
    const rows=4, cols=5, hs=60, vs=32;
    for(let r=0;r<rows;r++){const off=r%2===0?0:hs/2;for(let c=0;c<cols;c++){
      const px=50+off+c*hs, py=pegY-(rows*vs)/2+r*vs;
      if(px>25&&px<W-25){const rad=(r+c)%5===0?10:(r+c)%3===0?8:5;obs.push({x:px,y:py,r:rad,type:'peg'});}
    }}
  });
  const mids=[(300+520)/2,(520+740)/2,(1500+1720)/2,(1720+1940)/2];
  mids.forEach(m=>obs.push({x:130,y:m,r:14,type:'bumper'},{x:270,y:m,r:14,type:'bumper'}));
  obs.push(...gapBumpers(900,30),...gapBumpers(1420,25),...gapBumpers(2100,30));
  const wm = [
    {x:200,y:(300+520)/2,w:300,s:0.009},
    {x:200,y:(1500+1720)/2,w:280,s:0.01},
  ];
  PZ.forEach(y=>wm.push({x:200,y:y-70,w:140,s:0.04}));
  const fn = PZ.map(y=>mkFunnel(y,200,70));
  const sp = mkSprings(CYS,D), fi = mkFinish(FY);
  return {id:'peg-storm',w:W,h:FY+CD+10,fy:FY,...fi,ramps,obs,wm,fn,sp,g:{x:0,y:1.0,scale:0.001}};
}

function buildCradleDrop() {
  const D=60, CYS=[300,520,740,1500,1720,1940], PZ=[1150,2350], FY=2700, CD=220;
  const ramps = CYS.map((cy,i)=>({pts:rampPts(cy,i%2===0,D),cy}));
  const obs = [];
  PZ.forEach(y => obs.push(...mkPegs(y,3,5,65,35)));
  obs.push(...gapPegs(820,2),...gapPegs(1300,2),...gapPegs(2050,2));
  const wm = [{x:200,y:(300+520)/2,w:300,s:0.007},{x:200,y:(1500+1720)/2,w:280,s:0.008}];
  const fn = PZ.map(y=>mkFunnel(y,200,70));
  const sp = mkSprings(CYS,D), fi = mkFinish(FY);
  const cradles = [
    {x:200,y:860,n:5,sp:22,len:80,br:11},{x:200,y:1350,n:5,sp:22,len:75,br:11},
    {x:200,y:2100,n:5,sp:22,len:80,br:11},{x:200,y:2500,n:5,sp:22,len:70,br:11},
  ];
  return {id:'cradle-drop',w:W,h:FY+CD+10,fy:FY,...fi,ramps,obs,wm,fn,sp,g:{x:0,y:1.0,scale:0.001},cradles};
}

function buildTrampolinePark() {
  const D=55, CYS=[300,520,740,1500,1720,1940], PZ=[1150,2350], FY=2700, CD=220;
  const ramps = CYS.map((cy,i)=>({pts:rampPts(cy,i%2===0,D),cy}));
  const obs = [];
  // Light pegs only — trampolines are the main obstacle
  PZ.forEach(y => obs.push(...mkPegs(y,3,4,70,35)));
  // No gapPegs — trampolines fill gaps instead
  const wm = [{x:200,y:(1500+1720)/2,w:280,s:0.007}];
  // No funnels — they create bottlenecks with 8 marbles
  const fn = [];
  const sp = mkSprings(CYS,D), fi = mkFinish(FY);
  const tramps = [
    {x:120,y:900,w:70,str:5},{x:280,y:960,w:70,str:5},{x:200,y:1050,w:60,str:4},
    {x:150,y:1300,w:70,str:5},{x:250,y:1400,w:70,str:5},
    {x:120,y:2100,w:70,str:5},{x:280,y:2180,w:70,str:5},{x:200,y:2280,w:60,str:4},
  ];
  return {id:'trampoline-park',w:W,h:FY+CD+10,fy:FY,...fi,ramps,obs,wm,fn,sp,g:{x:0,y:1.0,scale:0.001},tramps};
}

function buildTerrainValley() {
  const D=60, CYS=[300,480,660,850,1050,1500,1680,1860,2050], PZ=[1300,2350], FY=2700, CD=220;
  const ramps = CYS.map((cy,i)=>({pts:rampPts(cy,i%2===0,D),cy}));
  const obs = [];
  // First peg zone (y=1300): moderate density
  obs.push(...mkPegs(1300,3,5,65,35));
  // Second peg zone (y=2350): lighter — was causing bottleneck with funnels
  obs.push(...mkPegs(2350,3,4,70,35));
  const m01=(300+480)/2, m34=(850+1050)/2, m67=(1680+1860)/2;
  obs.push({x:150,y:m01,r:14,type:'bumper'},{x:250,y:m01+20,r:14,type:'bumper'});
  obs.push({x:200,y:m34,r:16,type:'bumper'},{x:120,y:m34+30,r:12,type:'bumper'},{x:280,y:m34+30,r:12,type:'bumper'});
  obs.push({x:150,y:m67,r:14,type:'bumper'},{x:250,y:m67+20,r:14,type:'bumper'});
  obs.push(...gapBumpers(2200,40));
  const wm = [{x:200,y:m01,w:300,s:0.007},{x:200,y:m34,w:280,s:0.008},{x:200,y:m67,w:260,s:0.008}];
  PZ.forEach(y=>wm.push({x:200,y:y-80,w:120,s:0.04}));
  // No funnels — they create bottlenecks with 8 marbles
  const fn = [];
  const sp = mkSprings(CYS,D), fi = mkFinish(FY);
  return {id:'terrain-valley',w:W,h:FY+CD+10,fy:FY,...fi,ramps,obs,wm,fn,sp,g:{x:0,y:1.0,scale:0.001}};
}

function buildGauntlet() {
  const D=60, CYS=[300,520,740,1500,1720,1940], PZ=[1100,2300], FY=2750, CD=220;
  const ramps = CYS.map((cy,i)=>({pts:rampPts(cy,i%2===0,D),cy}));
  const obs = [];
  PZ.forEach(y => obs.push(...mkPegs(y,4,6,55,32)));
  obs.push({x:150,y:(520+740)/2,r:14,type:'bumper'},{x:250,y:(520+740)/2,r:14,type:'bumper'},{x:200,y:(1720+1940)/2,r:16,type:'bumper'});
  obs.push(...gapBumpers(900,25),...gapPegs(1300,2),...gapBumpers(2100,25));
  const wm = [
    {x:200,y:(300+520)/2,w:300,s:0.008},{x:200,y:900,w:200,s:0.01},
    {x:200,y:(1500+1720)/2,w:280,s:0.009},
  ];
  PZ.forEach(y=>wm.push({x:200,y:y-70,w:130,s:0.04}));
  const fn = PZ.map(y=>mkFunnel(y,180,60));
  const sp = mkSprings(CYS,D), fi = mkFinish(FY);
  const pend = [{ax:200,ay:860,len:110,br:18,vx:7},{ax:200,ay:2050,len:120,br:20,vx:-8},{ax:150,ay:2500,len:100,br:16,vx:6}];
  const tramps = [{x:120,y:460,w:70,str:8},{x:280,y:680,w:70,str:8},{x:200,y:1300,w:80,str:9},{x:150,y:2550,w:70,str:7},{x:250,y:2560,w:70,str:7}];
  const cradles = [{x:200,y:1300,n:5,sp:22,len:70,br:11},{x:200,y:2450,n:5,sp:22,len:65,br:11}];
  const pits = [{x:50,y:1220,w:300,h:150,n:12,br:8}];
  return {id:'gauntlet',w:W,h:FY+CD+10,fy:FY,...fi,ramps,obs,wm,fn,sp,g:{x:0,y:1.0,scale:0.001},pend,tramps,cradles,pits};
}

const TRACKS = {
  'classic-zigzag':buildClassicZigzag,'bumper-blitz':buildBumperBlitz,
  'pendulum-alley':buildPendulumAlley,'ball-pit-run':buildBallPitRun,
  'peg-storm':buildPegStorm,'cradle-drop':buildCradleDrop,
  'trampoline-park':buildTrampolinePark,'terrain-valley':buildTerrainValley,
  'gauntlet':buildGauntlet,
};

// ═══════════════════════════════════════════
// RACE SIMULATION
// ═══════════════════════════════════════════
function simulateRace(trackId) {
  const track = TRACKS[trackId]();
  const engine = Engine.create({ gravity: track.g, positionIterations:10, velocityIterations:8 });
  const world = engine.world;

  // Walls (avalanche demo: near-zero friction, low restitution)
  Composite.add(world, [
    Bodies.rectangle(0, track.h/2, 50, track.h+200, {isStatic:true,friction:0.01,restitution:0.3}),
    Bodies.rectangle(W, track.h/2, 50, track.h+200, {isStatic:true,friction:0.01,restitution:0.3}),
    Bodies.rectangle(W/2, -25, W+100, 50, {isStatic:true,friction:0.01,restitution:0.3}),
    Bodies.rectangle(W/2, track.h+25, W+100, 50, {isStatic:true,friction:0.3,restitution:0.1}),
  ]);

  // Ramps
  track.ramps.forEach(ramp => {
    for (let j=0; j<ramp.pts.length-1; j++) {
      const a=ramp.pts[j], b=ramp.pts[j+1];
      const dx=b.x-a.x, dy=b.y-a.y, len=Math.sqrt(dx*dx+dy*dy);
      Composite.add(world, Bodies.rectangle((a.x+b.x)/2,(a.y+b.y)/2,len+6,14,{
        isStatic:true,angle:Math.atan2(dy,dx),friction:0.005,restitution:0.3,chamfer:{radius:4},label:'ramp',
      }));
    }
  });

  // Bumpers & pegs
  track.obs.forEach(o => {
    Composite.add(world, Bodies.circle(o.x,o.y,o.r,{
      isStatic:true, restitution:o.type==='bumper'?0.6:0.3, friction:0.005, label:o.type,
    }));
  });

  // Funnels
  track.fn.forEach(f => {
    const dy=f.y2-f.y1;
    const ldx=f.lx2-f.lx1, lLen=Math.sqrt(ldx*ldx+dy*dy);
    Composite.add(world, Bodies.rectangle((f.lx1+f.lx2)/2,(f.y1+f.y2)/2,lLen,12,{isStatic:true,angle:Math.atan2(dy,ldx),friction:0.005,restitution:0.35,label:'funnel'}));
    const rdx=f.rx2-f.rx1, rLen=Math.sqrt(rdx*rdx+dy*dy);
    Composite.add(world, Bodies.rectangle((f.rx1+f.rx2)/2,(f.y1+f.y2)/2,rLen,12,{isStatic:true,angle:Math.atan2(dy,rdx),friction:0.005,restitution:0.35,label:'funnel'}));
  });

  // Finish zone
  const ff = track.funnel;
  const fdy=ff.y2-ff.y1;
  const fldx=ff.lx2-ff.lx1, flLen=Math.sqrt(fldx*fldx+fdy*fdy);
  Composite.add(world, Bodies.rectangle((ff.lx1+ff.lx2)/2,(ff.y1+ff.y2)/2,flLen,14,{isStatic:true,angle:Math.atan2(fdy,fldx),friction:0.005,restitution:0.3}));
  const frdx=ff.rx2-ff.rx1, frLen=Math.sqrt(frdx*frdx+fdy*fdy);
  Composite.add(world, Bodies.rectangle((ff.rx1+ff.rx2)/2,(ff.y1+ff.y2)/2,frLen,14,{isStatic:true,angle:Math.atan2(fdy,frdx),friction:0.005,restitution:0.3}));
  Composite.add(world, Bodies.rectangle(track.cl-5, track.fy+track.cd/2, 10, track.cd+20, {isStatic:true,friction:0.005,restitution:0.2}));
  Composite.add(world, Bodies.rectangle(track.cr+5, track.fy+track.cd/2, 10, track.cd+20, {isStatic:true,friction:0.005,restitution:0.2}));
  Composite.add(world, Bodies.rectangle(track.cx, track.fy+track.cd+10, (track.cr-track.cl)+20, 14, {isStatic:true,friction:0.3,restitution:0.1}));

  // Windmills
  const wmBodies = [];
  track.wm.forEach(wm => {
    const blade = Bodies.rectangle(wm.x,wm.y,wm.w,8,{isStatic:true,friction:0.01,restitution:0.5,label:'windmill'});
    Composite.add(world, blade);
    wmBodies.push({body:blade,...wm});
  });

  // Springs
  const springBounce = new Map();
  track.sp.forEach(sp => {
    const body = Bodies.rectangle(sp.x,sp.y,sp.w,sp.h,{isStatic:true,restitution:0.8,friction:0.005,label:'spring',chamfer:{radius:2}});
    springBounce.set(body,0);
    Composite.add(world, body);
  });

  // Pendulums
  if (track.pend) {
    track.pend.forEach(p => {
      const bob = Bodies.circle(p.ax,p.ay+p.len,p.br,{
        density:0.02,restitution:0.6,friction:0.005,frictionAir:0.005,label:'pendulum-bob',collisionFilter:OBS_F,
      });
      Composite.add(world, [bob, Constraint.create({pointA:{x:p.ax,y:p.ay},bodyB:bob,length:p.len,stiffness:1,damping:0})]);
      Body.setVelocity(bob,{x:p.vx,y:0});
    });
  }

  // Ball pits
  if (track.pits) {
    track.pits.forEach(pit => {
      const cols=Math.floor(pit.w/(pit.br*3)), rows=Math.ceil(pit.n/cols);
      for(let i=0;i<pit.n;i++){
        const col=i%cols, row=Math.floor(i/cols), offX=row%2===0?0:pit.br*1.5;
        const bx=pit.x+pit.br*2+col*(pit.w/cols)+offX, by=pit.y+pit.br*2+row*(pit.h/Math.max(1,rows));
        Composite.add(world, Bodies.circle(bx,by,pit.br,{density:0.001,restitution:0.5,friction:0.005,frictionAir:0.01,label:'pit-ball',collisionFilter:OBS_F}));
      }
    });
  }

  // Cradles
  if (track.cradles) {
    track.cradles.forEach(c => {
      const bobs = [];
      for(let i=0;i<c.n;i++){
        const bx=c.x-(c.n-1)*c.sp/2+i*c.sp;
        const bob = Bodies.circle(bx,c.y+c.len,c.br,{inertia:Infinity,restitution:1.0,friction:0,frictionAir:0,slop:c.br*0.02,label:'cradle-bob',collisionFilter:CRADLE_F});
        Composite.add(world, [bob, Constraint.create({pointA:{x:bx,y:c.y},bodyB:bob,length:c.len,stiffness:1,damping:0})]);
        bobs.push(bob);
      }
      if(bobs.length>0) Body.translate(bobs[0],{x:-c.sp*1.5,y:-c.len*0.15});
    });
  }

  // Trampolines
  const trampBodies = [];
  const trampBounce = new Map();
  if (track.tramps) {
    track.tramps.forEach(t => {
      const body = Bodies.rectangle(t.x,t.y,t.w,10,{isStatic:true,restitution:0.75,friction:0.005,label:'trampoline',chamfer:{radius:3}});
      trampBounce.set(body,0);
      Composite.add(world, body);
      trampBodies.push({body,config:t});
    });
  }

  // Collision events — force-based, not velocity override
  Events.on(engine, 'collisionStart', e => {
    e.pairs.forEach(pair => {
      const {bodyA,bodyB} = pair;
      let marble=null, spring=null;
      if(bodyA.label==='spring'&&!bodyB.isStatic){marble=bodyB;spring=bodyA;}
      else if(bodyB.label==='spring'&&!bodyA.isStatic){marble=bodyA;spring=bodyB;}
      if(marble&&spring){
        const cnt=springBounce.get(spring)||0;
        if(cnt>=7)return; springBounce.set(spring,cnt+1);
        if(cnt+1>=7)spring.restitution=0;
        const toC=marble.position.x<W/2?1:-1;
        Body.applyForce(marble,marble.position,{x:toC*0.0015*marble.mass,y:-0.002*marble.mass});
        return;
      }
      let tm=null,tb=null;
      if(bodyA.label==='trampoline'&&!bodyB.isStatic){tm=bodyB;tb=bodyA;}
      else if(bodyB.label==='trampoline'&&!bodyA.isStatic){tm=bodyA;tb=bodyB;}
      if(tm&&tb){
        const cnt=trampBounce.get(tb)||0;
        if(cnt>=10)return; trampBounce.set(tb,cnt+1);
        if(cnt+1>=10)tb.restitution=0.1;
        const tc=trampBodies.find(t=>t.body===tb);
        const str=tc?tc.config.str:5;
        Body.applyForce(tm,tm.position,{x:(Math.random()-0.5)*0.001*tm.mass,y:-str*0.0008*tm.mass});
      }
    });
  });

  // Scrambler + gate
  const scrambler = Bodies.rectangle(W/2,140,280,8,{isStatic:true,friction:0.01,restitution:0.5,label:'windmill'});
  Composite.add(world, scrambler);
  wmBodies.push({body:scrambler,x:W/2,y:140,w:280,s:0.04});

  const gate = Bodies.rectangle(W/2,230,W-20,10,{isStatic:true,friction:0.1,restitution:0.3,label:'gate'});
  Composite.add(world, gate);

  // Marbles
  const marbleBodies = [];
  const shuffled = [...MARBLES].sort(()=>Math.random()-0.5);
  shuffled.forEach((m,i) => {
    const sx=W/2+(Math.random()-0.5)*160, sy=40+i*16+(Math.random()-0.5)*8;
    const body = Bodies.circle(sx,sy,11,{
      restitution:0.48+m.stats.bounce*0.01, friction:0.00001, frictionStatic:0.1,
      density:0.001+m.stats.power*0.00005, frictionAir:0.008-m.stats.speed*0.0005,
      label:m.id, collisionFilter:MARBLE_F,
    });
    Body.setVelocity(body,{x:(Math.random()-0.5)*1.5,y:0.3+Math.random()*0.3});
    Composite.add(world, body);
    marbleBodies.push({body,data:m});
  });

  // ─── Run simulation ───
  // Let marbles settle for 60 frames behind gate
  for (let i=0; i<60; i++) {
    wmBodies.forEach(wm => Body.setAngle(wm.body, wm.body.angle+wm.s));
    for (let s=0; s<SUBSTEPS; s++) Engine.update(engine, FIXED_DT);
  }

  // Open gate
  Composite.remove(world, gate);
  Composite.remove(world, scrambler);
  const scrIdx = wmBodies.findIndex(w=>w.body===scrambler);
  if(scrIdx>=0) wmBodies.splice(scrIdx,1);

  let elapsed = 0;
  const finishTimes = {};
  const stuckTracker = new Map();
  const stuckEvents = []; // Track where marbles get stuck
  const positionLog = []; // Snapshot every 5s
  const stuckKickCount = new Map(); // Progressive kick tracking

  // Doomsday bar state
  const DOOMSDAY_TRIGGER_MS = 45000;
  const DOOMSDAY_DEADLINE_MS = 60000;
  const DOOMSDAY_BAR_HEIGHT = 20;
  let doomsdayBar = null;
  let doomsdayBarActive = false;
  let doomsdayBarStartY = 0;
  let doomsdayBarStartTime = 0;
  let doomsdayBarEndY = 0;
  let doomsdayBarDuration = 0;

  const MAX_FRAMES = 65 * 60; // 65 seconds at 60fps (beyond doomsday deadline)
  const SNAPSHOT_INTERVAL = 5 * 60; // every 5s

  for (let frame=0; frame<MAX_FRAMES; frame++) {
    elapsed += 16.67;

    // Doomsday bar — spawn and move BEFORE physics
    const unfinishedMarbles = marbleBodies.filter(({ data }) => !finishTimes[data.id]);
    if (!doomsdayBarActive && elapsed >= DOOMSDAY_TRIGGER_MS && unfinishedMarbles.length > 0) {
      let highestY = Infinity;
      for (const { body } of unfinishedMarbles) {
        if (body.position.y < highestY) highestY = body.position.y;
      }
      doomsdayBarStartY = highestY - 100;
      doomsdayBarStartTime = elapsed;
      doomsdayBarEndY = track.fy + 50;
      doomsdayBarDuration = DOOMSDAY_DEADLINE_MS - elapsed;
      doomsdayBar = Bodies.rectangle(W / 2, doomsdayBarStartY, W + 100, DOOMSDAY_BAR_HEIGHT, {
        isStatic: true, friction: 0.1, restitution: 0.3,
        label: 'doomsday-bar', collisionFilter: DOOMSDAY_F,
      });
      Composite.add(world, doomsdayBar);
      doomsdayBarActive = true;
    }
    if (doomsdayBarActive && doomsdayBar) {
      const progress = Math.min(1, (elapsed - doomsdayBarStartTime) / Math.max(doomsdayBarDuration, 1));
      const newY = doomsdayBarStartY + progress * (doomsdayBarEndY - doomsdayBarStartY);
      if (newY >= track.fy + 50) {
        Composite.remove(world, doomsdayBar);
        doomsdayBar = null;
        doomsdayBarActive = false;
      } else {
        const speed = (doomsdayBarEndY - doomsdayBarStartY) / (doomsdayBarDuration / 16.67);
        Body.setVelocity(doomsdayBar, { x: 0, y: speed });
        Body.setPosition(doomsdayBar, { x: W / 2, y: newY });
      }
    }

    // Windmill rotation
    wmBodies.forEach(wm => Body.setAngle(wm.body, wm.body.angle+wm.s));

    // Substeps
    for (let s=0; s<SUBSTEPS; s++) Engine.update(engine, FIXED_DT);

    // Post-step
    marbleBodies.forEach(({body, data}) => {
      if (finishTimes[data.id]) return;

      // Velocity cap
      const vx=body.velocity.x, vy=body.velocity.y;
      const speed=Math.sqrt(vx*vx+vy*vy);
      if(speed>15){const sc=15/speed;Body.setVelocity(body,{x:vx*sc,y:vy*sc});}

      // Luck nudge — gentle
      if (Math.random()<0.005*data.stats.luck) {
        Body.applyForce(body,body.position,{x:(Math.random()-0.5)*0.0003*body.mass,y:0});
      }

      // Stuck detection — 0.8s/4px threshold, aggressive velocity kick
      const last = stuckTracker.get(data.id);
      if (last) {
        const dx=body.position.x-last.x, dy=body.position.y-last.y;
        const dist=Math.sqrt(dx*dx+dy*dy);
        if (dist<4 && elapsed-last.t>800) {
          const kicks = (stuckKickCount.get(data.id) || 0) + 1;
          stuckKickCount.set(data.id, kicks);
          const mult = Math.min(kicks, 5);
          stuckEvents.push({
            marble: data.name,
            x: Math.round(body.position.x),
            y: Math.round(body.position.y),
            time: (elapsed/1000).toFixed(1)+'s',
          });
          Body.setVelocity(body,{x:(Math.random()-0.5)*5*mult,y:4+Math.random()*2*mult});
          stuckTracker.set(data.id,{x:body.position.x,y:body.position.y,t:elapsed});
        } else if (dist>=4) {
          stuckTracker.set(data.id,{x:body.position.x,y:body.position.y,t:elapsed});
        }
      } else {
        stuckTracker.set(data.id,{x:body.position.x,y:body.position.y,t:elapsed});
      }

      // Finish detection — gradual slowdown
      if (body.position.y >= track.fy) {
        finishTimes[data.id] = elapsed;
        body.frictionAir = 0.15;
        body.restitution = 0.1;
        body.friction = 0.3;
      }

      // Escape detection
      if (body.position.x < -20 || body.position.x > W+20 || body.position.y < -100) {
        stuckEvents.push({
          marble: data.name, x: Math.round(body.position.x), y: Math.round(body.position.y),
          time: (elapsed/1000).toFixed(1)+'s', type: 'ESCAPED'
        });
      }
    });

    // Position snapshot
    if (frame % SNAPSHOT_INTERVAL === 0 && frame > 0) {
      const snap = {};
      marbleBodies.forEach(({body,data}) => {
        snap[data.name] = {
          x: Math.round(body.position.x),
          y: Math.round(body.position.y),
          finished: !!finishTimes[data.id],
        };
      });
      positionLog.push({ time: (elapsed/1000).toFixed(0)+'s', positions: snap });
    }

    // Check if all finished
    if (Object.keys(finishTimes).length >= MARBLES.length) break;
  }

  // Force-finish any remaining
  marbleBodies.forEach(({data,body}) => {
    if (!finishTimes[data.id]) finishTimes[data.id] = elapsed + (track.fy-body.position.y)*8;
  });

  // Results
  const results = marbleBodies
    .map(({data,body}) => ({name:data.name, time:finishTimes[data.id], y:Math.round(body.position.y)}))
    .sort((a,b) => a.time-b.time);

  const bodyCount = Composite.allBodies(world).length;
  const finishedNaturally = Object.keys(finishTimes).filter(id => {
    const m = marbleBodies.find(mb=>mb.data.id===id);
    return m && m.body.position.y >= track.fy - 50;
  }).length;

  Engine.clear(engine);

  return {
    trackId, bodyCount,
    totalTime: (elapsed/1000).toFixed(1)+'s',
    finishedNaturally,
    totalMarbles: MARBLES.length,
    results, stuckEvents, positionLog,
    finishY: track.fy,
    trackHeight: track.h,
    obstacleCount: track.obs.length,
    bumperCount: track.obs.filter(o=>o.type==='bumper').length,
    pegCount: track.obs.filter(o=>o.type==='peg').length,
  };
}

// ═══════════════════════════════════════════
// REPORT
// ═══════════════════════════════════════════
function printReport(r) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  TRACK: ${r.trackId.toUpperCase()}`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`  Bodies: ${r.bodyCount} | Obstacles: ${r.obstacleCount} (${r.bumperCount} bumpers, ${r.pegCount} pegs)`);
  console.log(`  Track height: ${r.trackHeight} | Finish Y: ${r.finishY}`);
  console.log(`  Race time: ${r.totalTime} | Finished naturally: ${r.finishedNaturally}/${r.totalMarbles}`);

  console.log(`\n  RESULTS:`);
  r.results.forEach((m,i) => {
    const pos = i+1;
    const flag = m.y < r.finishY - 50 ? ' ⚠ DID NOT REACH FINISH' : '';
    console.log(`    #${pos} ${m.name.padEnd(8)} ${(m.time/1000).toFixed(1)}s  (final y=${m.y})${flag}`);
  });

  if (r.stuckEvents.length > 0) {
    console.log(`\n  STUCK EVENTS (${r.stuckEvents.length}):`);
    // Group by location
    const zones = {};
    r.stuckEvents.forEach(e => {
      const zoneY = Math.round(e.y/100)*100;
      const key = `y≈${zoneY}`;
      if (!zones[key]) zones[key] = [];
      zones[key].push(e);
    });
    Object.entries(zones).sort((a,b)=>parseInt(a[0].slice(2))-parseInt(b[0].slice(2))).forEach(([zone,events]) => {
      const names = [...new Set(events.map(e=>e.marble))].join(', ');
      console.log(`    ${zone}: ${events.length}x stuck — ${names}`);
      if (events[0].type === 'ESCAPED') console.log(`      ⚠ MARBLE ESCAPED THE COURSE!`);
    });
  } else {
    console.log(`\n  ✓ No stuck events detected`);
  }

  if (r.positionLog.length > 0) {
    console.log(`\n  POSITION SNAPSHOTS:`);
    r.positionLog.forEach(snap => {
      const marbles = Object.entries(snap.positions);
      const avgY = Math.round(marbles.reduce((s,[_,p])=>s+p.y,0)/marbles.length);
      const finished = marbles.filter(([_,p])=>p.finished).length;
      const spread = Math.round(Math.max(...marbles.map(([_,p])=>p.y)) - Math.min(...marbles.map(([_,p])=>p.y)));
      console.log(`    ${snap.time.padStart(4)}: avgY=${avgY}, spread=${spread}px, finished=${finished}/8`);
    });
  }
}

// ═══════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════
const targetTrack = process.argv[2];
const trackIds = targetTrack ? [targetTrack] : Object.keys(TRACKS);

console.log(`\nDonkeyMarbleRacing — Track Physics Test`);
console.log(`Testing ${trackIds.length} track(s)...\n`);

const allResults = [];
trackIds.forEach(id => {
  if (!TRACKS[id]) { console.log(`Unknown track: ${id}`); return; }
  // Run 3 times per track to catch intermittent issues
  const runs = [];
  for (let run=0; run<3; run++) {
    runs.push(simulateRace(id));
  }

  // Report the worst run (most stuck events)
  runs.sort((a,b) => b.stuckEvents.length - a.stuckEvents.length);
  const worst = runs[0];
  const avgTime = (runs.reduce((s,r)=>s+parseFloat(r.totalTime),0)/3).toFixed(1);
  const avgFinished = Math.round(runs.reduce((s,r)=>s+r.finishedNaturally,0)/3);
  const totalStuck = runs.reduce((s,r)=>s+r.stuckEvents.length,0);

  console.log(`[${id}] 3 runs: avg=${avgTime}s, avgFinished=${avgFinished}/8, totalStuckEvents=${totalStuck}`);
  printReport(worst);
  allResults.push({id, avgTime, avgFinished, totalStuck, worst});
});

// Summary
console.log(`\n${'═'.repeat(60)}`);
console.log(`  SUMMARY`);
console.log(`${'═'.repeat(60)}`);
allResults.forEach(r => {
  const status = r.avgFinished >= 8 ? '✓' : r.avgFinished >= 6 ? '⚠' : '✗';
  console.log(`  ${status} ${r.id.padEnd(20)} avg=${r.avgTime}s  finished=${r.avgFinished}/8  stuckTotal=${r.totalStuck}`);
});
console.log('');
