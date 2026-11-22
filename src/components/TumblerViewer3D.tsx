import { useEffect, useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  createContactShadowTexture,
  createWarm400TumblerModel,
  detectSoftwareWebGL,
  setupStudioLightingAndEnv,
} from '../three/warm400Tumbler';

export type TumblerModelMode = 'prompt' | 'tripo';
export type TumblerColorId = 'cream' | 'navy' | 'sage';

interface ColorOption {
  id: TumblerColorId;
  label: string;
  hex: string;
  inkHex: string;
}

export const TUMBLER_COLOR_OPTIONS: ColorOption[] = [
  { id: 'cream', label: '크림', hex: '#f2ece1', inkHex: '#1c2026' },
  { id: 'navy', label: '네이비', hex: '#1e3250', inkHex: '#f5f3ee' },
  { id: 'sage', label: '세이지', hex: '#8ea18e', inkHex: '#1c2026' },
];

const MODEL_MODE_OPTIONS: { id: TumblerModelMode; label: string }[] = [
  { id: 'prompt', label: '프롬프트 버전' },
  { id: 'tripo', label: '3D 모델링 버전' },
];

const TRIPO_GLB_URL = `${import.meta.env.BASE_URL}models/warm400-tripo.glb`;
const PROMPT_TUMBLER_HEIGHT = 1.61;
const MIN_DISTANCE = 2.0;
const MAX_DISTANCE = 5.2;
const ZOOM_STEP = 0.55;
const INITIAL_CAMERA_POS = new THREE.Vector3(1.35, 1.48, 2.9);
const CONTROLS_TARGET = new THREE.Vector3(0, 0.82, 0);
const INITIAL_DISTANCE = INITIAL_CAMERA_POS.distanceTo(CONTROLS_TARGET);

const _targetColor = new THREE.Color();
const _targetInkColor = new THREE.Color();
const _offsetVec = new THREE.Vector3();

function disposeObjectTree(root: THREE.Object3D) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((mat) => {
      if (!mat) return;
      for (const value of Object.values(mat)) {
        if (value && typeof value === 'object' && 'isTexture' in value) {
          (value as THREE.Texture).dispose();
        }
      }
      mat.dispose();
    });
  });
}

export function TumblerViewer3D() {
  const [modelMode, setModelMode] = useState<TumblerModelMode>('prompt');
  const [selectedColor, setSelectedColor] = useState<TumblerColorId>('cream');
  const [webglUnavailable, setWebglUnavailable] = useState(false);
  const [tripoStatus, setTripoStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const [zoomDistance, setZoomDistance] = useState<number>(INITIAL_DISTANCE);

  const mountRef = useRef<HTMLDivElement | null>(null);
  const targetColorHexRef = useRef<string>(TUMBLER_COLOR_OPTIONS[0].hex);
  const targetInkHexRef = useRef<string>(TUMBLER_COLOR_OPTIONS[0].inkHex);
  const targetDistanceRef = useRef<number>(INITIAL_DISTANCE);
  const modelModeRef = useRef<TumblerModelMode>('prompt');
  const promptGroupRef = useRef<THREE.Group | null>(null);
  const tripoGroupRef = useRef<THREE.Group | null>(null);
  const modelRootGroupRef = useRef<THREE.Group | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const isSoftwareGlRef = useRef<boolean>(false);
  const tripoLoadStartedRef = useRef<boolean>(false);
  const disposedRef = useRef<boolean>(false);
  const targetScrollRotationRef = useRef<number>(0);
  const reducedMotionRef = useRef<boolean>(false);
  const renderOnceIfPausedRef = useRef<(() => void) | null>(null);

  const handleZoomIn = () => {
    const next = Math.max(MIN_DISTANCE, targetDistanceRef.current - ZOOM_STEP);
    targetDistanceRef.current = next;
    setZoomDistance(next);
    renderOnceIfPausedRef.current?.();
  };

  const handleZoomOut = () => {
    const next = Math.min(MAX_DISTANCE, targetDistanceRef.current + ZOOM_STEP);
    targetDistanceRef.current = next;
    setZoomDistance(next);
    renderOnceIfPausedRef.current?.();
  };

  useEffect(() => {
    const matched = TUMBLER_COLOR_OPTIONS.find((opt) => opt.id === selectedColor);
    if (matched) {
      targetColorHexRef.current = matched.hex;
      targetInkHexRef.current = matched.inkHex;
    }
  }, [selectedColor]);

  // Toggle visibility and lazily load Tripo GLB on first switch to 'tripo'
  useEffect(() => {
    modelModeRef.current = modelMode;

    if (promptGroupRef.current) {
      promptGroupRef.current.visible = modelMode === 'prompt';
    }
    if (tripoGroupRef.current) {
      tripoGroupRef.current.visible = modelMode === 'tripo';
    }
    renderOnceIfPausedRef.current?.();

    if (modelMode !== 'tripo' || webglUnavailable) return;
    if (tripoLoadStartedRef.current || !sceneRef.current) return;

    tripoLoadStartedRef.current = true;
    setTripoStatus('loading');

    const loader = new GLTFLoader();
    loader.load(
      TRIPO_GLB_URL,
      (gltf) => {
        if (disposedRef.current || !sceneRef.current) return;

        const rawModel = gltf.scene;
        rawModel.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.castShadow = !isSoftwareGlRef.current;
            mesh.receiveShadow = !isSoftwareGlRef.current;
          }
        });

        // Compute bounding box and normalize height + center to match prompt tumbler
        rawModel.updateMatrixWorld(true);
        const initialBox = new THREE.Box3().setFromObject(rawModel);
        const initialSize = initialBox.getSize(new THREE.Vector3());

        const wrapper = new THREE.Group();
        wrapper.add(rawModel);

        if (initialSize.y > 0.0001) {
          const scaleFactor = PROMPT_TUMBLER_HEIGHT / initialSize.y;
          rawModel.scale.multiplyScalar(scaleFactor);
        }

        rawModel.updateMatrixWorld(true);
        const scaledBox = new THREE.Box3().setFromObject(rawModel);
        const scaledCenter = scaledBox.getCenter(new THREE.Vector3());

        // Center horizontally at (0, 0) and rest bottom flush at y = 0
        rawModel.position.x -= scaledCenter.x;
        rawModel.position.z -= scaledCenter.z;
        rawModel.position.y -= scaledBox.min.y;

        wrapper.visible = modelModeRef.current === 'tripo';
        tripoGroupRef.current = wrapper;
        if (modelRootGroupRef.current) {
          modelRootGroupRef.current.add(wrapper);
        } else {
          sceneRef.current.add(wrapper);
        }
        setTripoStatus('loaded');
        renderOnceIfPausedRef.current?.();
      },
      undefined,
      () => {
        if (disposedRef.current) return;
        setTripoStatus('error');
      },
    );
  }, [modelMode, webglUnavailable]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    disposedRef.current = false;

    const { supported, isSoftwareGl } = detectSoftwareWebGL();
    if (!supported) {
      setWebglUnavailable(true);
      return;
    }
    isSoftwareGlRef.current = isSoftwareGl;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        alpha: false,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglUnavailable(true);
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const initialWidth = Math.max(container.clientWidth, 1);
    const initialHeight = Math.max(container.clientHeight, 1);
    renderer.setSize(initialWidth, initialHeight);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#f3f5f8');
    sceneRef.current = scene;

    const envTarget = setupStudioLightingAndEnv(renderer, scene, isSoftwareGl);

    const camera = new THREE.PerspectiveCamera(34, initialWidth / initialHeight, 0.1, 30);
    camera.position.copy(INITIAL_CAMERA_POS);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(CONTROLS_TARGET);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.minDistance = MIN_DISTANCE;
    controls.maxDistance = MAX_DISTANCE;
    controls.minPolarAngle = Math.PI * 0.15;
    controls.maxPolarAngle = Math.PI * 0.56;

    const reduceMediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotionRef.current = reduceMediaQuery.matches;
    controls.autoRotate = !reducedMotionRef.current;
    controls.autoRotateSpeed = 1.1;
    controls.update();

    const modelRootGroup = new THREE.Group();
    modelRootGroupRef.current = modelRootGroup;
    scene.add(modelRootGroup);

    // Allow vertical touch swipes to scroll the page while horizontal swipes rotate the 3D tumbler
    renderer.domElement.style.touchAction = 'pan-y';

    const tumbler = createWarm400TumblerModel({
      bodyHex: targetColorHexRef.current,
      inkHex: targetInkHexRef.current,
      maxAnisotropy: renderer.capabilities.getMaxAnisotropy(),
      castShadow: !isSoftwareGl,
    });
    tumbler.group.visible = modelModeRef.current === 'prompt';
    promptGroupRef.current = tumbler.group;
    modelRootGroup.add(tumbler.group);

    // Soft contact shadow plane on floor beneath tumbler
    const shadowTex = createContactShadowTexture();
    const shadowGeo = new THREE.PlaneGeometry(1.75, 1.75);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.5,
    });
    const shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = 0.002;
    scene.add(shadowPlane);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    let popStarted = reducedMotionRef.current;
    let popCompleted = reducedMotionRef.current;
    let popStartTime = 0;
    let currentPopScale = reducedMotionRef.current ? 1 : 0.25;
    let currentScrollAngle = 0;

    modelRootGroup.scale.setScalar(currentPopScale);
    shadowPlane.scale.set(currentPopScale, currentPopScale, 1);

    const sectionEl = container.closest('section') ?? container;

    const updateScrollRotation = () => {
      if (reducedMotionRef.current) {
        targetScrollRotationRef.current = 0;
        return;
      }
      const rect = sectionEl.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const totalTravel = vh + rect.height;
      const progress = totalTravel > 0 ? Math.min(Math.max((vh - rect.top) / totalTravel, 0), 1) : 0;
      targetScrollRotationRef.current = progress * Math.PI * 2;
    };

    updateScrollRotation();
    window.addEventListener('scroll', updateScrollRotation, { passive: true });
    window.addEventListener('resize', updateScrollRotation, { passive: true });

    let popObserver: IntersectionObserver | null = null;
    if (!popCompleted && typeof IntersectionObserver !== 'undefined') {
      popObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting && !popStarted) {
              popStarted = true;
              popStartTime = performance.now();
              popObserver?.disconnect();
              break;
            }
          }
        },
        { threshold: 0.2 },
      );
      popObserver.observe(container);
    } else {
      popStarted = true;
      popCompleted = true;
      currentPopScale = 1;
      modelRootGroup.scale.setScalar(1);
      shadowPlane.scale.set(1, 1, 1);
    }

    let frameId = 0;
    let contextLost = false;
    let isInView = false;
    let loopRunning = false;
    let lastTime = performance.now();

    const stopLoop = () => {
      loopRunning = false;
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(frameId);
    };

    const scheduleNext = (cb: () => void) => {
      if (disposedRef.current || contextLost || !isInView || document.hidden) {
        loopRunning = false;
        return;
      }
      if (isSoftwareGl) {
        const gl = renderer.getContext() as WebGL2RenderingContext;
        if (typeof gl.fenceSync === 'function') {
          const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
          gl.flush();
          const poll = () => {
            if (disposedRef.current || contextLost || !isInView || document.hidden) {
              if (sync) gl.deleteSync(sync);
              loopRunning = false;
              return;
            }
            const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
            if (state === gl.UNSIGNALED) {
              frameId = window.setTimeout(poll, 5);
            } else {
              if (sync) gl.deleteSync(sync);
              frameId = window.setTimeout(cb, 80);
            }
          };
          frameId = window.setTimeout(poll, 5);
        } else {
          frameId = window.setTimeout(cb, 80);
        }
      } else {
        frameId = window.requestAnimationFrame(cb);
      }
    };

    const tick = () => {
      if (disposedRef.current || contextLost || !isInView || document.hidden) {
        loopRunning = false;
        return;
      }

      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      _targetColor.set(targetColorHexRef.current);
      if (!tumbler.bodyMat.color.equals(_targetColor)) {
        const lerpAlpha = isSoftwareGl ? 1 : 1 - Math.exp(-12 * dt);
        tumbler.bodyMat.color.lerp(_targetColor, lerpAlpha);
      }

      _targetInkColor.set(targetInkHexRef.current);
      if (!tumbler.logoMat.color.equals(_targetInkColor)) {
        const lerpAlpha = isSoftwareGl ? 1 : 1 - Math.exp(-16 * dt);
        tumbler.logoMat.color.lerp(_targetInkColor, lerpAlpha);
      }

      if (!reducedMotionRef.current) {
        if (popStarted && !popCompleted) {
          const t = Math.min((now - popStartTime) / 680, 1);
          const c1 = 1.70158;
          const c3 = c1 + 1;
          const eased = 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
          currentPopScale = 0.25 + 0.75 * eased;
          if (t >= 1) {
            popCompleted = true;
            currentPopScale = 1;
          }
          modelRootGroup.scale.setScalar(currentPopScale);
          shadowPlane.scale.set(currentPopScale, currentPopScale, 1);
        }

        currentScrollAngle = isSoftwareGl
          ? targetScrollRotationRef.current
          : THREE.MathUtils.damp(currentScrollAngle, targetScrollRotationRef.current, 10, dt);
        modelRootGroup.rotation.y = currentScrollAngle;
      }

      controls.update();

      _offsetVec.copy(camera.position).sub(controls.target);
      const currentDist = _offsetVec.length();
      const targetDist = targetDistanceRef.current;
      if (Math.abs(currentDist - targetDist) > 0.0005 && currentDist > 0.0001) {
        const nextDist = isSoftwareGl
          ? targetDist
          : THREE.MathUtils.damp(currentDist, targetDist, 10, dt);
        _offsetVec.multiplyScalar(nextDist / currentDist);
        camera.position.copy(controls.target).add(_offsetVec);
      }

      renderer.render(scene, camera);
      scheduleNext(tick);
    };

    const startLoopIfActive = () => {
      if (disposedRef.current || contextLost || !isInView || document.hidden) return;
      if (!loopRunning) {
        loopRunning = true;
        lastTime = performance.now();
        tick();
      }
    };

    renderOnceIfPausedRef.current = () => {
      if (!disposedRef.current && !contextLost && !loopRunning) {
        renderer.render(scene, camera);
      }
    };

    const handleResize = () => {
      if (!container || disposedRef.current) return;
      const w = Math.max(container.clientWidth, 1);
      const h = Math.max(container.clientHeight, 1);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      if (!loopRunning && !contextLost) {
        renderer.render(scene, camera);
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    let visibilityObserver: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== 'undefined') {
      visibilityObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            isInView = entry.isIntersecting;
            if (isInView) {
              startLoopIfActive();
            } else {
              stopLoop();
            }
          }
        },
        { rootMargin: '120px 0px', threshold: 0.01 },
      );
      visibilityObserver.observe(container);
    } else {
      isInView = true;
      startLoopIfActive();
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopLoop();
      } else {
        startLoopIfActive();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const handleReducedMotionChange = () => {
      const reduced = reduceMediaQuery.matches;
      reducedMotionRef.current = reduced;
      controls.autoRotate = !reduced;
      if (reduced) {
        popStarted = true;
        popCompleted = true;
        currentPopScale = 1;
        targetScrollRotationRef.current = 0;
        currentScrollAngle = 0;
        modelRootGroup.scale.setScalar(1);
        modelRootGroup.rotation.y = 0;
        shadowPlane.scale.set(1, 1, 1);
      } else {
        updateScrollRotation();
      }
    };
    reduceMediaQuery.addEventListener('change', handleReducedMotionChange);

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      contextLost = true;
      stopLoop();
    };
    const handleContextRestored = () => {
      contextLost = false;
      startLoopIfActive();
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored);

    renderer.render(scene, camera);

    return () => {
      disposedRef.current = true;
      renderOnceIfPausedRef.current = null;
      stopLoop();
      popObserver?.disconnect();
      visibilityObserver?.disconnect();
      window.removeEventListener('scroll', updateScrollRotation);
      window.removeEventListener('resize', updateScrollRotation);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      reduceMediaQuery.removeEventListener('change', handleReducedMotionChange);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);
      controls.dispose();
      tumbler.dispose();
      shadowGeo.dispose();
      shadowMat.dispose();
      shadowTex.dispose();
      if (tripoGroupRef.current) {
        disposeObjectTree(tripoGroupRef.current);
        tripoGroupRef.current = null;
      }
      modelRootGroupRef.current = null;
      promptGroupRef.current = null;
      sceneRef.current = null;
      tripoLoadStartedRef.current = false;
      envTarget.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  const showTripoLoading = !webglUnavailable && modelMode === 'tripo' && tripoStatus === 'loading';
  const showTripoError = !webglUnavailable && modelMode === 'tripo' && tripoStatus === 'error';

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="3D 모델 버전 전환">
        {MODEL_MODE_OPTIONS.map((option) => {
          const isSelected = modelMode === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setModelMode(option.id)}
              aria-pressed={isSelected}
              className={`px-4 py-2 min-h-12 rounded-lg text-sm font-medium border transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2558d6] ${
                isSelected
                  ? 'bg-[#2558d6] text-white border-[#2558d6]'
                  : 'bg-white text-neutral-900 border-neutral-200 hover:border-[#2558d6] hover:text-[#2558d6]'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <div
        role="region"
        aria-label="WARM 400 텀블러 360도 3D 모델 뷰어. 드래그하거나 좌우로 쓸어 회전하고, 확대·축소 버튼으로 크기를 조절할 수 있습니다."
        className="w-full max-w-3xl aspect-[4/3] bg-[#f3f5f8] rounded-[16px] overflow-hidden relative"
      >
        {webglUnavailable ? (
          <div className="w-full h-full flex items-center justify-center p-6 text-center text-sm text-neutral-600 leading-relaxed">
            이 환경에서는 3D 모델을 표시할 수 없습니다. WebGL을 지원하는 브라우저에서 확인해 주세요.
          </div>
        ) : (
          <>
            <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

            {showTripoLoading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#f3f5f8]/90 p-6 text-center text-sm font-medium text-neutral-700">
                3D 모델 불러오는 중…
              </div>
            )}

            {showTripoError && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#f3f5f8] p-6 text-center text-sm text-neutral-600 leading-relaxed">
                3D 모델링 파일을 불러올 수 없습니다. 프롬프트 버전을 이용해 주세요.
              </div>
            )}

            <div className="absolute bottom-4 right-4 z-20 flex items-center gap-2">
              <button
                type="button"
                onClick={handleZoomIn}
                disabled={zoomDistance <= MIN_DISTANCE + 0.01}
                aria-label="텀블러 확대"
                className="w-10 h-10 flex items-center justify-center rounded-lg bg-white text-[#2558d6] border border-neutral-200 hover:border-[#2558d6] hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2558d6]"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={handleZoomOut}
                disabled={zoomDistance >= MAX_DISTANCE - 0.01}
                aria-label="텀블러 축소"
                className="w-10 h-10 flex items-center justify-center rounded-lg bg-white text-[#2558d6] border border-neutral-200 hover:border-[#2558d6] hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2558d6]"
              >
                <Minus className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </>
        )}
      </div>

      {modelMode === 'prompt' && (
        <div className="mt-6 flex flex-wrap items-center gap-4" role="group" aria-label="텀블러 몸통 색상 선택">
          {TUMBLER_COLOR_OPTIONS.map((option) => {
            const isActive = selectedColor === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setSelectedColor(option.id)}
                aria-pressed={isActive}
                className={`inline-flex items-center gap-2 px-4 py-2 min-h-12 rounded-lg text-sm font-medium border transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2558d6] ${
                  isActive
                    ? 'bg-[#2558d6] text-white border-[#2558d6]'
                    : 'bg-white text-neutral-900 border-neutral-200 hover:border-[#2558d6] hover:text-[#2558d6]'
                }`}
              >
                <span
                  aria-hidden="true"
                  style={{ backgroundColor: option.hex }}
                  className="w-4 h-4 rounded border border-black/15 shrink-0"
                />
                {option.label}
              </button>
            );
          })}
        </div>
      )}

      <p className="mt-4 text-sm text-neutral-500 leading-relaxed">
        {modelMode === 'prompt'
          ? 'Three.js 코드로 만든 예시 모델입니다 · 드래그해서 돌려 보세요'
          : 'Tripo AI(무료 플랜)로 생성한 예시 모델입니다 · 실제 제품이 아닙니다'}
      </p>
    </div>
  );
}
