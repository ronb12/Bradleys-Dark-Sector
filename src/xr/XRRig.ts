import * as THREE from "three";

/**
 * Locomotion origin for WebXR. Headset pose is applied under this group by
 * Three.js; we only translate/yaw the rig for stick movement and snap turn.
 */
export class XRRig {
  readonly root = new THREE.Group();
  private attached = false;

  constructor(scene: THREE.Scene, _camera: THREE.PerspectiveCamera) {
    this.root.name = "XRRig";
    scene.add(this.root);
  }

  get presentingAttached() {
    return this.attached;
  }

  enterSession(camera: THREE.PerspectiveCamera) {
    if (this.attached) return;
    this.root.add(camera);
    camera.position.set(0, 0, 0);
    camera.rotation.set(0, 0, 0);
    this.attached = true;
  }

  exitSession(camera: THREE.PerspectiveCamera, scene: THREE.Scene) {
    if (!this.attached) return;
    scene.add(camera);
    this.attached = false;
  }

  /** Sync rig feet to gameplay player position + yaw. */
  syncFromPlayer(position: THREE.Vector3, yaw: number) {
    this.root.position.set(position.x, position.y, position.z);
    this.root.rotation.set(0, yaw, 0);
  }

  /** Apply snap turn around vertical axis (radians). */
  snapTurn(deltaYaw: number) {
    this.root.rotation.y += deltaYaw;
  }

  getYaw() {
    return this.root.rotation.y;
  }

  getPosition(target = new THREE.Vector3()) {
    return target.copy(this.root.position);
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.root);
  }
}
