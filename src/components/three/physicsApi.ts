/** Actions on the physics world for UI outside the canvas; set while physics or manual mode is on. */
export interface PhysicsApi {
  /** Quarter turn about the vertical axis. */
  turn: (collId: number) => void;
  /** Quarter turn about the front-to-back axis: stands a flat box up, or lays an upright one down. */
  tip: (collId: number) => void;
}

export const physicsApi: { current: PhysicsApi | null } = { current: null };
