/**
 * The Lobby's 3D view: a LobbyScene seen as a floor is, from the south-east at the floors' angle, framed closer than a
 * floor (lobbyFrustum), with the floors' zoom, turn and tilt by mouse. It draws when something changed (the Lobby, the theme, the size, the camera),
 * not in a loop: nothing in the hall moves on its own.
 */
import { OrthographicCamera, PCFShadowMap } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MAX_POLAR, MAX_ZOOM, MIN_POLAR, MIN_ZOOM } from './camera';
import type { LobbyInput } from './lobby-layout';
import { LobbyScene, SIGN } from './lobby-scene';
import type { ThemeTokens } from './theme';
import { browserEnv, type RendererLike, type ViewEnv } from './view';
import { cameraOffset, FRAME_MARGIN, floorCenter, HOME_AZIMUTH, POLAR, type Frustum } from './world';

/** The share of the stage's width the hall takes from home, so that the signs over the elevators read. */
export const LOBBY_ROOM_SHARE = 0.85;
/** The most of the hall's height that may fall below the stage to keep that share: on a very wide stage the hall is framed less close. */
const LOBBY_MAX_CROP = 0.25;
/** The top of the hall: the signs over the elevators, above the walls. */
const LOBBY_TOP = SIGN.y + SIGN.h / 2;

/**
 * The Lobby's frame from home: the hall across LOBBY_ROOM_SHARE of the stage's width, its north wall with the
 * elevators' signs kept in view, the south end let fall below the stage when the stage is too wide for all of it.
 * A floor's frustumFor frames the whole floor instead; on a wide stage that leaves the hall at about 60% of the width.
 */
export function lobbyFrustum(size: { w: number; h: number }, aspect: number): Frustum {
  const a = aspect > 0 && Number.isFinite(aspect) ? aspect : 1;
  const c = floorCenter(size);
  const right = { x: Math.cos(HOME_AZIMUTH), z: -Math.sin(HOME_AZIMUTH) };
  const up = { x: -Math.cos(POLAR) * Math.sin(HOME_AZIMUTH), y: Math.sin(POLAR), z: -Math.cos(POLAR) * Math.cos(HOME_AZIMUTH) };
  let halfW = 0;
  let top = -Infinity;
  let bottom = Infinity;
  for (const x of [0, size.w]) {
    for (const z of [0, size.h]) {
      for (const y of [0, LOBBY_TOP]) {
        const dx = x - c.x;
        const dz = z - c.z;
        const v = dx * up.x + y * up.y + dz * up.z;
        halfW = Math.max(halfW, Math.abs(dx * right.x + dz * right.z));
        top = Math.max(top, v);
        bottom = Math.min(bottom, v);
      }
    }
  }
  const tall = (top - bottom) * FRAME_MARGIN;
  let viewW = (2 * halfW) / LOBBY_ROOM_SHARE;
  let viewH = viewW / a;
  if (viewH < (1 - LOBBY_MAX_CROP) * tall) {
    viewH = (1 - LOBBY_MAX_CROP) * tall;
    viewW = viewH * a;
  }
  const middle = (top + bottom) / 2;
  // All of the hall's height fits: centred on it. Otherwise its top stays in view, with the frame's margin over it.
  const frameTop = viewH >= tall ? middle + viewH / 2 : top + ((FRAME_MARGIN - 1) / 2) * (top - bottom);
  return { left: -viewW / 2, right: viewW / 2, top: frameTop, bottom: frameTop - viewH };
}

export interface LobbyView {
  setLobby(lobby: LobbyInput): void;
  setTheme(theme: ThemeTokens): void;
  dispose(): void;
}

export function createLobbyView(host: { canvas: HTMLCanvasElement }, theme: ThemeTokens, renderer: RendererLike, env: ViewEnv = browserEnv()): LobbyView {
  const { canvas } = host;
  const world = new LobbyScene(theme);
  world.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const camera = new OrthographicCamera(-10, 10, 10, -10, 0.1, 300);
  const controls = new OrbitControls(camera, canvas);
  controls.minPolarAngle = MIN_POLAR;
  controls.maxPolarAngle = MAX_POLAR;
  controls.minZoom = MIN_ZOOM;
  controls.maxZoom = MAX_ZOOM;
  controls.rotateSpeed = 0.6;
  controls.screenSpacePanning = true;
  controls.enableDamping = false;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.setClearColor(0x000000, 0);

  let width = 300;
  let height = 150;
  let size = { w: 18, h: 13 };
  let frame = 0;
  let disposed = false;
  let framed = false;

  const draw = () => {
    frame = 0;
    if (disposed) return;
    renderer.render(world.scene, camera);
  };
  const request = () => {
    if (!frame && !disposed) frame = env.requestFrame(draw);
  };

  /** The hall in view, from home: the camera looks at its centre. */
  function home(): void {
    const c = floorCenter(size);
    const o = cameraOffset(HOME_AZIMUTH);
    controls.target.set(c.x, 0, c.z);
    camera.position.set(c.x + o.x, o.y, c.z + o.z);
    camera.zoom = 1;
    fit();
    controls.update();
  }

  function fit(): void {
    const f = lobbyFrustum(size, width / height);
    camera.left = f.left;
    camera.right = f.right;
    camera.top = f.top;
    camera.bottom = f.bottom;
    camera.updateProjectionMatrix();
  }

  function resize(): void {
    if (canvas.clientWidth > 0 && canvas.clientHeight > 0) {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
    }
    renderer.setPixelRatio(Math.min(env.pixelRatio(), 2));
    renderer.setSize(width, height, false);
    fit();
    request();
  }

  controls.addEventListener('change', request);
  const unobserve = env.observeResize(canvas, resize);
  const unwatch = env.watchPixelRatio(resize);
  resize();

  return {
    setLobby(lobby) {
      if (disposed || !world.setLobby(lobby)) return;
      const grown = world.plan!.size.w !== size.w || world.plan!.size.h !== size.h;
      size = world.plan!.size;
      // The first hall is framed from home; a hall that widens for a new seat is framed again.
      if (!framed || grown) {
        framed = true;
        home();
      }
      renderer.shadowMap.needsUpdate = true;
      request();
    },
    setTheme(t) {
      if (disposed) return;
      world.setTheme(t);
      renderer.shadowMap.needsUpdate = true;
      request();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (frame) env.cancelFrame(frame);
      unobserve();
      unwatch();
      controls.dispose();
      world.dispose();
      renderer.dispose();
      renderer.forceContextLoss?.();
    },
  };
}
