declare module "three/examples/jsm/loaders/GLTFLoader" {
  import { AnimationClip, Group, LoadingManager } from "three";

  export type GLTF = {
    scene: Group;
    animations: AnimationClip[];
  };

  export class GLTFLoader {
    constructor(manager?: LoadingManager);
    loadAsync(url: string): Promise<GLTF>;
  }
}

declare module "three/examples/jsm/loaders/FBXLoader" {
  import { Group, LoadingManager } from "three";

  export class FBXLoader {
    constructor(manager?: LoadingManager);
    loadAsync(url: string): Promise<Group>;
  }
}

declare module "three/examples/jsm/utils/SkeletonUtils" {
  import { Object3D } from "three";

  export function clone<T extends Object3D>(source: T): T;
}
