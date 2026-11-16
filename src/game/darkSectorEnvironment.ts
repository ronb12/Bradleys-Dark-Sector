/**
 * Bradley's Dark Sector original FOB props.
 * Authored with reusable geometry/materials rather than downloaded assets.
 * Colliders cover only the physical generator/crate, not tall antenna masts.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const paint = new THREE.MeshStandardMaterial({color:0x2e4144,roughness:.72,metalness:.33});
const armor = new THREE.MeshStandardMaterial({color:0x111d24,roughness:.56,metalness:.64});
const steel = new THREE.MeshStandardMaterial({color:0x78888c,roughness:.43,metalness:.7});
const rubber = new THREE.MeshStandardMaterial({color:0x0a1216,roughness:.92});
const ochre = new THREE.MeshStandardMaterial({color:0xe4ae45,roughness:.55,metalness:.2});
const light = new THREE.MeshStandardMaterial({color:0x86f5fa,emissive:0x16c9d9,emissiveIntensity:1.25,roughness:.3});

function panel(parent:THREE.Object3D,size:[number,number,number],at:[number,number,number],mat:THREE.Material){
  const mesh=new THREE.Mesh(new RoundedBoxGeometry(...size,2,0.02),mat);
  mesh.position.set(...at);
  mesh.castShadow=false; mesh.receiveShadow=true; parent.add(mesh);
  return mesh;
}

function screen(name:string):THREE.Mesh {
  const canvas=document.createElement("canvas");
  canvas.width=512;canvas.height=256;
  const g=canvas.getContext("2d")!;
  g.fillStyle="#071620";g.fillRect(0,0,512,256);
  g.strokeStyle="#216e87";g.lineWidth=8;g.strokeRect(14,14,484,228);
  g.font="bold 32px monospace";g.fillStyle="#b9ffff";g.fillText("DARK SECTOR",28,67);
  g.font="bold 21px monospace";g.fillStyle="#56cfd7";g.fillText(name.toUpperCase(),28,105);
  g.fillStyle="#8fb5b8";g.font="16px monospace";g.fillText("ENCRYPTED FIELD LINK",28,162);
  g.fillStyle="#6df2a8";g.fillRect(28,185,290,8);
  g.fillStyle="#edbd59";g.fillRect(28,205,115,7);
  const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;
  const m=new THREE.MeshBasicMaterial({map:tex,transparent:false,side:THREE.DoubleSide});
  return new THREE.Mesh(new THREE.PlaneGeometry(1.05,.52),m);
}

function makeCommandGenerator(name:string,mobile:boolean){
  const g=new THREE.Group();
  g.name="DarkSector/FieldGenerator/"+name;g.userData.darkSectorOriginal=true;
  panel(g,[2.15,.22,1.7],[0,.14,0],steel);
  panel(g,[2.0,1.32,1.55],[0,.85,0],armor);
  panel(g,[1.92,1.15,1.59],[0,.87,0],paint);
  for(const x of [-.84,.84]) {
    panel(g,[.15,1.5,1.75],[x,.85,0],armor);
    panel(g,[.18,.23,.28],[x,1.49,-.57],ochre);
    panel(g,[.22,.13,.35],[x,.23,.58],rubber);
  }
  // Original armored ventilation grille / frame and hazard strip.
  const vents=mobile?5:9;
  for(let i=0;i<vents;i++) {
    const z=-.58+i*(1.16/(vents-1));
    panel(g,[.035,.53,.075],[-1.005,1.01,z],i%2?steel:armor);
  }
  for(let i=0;i<6;i++){
    const x=-.66+i*.25;
    const hazard=panel(g,[.13,.045,.015],[x,.375,.791],i%2?ochre:rubber);
    hazard.rotation.z=-.28;
  }
  const display=screen(name);
  display.position.set(.32,1.08,.802);
  g.add(display);
  // Heavy duty grab handles and reinforced power connectors.
  for(const x of [-.65,.65]){
    panel(g,[.11,.07,.19],[x,1.43,.78],steel);
    panel(g,[.14,.1,.05],[x,1.26,.79],light);
  }
  // Telescoping radio tower with protected antenna + dish.
  const mast=new THREE.Mesh(new THREE.CylinderGeometry(.038,.055,2.4,9),steel);
  mast.position.set(.6,2.68,-.45);g.add(mast);
  const dish=new THREE.Mesh(new THREE.CylinderGeometry(.23,.23,.05,18),armor);
  dish.rotation.x=Math.PI/2;dish.position.set(.6,3.45,-.44);g.add(dish);
  panel(g,[.28,.04,.1],[.6,3.45,-.40],light);
  const beacon=new THREE.Mesh(new THREE.SphereGeometry(.09,9,7),light);
  beacon.position.set(.6,3.94,-.45);g.add(beacon);
  return g;
}

function makeSupplyCache(){
  const g=new THREE.Group();
  g.name="DarkSector/ArmoredSupplyCache";g.userData.darkSectorOriginal=true;
  panel(g,[1.45,.12,.96],[0,.08,0],steel);
  panel(g,[1.4,.82,.89],[0,.52,0],paint);
  panel(g,[1.42,.13,.9],[0,.99,0],armor);
  for(const x of [-.62,.62]){
    panel(g,[.13,.86,.97],[x,.53,0],steel);
    panel(g,[.22,.19,.1],[x,.85,.48],ochre);
  }
  for(const z of [-.36,.36]){
    panel(g,[1.42,.09,.09],[0,.51,z],rubber);
  }
  panel(g,[.42,.12,.03],[0,.79,.49],light);
  return g;
}

/**
 * Reusable field illumination props. The head units are emissive mesh fixtures,
 * not expensive point lights: mobile and Quest get the same silhouette.
 */
function makeSecurityFloodlight(mobile: boolean) {
  const root = new THREE.Group();
  root.name = "DarkSector/TacticalFloodlight";
  root.userData.darkSectorOriginal = true;
  panel(root, [0.88, 0.14, 0.85], [0, 0.07, 0], armor);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.082, 4.25, 8), steel);
  mast.position.y = 2.22;
  root.add(mast);
  panel(root, [1.55, 0.11, 0.13], [0, 4.29, 0], steel);
  const lamps = mobile ? [-0.45, 0.45] : [-0.55, 0, 0.55];
  for (const x of lamps) {
    panel(root, [0.42, 0.34, 0.14], [x, 4.23, -0.18], armor);
    panel(root, [0.34, 0.26, 0.025], [x, 4.24, -0.272], light);
  }
  // Cable conduit, power trunk, and the manual pivot lock.
  panel(root, [0.10, 1.22, 0.12], [0.12, 0.81, 0.03], rubber);
  panel(root, [0.32, 0.27, 0.24], [0.14, 1.26, 0.03], paint);
  return root;
}

function makeSecurityCheckpointSign() {
  const root = new THREE.Group();
  root.name = "DarkSector/SecurityGateSign";
  root.userData.darkSectorOriginal = true;
  for (const x of [-1.65, 1.65]) {
    panel(root, [0.15, 3.1, 0.19], [x, 1.55, 0], steel);
    panel(root, [0.42, 0.18, 0.42], [x, 0.1, 0], armor);
  }
  panel(root, [3.36, 1.15, 0.12], [0, 2.31, 0], armor);
  panel(root, [3.20, 1.01, 0.03], [0, 2.31, -0.083], paint);
  const canvas = document.createElement("canvas");
  canvas.width = 640; canvas.height = 240;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#19282f"; ctx.fillRect(0, 0, 640, 240);
  ctx.strokeStyle = "#bb9b57"; ctx.lineWidth = 12; ctx.strokeRect(6, 6, 628, 228);
  ctx.font = "bold 45px sans-serif"; ctx.fillStyle = "#c9e8e7";
  ctx.textAlign = "center"; ctx.fillText("DARK SECTOR", 320, 91);
  ctx.font = "bold 29px monospace"; ctx.fillStyle = "#e1b765";
  ctx.fillText("SECURITY CHECKPOINT", 320, 148);
  ctx.font = "20px monospace"; ctx.fillStyle = "#a5bfbe";
  ctx.fillText("AO-17  |  RESTRICTED ACCESS", 320, 194);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(3.03, 0.95),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  screen.position.set(0, 2.31, -0.108);
  root.add(screen);
  return root;
}

export function addOriginalFobProps(parent:THREE.Object3D,colliders:THREE.Box3[],mobile:boolean) {
  const stations:[string,number,number,number][]=[
    ["OUTPOST ALPHA",-14,4,0],
    ["OUTPOST BRAVO",14,-20,Math.PI],
  ];
  for(const [name,x,z,angle] of stations) {
    const root=makeCommandGenerator(name,mobile);
    root.position.set(x,0,z);root.rotation.y=angle;
    parent.add(root);
    // Only the physical enclosure stops player/enemy movement.
    colliders.push(new THREE.Box3(
      new THREE.Vector3(x-1.15,0,z-.88),
      new THREE.Vector3(x+1.15,1.65,z+.88)
    ));
    const cache=makeSupplyCache();
    cache.position.set(x+(x<0?-2.1:2.1),0,z+1.5);
    parent.add(cache);
    colliders.push(new THREE.Box3().setFromObject(cache));
  }

  // Clear road centerline and walking routes; these modules are visual-only.
  // The positions stay outside the immediate spawn and checkpoint approach.
  const lightPositions: Array<[number, number, number]> = [
    [-34, -8, 0.35], [34, -8, -0.35],
    [-28, 28, 0.65], [28, 28, -0.65],
  ];
  for (const [x, z, angle] of mobile ? lightPositions.slice(0, 2) : lightPositions) {
    const fixture = makeSecurityFloodlight(mobile);
    fixture.position.set(x, 0, z);
    fixture.rotation.y = angle;
    parent.add(fixture);
  }
  const sign = makeSecurityCheckpointSign();
  sign.position.set(0, 0, -42);
  sign.rotation.y = Math.PI;
  parent.add(sign);
}
