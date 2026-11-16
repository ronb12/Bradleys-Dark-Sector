/**
 * Original Dark Sector opposition weapon props, built for animated NPCs.
 * Muzzle points toward local -Z; matches enemyWeapons.ts fire rays.
 * They deliberately avoid player-view gloves and costly imported GLBs.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

type EnemyGunClass = "ak47" | "pistol";
const black=new THREE.MeshStandardMaterial({color:0x1b242b,roughness:0.69,metalness:0.34});
const gunmetal=new THREE.MeshStandardMaterial({color:0x3f4f58,roughness:0.41,metalness:0.65});
const grip=new THREE.MeshStandardMaterial({color:0x171d1d,roughness:0.93,metalness:0.01});
const sight=new THREE.MeshStandardMaterial({color:0x59605e,roughness:0.45,metalness:0.49});
const geometryCache = new Map<string, RoundedBoxGeometry>();

function part(root:THREE.Object3D,name:string,w:number,h:number,d:number,x:number,y:number,z:number,
              mat:THREE.Material,rad=0.016) {
  const rounded=Math.min(rad,w*.3,h*.3,d*.3);
  const key=`${w}/${h}/${d}/${rounded}`;
  let geom=geometryCache.get(key);
  if(!geom){geom=new RoundedBoxGeometry(w,h,d,2,rounded);geometryCache.set(key,geom);}
  const obj=new THREE.Mesh(geom,mat);
  obj.name=name;obj.position.set(x,y,z);root.add(obj);return obj;
}
export function createOriginalEnemyWeapon(kind:EnemyGunClass): THREE.Group {
  const root=new THREE.Group();
  root.name=kind==="pistol"?"DS C-7 Security Sidearm":"DS R-9 Carbine";
  root.userData.darkSectorOriginal=true;
  if(kind==="pistol") {
    part(root,"PistolMachinedSlide",.11,.08,.33,0,.06,-.02,gunmetal);
    part(root,"PistolLowerFrame",.10,.07,.26,0,-.01,.025,black);
    const hand=part(root,"TexturedPolymerGrip",.095,.22,.10,0,-.13,.09,grip);
    hand.rotation.x=-.20;
    part(root,"PistolTriggerGuard",.09,.045,.11,0,-.065,-.045,sight);
    part(root,"PistolMuzzleBrake",.10,.07,.05,0,.045,-.185,black);
    part(root,"RearIronSight",.09,.025,.035,0,.115,.11,sight,.007);
    part(root,"FrontIronSight",.055,.027,.023,0,.116,-.16,sight,.006);
  } else {
    // Lightweight angular security rifle with prominent optic housing.
    part(root,"CarbineReceiver",.19,.16,.44,0,0,-.03,gunmetal);
    part(root,"CarbineForwardGuard",.21,.17,.39,0,0,-.42,black);
    part(root,"Barrel",.064,.065,.37,0,.015,-.65,gunmetal,.01);
    part(root,"Muzzle",.105,.081,.12,0,.015,-.8,black,.01);
    part(root,"Rail",.16,.045,.76,0,.105,-.23,sight,.011);
    for(let i=0;i<8;i++) part(root,"RailSlot",.16,.02,.025,0,.138,.10-i*.075,black,.005);
    for(const side of [-1,1]) {
      part(root,"HandguardVent",.02,.065,.26,side*.107,0,-.40,sight,.007);
    }
    part(root,"Buttstock",.17,.22,.30,0,-.02,.39,black);
    part(root,"ReceiverStockBrace",.09,.10,.34,0,.002,.21,gunmetal);
    const handle=part(root,"ErgoPistolGrip",.13,.29,.15,0,-.18,.18,grip);
    handle.rotation.x=-.24;
    const mag=part(root,"RifleMagazine",.13,.30,.18,0,-.24,-.13,black);
    mag.rotation.x=.13;
    part(root,"OpticMount",.08,.045,.14,0,.147,-.065,black);
    part(root,"CompactOptic",.13,.14,.18,0,.23,-.065,gunmetal);
    part(root,"OpticLens",.105,.085,.015,0,.24,-.161,sight,.005);
  }
  root.traverse(child=>{if(child instanceof THREE.Mesh){child.castShadow=false;child.receiveShadow=false;}});
  return root;
}
