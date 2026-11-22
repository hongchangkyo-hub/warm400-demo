import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  createContactShadowTexture,
  createWarm400TumblerModel,
  detectSoftwareWebGL,
  setupStudioLightingAndEnv,
} from '../three/warm400Tumbler';

interface HeroTumbler3DProps {
  reducedMotion: boolean;
}

const CAMERA_POS = new THREE.Vector3(0, 1.02, 3.35);
const LOOK_AT = new THREE.Vector3(0, 0.82, 0);

export function HeroTumbler3D({ reducedMotion }: HeroTumbler3DProps) {
  const [webglUnavailable, setWebglUnavailable] = useState(false);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const reducedMotionRef = useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const { supported, isSoftwareGl } = detectSoftwareWebGL();
    if (!supported) {
      setWebglUnavailable(true);
      return;
    }

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglUnavailable(true);
      return;
    }

    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = false;

    const initialWidth = Math.max(container.clientWidth, 1);
    const initialHeight = Math.max(container.clientHeight, 1);
    renderer.setSize(initialWidth, initialHeight);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.pointerEvents = 'none';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = null;

    const envTarget = setupStudioLightingAndEnv(renderer, scene, isSoftwareGl);

    const camera = new THREE.PerspectiveCamera(34, initialWidth / initialHeight, 0.1, 30);
    camera.position.copy(CAMERA_POS);
    camera.lookAt(LOOK_AT);

    const tumbler = createWarm400TumblerModel({
      bodyHex: '#f2ece1',
      inkHex: '#1c2026',
      maxAnisotropy: renderer.capabilities.getMaxAnisotropy(),
      castShadow: false,
    });
    scene.add(tumbler.group);

    // Synchronized soft radial shadow directly on the white surface below the floating tumbler
    const shadowTex = createContactShadowTexture();
    const shadowGeo = new THREE.PlaneGeometry(1.7, 1.7);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.42,
    });
    const shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = 0.002;
    scene.add(shadowPlane);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    let disposed = false;
    let contextLost = false;
    let isInView = true;
    let frameId = 0;
    let loopRunning = false;
    let lastTime = performance.now();
    let elapsedMotionTime = 0;

    const applyStaticFrontPose = () => {
      tumbler.group.position.set(0, 0, 0);
      tumbler.group.rotation.set(0, 0, 0);
      shadowPlane.scale.set(1, 1, 1);
      shadowMat.opacity = 0.44;
    };

    const stopLoop = () => {
      loopRunning = false;
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(frameId);
    };

    const scheduleNext = (cb: () => void) => {
      if (disposed || contextLost || !isInView || document.hidden || reducedMotionRef.current) {
        loopRunning = false;
        return;
      }
      if (isSoftwareGl) {
        const gl = renderer.getContext() as WebGL2RenderingContext;
        if (typeof gl.fenceSync === 'function') {
          const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
          gl.flush();
          const poll = () => {
            if (disposed || contextLost || !isInView || document.hidden || reducedMotionRef.current) {
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
      if (disposed || contextLost || !isInView || document.hidden) {
        loopRunning = false;
        return;
      }

      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      if (reducedMotionRef.current) {
        applyStaticFrontPose();
        renderer.render(scene, camera);
        loopRunning = false;
        return;
      }

      elapsedMotionTime += dt;
      const cycle = elapsedMotionTime * ((Math.PI * 2) / 3.8);
      const floatNorm = (Math.sin(cycle) + 1) * 0.5; // 0 (lowest) -> 1 (highest)

      tumbler.group.position.y = 0.03 + floatNorm * 0.08;
      tumbler.group.rotation.y = Math.sin(cycle * 0.5) * 0.14;
      tumbler.group.rotation.z = Math.cos(cycle) * 0.012;

      // Shadow gently shrinks & softens as tumbler lifts higher, and expands when it lowers
      const shadowScale = 1.04 - floatNorm * 0.18;
      shadowPlane.scale.set(shadowScale, shadowScale, 1);
      shadowMat.opacity = 0.42 - floatNorm * 0.15;

      renderer.render(scene, camera);
      scheduleNext(tick);
    };

    const startLoopIfActive = () => {
      if (disposed || contextLost || !isInView || document.hidden) return;
      if (reducedMotionRef.current) {
        applyStaticFrontPose();
        renderer.render(scene, camera);
        return;
      }
      if (!loopRunning) {
        loopRunning = true;
        lastTime = performance.now();
        tick();
      }
    };

    const handleResize = () => {
      if (!container || disposed) return;
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
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopLoop();
      } else {
        startLoopIfActive();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleReduceChange = () => {
      if (reduceQuery.matches) {
        stopLoop();
        applyStaticFrontPose();
        if (!contextLost) renderer.render(scene, camera);
      } else {
        startLoopIfActive();
      }
    };
    reduceQuery.addEventListener('change', handleReduceChange);

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

    // Draw initial frame immediately and kick off loop if visible
    if (reducedMotionRef.current) {
      applyStaticFrontPose();
    }
    renderer.render(scene, camera);
    startLoopIfActive();

    return () => {
      disposed = true;
      stopLoop();
      visibilityObserver?.disconnect();
      resizeObserver.disconnect();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      reduceQuery.removeEventListener('change', handleReduceChange);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);
      tumbler.dispose();
      shadowGeo.dispose();
      shadowMat.dispose();
      shadowTex.dispose();
      envTarget.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      role="img"
      aria-label="흰 배경 위에 떠 있는 크림색 WARM 400 텀블러 3D 모델"
      className="w-full max-w-[448px] h-80 min-[601px]:h-[432px] mx-auto pointer-events-none select-none"
    >
      {webglUnavailable ? (
        <div className="w-full h-full flex items-center justify-center p-6 text-center text-sm text-neutral-500">
          WARM 400 텀블러 (400ml · 크림)
        </div>
      ) : (
        <div ref={mountRef} className="w-full h-full" />
      )}
    </div>
  );
}
