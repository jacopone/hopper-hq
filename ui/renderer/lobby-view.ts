/**
 * The Lobby's 3D view: a LobbyScene seen as a floor is, from the south-east at the floors' angle, framed whole, with the
 * floors' zoom, turn and tilt by mouse. It draws when something changed (the Lobby, the theme, the size, the camera),
 * not in a loop: nothing in the hall moves on its own.
 */
import { OrthographicCamera, PCFShadowMap } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MAX_POLAR, MAX_ZOOM, MIN_POLAR, MIN_ZOOM } from './camera';
import type { LobbyInput } from './lobby-layout';
import { LobbyScene } from './lobby-scene';
import type { ThemeTokens } from './theme';
import { browserEnv, type RendererLike, type ViewEnv } from './view';
import { cameraOffset, floorCenter, frustumFor, HOME_AZIMUTH } from './world';

export interface LobbyView {
  setLobby(lobby: LobbyInput): void;
  setTheme(theme: ThemeTokens): void;
  dispose(): void;
}

export function createLobbyView(host: { canvas: HTMLCanvasElement }, theme: ThemeTokens, renderer: RendererLike, env: ViewEnv = browserEnv()): LobbyView {
  const { canvas } = host;
  const world = new LobbyScene(theme);
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

  /** The whole hall in view, from home: the camera looks at its centre. */
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
    const f = frustumFor(size, width / height);
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
