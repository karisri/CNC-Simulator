let scene, camera, renderer;
let tool, stock;

let pos = {x:0,y:60,z:0};
let commands = [];
let index = 0;

let mode = "G90";
let toolRadius = 6;

let history = [];
let paused = false;
let running = false;
let initialGeo = null;

// ---------------- INIT ----------------
function init(){

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  camera = new THREE.PerspectiveCamera(70,innerWidth/innerHeight,0.1,4000);
  camera.position.set(220,180,220);
  camera.lookAt(0,0,0);

  renderer = new THREE.WebGLRenderer({
    canvas: document.getElementById("cnc"),
    antialias: true
  });

  renderer.setSize(innerWidth,innerHeight);

  scene.add(new THREE.AmbientLight(0xffffff,0.5));

  const light = new THREE.DirectionalLight(0xffffff,1);
  light.position.set(200,200,100);
  scene.add(light);

  tool = new THREE.Mesh(
    new THREE.CylinderGeometry(2,2,15,20),
    new THREE.MeshStandardMaterial({color:0xff0000})
  );

  scene.add(tool);

  animate();
}

// ---------------- STOCK ----------------
function createStock(){

  if(stock) scene.remove(stock);

  const sx = +sxv("sx");
  const sy = +sxv("sy");
  const sz = +sxv("sz");

  stock = new THREE.Mesh(
    new THREE.BoxGeometry(sx,sy,sz,20,10,20),
    new THREE.MeshStandardMaterial({color: sxv("matColor")})
  );

  stock.position.y = sy/2;
  scene.add(stock);

  initialGeo = Float32Array.from(stock.geometry.attributes.position.array);
}

// helper
function sxv(id){
  return document.getElementById(id).value;
}

// ---------------- CUT ----------------
function cut(){

  let arr = stock.geometry.attributes.position;

  for(let i=0;i<arr.count;i++){

    let dx = arr.getX(i)-pos.x;
    let dy = arr.getY(i)-pos.y;
    let dz = arr.getZ(i)-pos.z;

    let d = Math.sqrt(dx*dx+dy*dy+dz*dz);

    if(d < toolRadius){
      arr.setY(i, arr.getY(i) - (toolRadius-d)*0.2);

      stock.material.color.set(sxv("remColor"));
    }
  }

  arr.needsUpdate = true;
}

// ---------------- MOVE ----------------
function move(target,feed=800,rapid=false){

  return new Promise(res=>{

    let start={...pos};
    let t0=performance.now();

    let dist=Math.hypot(
      target.x-start.x,
      target.y-start.y,
      target.z-start.z
    );

    let duration=rapid?150:(dist/feed)*60000;

    function step(t){

      if(paused){
        requestAnimationFrame(step);
        return;
      }

      let k=Math.min(1,(t-t0)/duration);

      pos.x=start.x+(target.x-start.x)*k;
      pos.y=start.y+(target.y-start.y)*k;
      pos.z=start.z+(target.z-start.z)*k;

      tool.position.set(pos.x,pos.y,pos.z);

      if(mode==="G1") cut();

      if(k<1) requestAnimationFrame(step);
      else res();
    }

    requestAnimationFrame(step);
  });
}

// ---------------- SAVE ----------------
function saveState(){
  history.push({
    pos:{...pos},
    index,
    mode,
    geo: Float32Array.from(stock.geometry.attributes.position.array)
  });
}

// ---------------- RESTORE ----------------
function restore(s){

  pos={...s.pos};
  index=s.index;
  mode=s.mode;

  let arr=stock.geometry.attributes.position;

  for(let i=0;i<arr.count;i++){
    arr.setX(i,s.geo[i*3]);
    arr.setY(i,s.geo[i*3+1]);
    arr.setZ(i,s.geo[i*3+2]);
  }

  arr.needsUpdate=true;
  tool.position.set(pos.x,pos.y,pos.z);
}

// ---------------- STEP ----------------
async function step(dir=1){

  if(dir===-1){
    if(history.length===0) return;
    restore(history.pop());
    return;
  }

  if(index>=commands.length) return;

  saveState();

  let c=commands[index];
  let target={...pos};

  if(mode==="G90"){
    if(c.x!==undefined) target.x=c.x;
    if(c.y!==undefined) target.z=c.y;
    if(c.z!==undefined) target.y=c.z;
  }

  if(c.type==="G0") await move(target,c.f,true);
  if(c.type==="G1") await move(target,c.f,false);

  index++;
}

// ---------------- RUN (FIXED) ----------------
async function run(){

  commands=parse(document.getElementById("gcode").value);
  index=0;
  history=[];
  paused=false;
  running=true;

  while(index<commands.length && running){

    if(paused){
      await new Promise(r=>setTimeout(r,100));
      continue;
    }

    await step(1);
  }

  running=false;
}

// ---------------- PAUSE ----------------
function pauseSim(){
  paused=!paused;
}

// ---------------- RESET (FIXED) ----------------
function resetSim(){

  running=false;
  paused=false;
  index=0;
  history=[];
  pos={x:0,y:60,z:0};

  if(stock && initialGeo){

    let arr=stock.geometry.attributes.position;

    for(let i=0;i<arr.count;i++){
      arr.setX(i,initialGeo[i*3]);
      arr.setY(i,initialGeo[i*3+1]);
      arr.setZ(i,initialGeo[i*3+2]);
    }

    arr.needsUpdate=true;

    stock.material.color.set(sxv("matColor"));
  }

  tool.position.set(pos.x,pos.y,pos.z);
}

// ---------------- PARSER ----------------
function parse(code){

  return code.split("\n").map(l=>{

    let c={type:"G0"};
    let p=l.match(/[A-Z][\-0-9.]+/g)||[];

    p.forEach(x=>{
      let k=x[0],v=parseFloat(x.slice(1));

      if(k==="G") c.type="G"+v;
      if(k==="X") c.x=v;
      if(k==="Y") c.y=v;
      if(k==="Z") c.z=v;
      if(k==="F") c.f=v;
    });

    return c;
  });
}

// ---------------- LOOP ----------------
function animate(){
  requestAnimationFrame(animate);
  renderer.render(scene,camera);
}

init();