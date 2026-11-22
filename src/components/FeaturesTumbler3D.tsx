import { useEffect, useRef, useState } from 'react';
import { Clock, Droplets, Thermometer } from 'lucide-react';
import * as THREE from 'three';
import {
  createContactShadowTexture,
  createSilkscreenLogoTexture,
  detectSoftwareWebGL,
  setupStudioLightingAndEnv,
} from '../three/warm400Tumbler';

export type FeatureStepIndex = 0 | 1 | 2;

interface FeaturesTumbler3DProps {
  activeStep: FeatureStepIndex;
  storyProgress: number; // Continuous 0..3 across the 3 feature cards
  isDesktop: boolean;
  reducedMotion: boolean;
}

const CHAMBER_FLOOR_Y = 0.16;
const SCALE_100_Y = 0.43;
const SCALE_200_Y = 0.7;
const SCALE_300_Y = 0.97;
const SCALE_400_Y = 1.24;
const COFFEE_LEVEL_Y = 1.02;

const SCALE_MARKS = [
  { id: '100', label: '100ml', y: SCALE_100_Y, frac: 0.25 },
  { id: '200', label: '200ml', y: SCALE_200_Y, frac: 0.5 },
  { id: '300', label: '300ml', y: SCALE_300_Y, frac: 0.75 },
  { id: '400', label: '400ml', y: SCALE_400_Y, frac: 0.99 },
] as const;

const WALL_LABELS = [
  { id: 'outer', label: '바깥벽', wallX: 0.388, y: 1.02 },
  { id: 'vacuum', label: '진공층', wallX: 0.335, y: 0.74 },
  { id: 'inner', label: '안쪽벽', wallX: 0.268, y: 0.46 },
] as const;

function innerChamberRadiusAtY(y: number): number {
  const t = Math.max(0, Math.min(1, (y - CHAMBER_FLOOR_Y) / (1.355 - CHAMBER_FLOOR_Y)));
  return 0.238 + t * (0.296 - 0.238);
}

// Evenly spaced horizontal tick lines across [CHAMBER_FLOOR_Y .. SCALE_400_Y]
function createGraduationTicksTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const width = 512;
  const height = 512;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = 'rgba(30, 41, 59, 0.78)';
    ctx.lineWidth = 4;

    // 400ml at top (0.04), 300 at 0.28, 200 at 0.52, 100 at 0.76
    const yFracs = [0.04, 0.28, 0.52, 0.76];
    for (let i = 0; i < yFracs.length; i++) {
      const y = yFracs[i] * height;
      ctx.beginPath();
      ctx.moveTo(width * 0.2, y);
      ctx.lineTo(width * 0.8, y);
      ctx.stroke();

      // Subtle mid-tick halfway between major marks
      const subY = (yFracs[i] + 0.12) * height;
      ctx.save();
      ctx.strokeStyle = 'rgba(51, 65, 85, 0.42)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(width * 0.34, subY);
      ctx.lineTo(width * 0.66, subY);
      ctx.stroke();
      ctx.restore();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  texture.needsUpdate = true;
  return texture;
}

function createEcoBagGroup(): {
  group: THREE.Group;
  backMat: THREE.MeshStandardMaterial;
  gussetMat: THREE.MeshStandardMaterial;
  frontMat: THREE.MeshPhysicalMaterial;
  strapMat: THREE.MeshStandardMaterial;
  frontHemMat: THREE.MeshStandardMaterial;
  dispose: () => void;
} {
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const group = new THREE.Group();

  // Open-top hollow canvas tote pouch: deep enough (z in [-0.46, +0.46]) so the 0.826-diameter tumbler sits completely inside
  const w = 1.04;
  const hTop = 1.46;
  const hBot = 0.08;
  const r = 0.14;
  const halfDepth = 0.45;

  const panelShape = new THREE.Shape();
  panelShape.moveTo(-w + r, hBot);
  panelShape.lineTo(w - r, hBot);
  panelShape.quadraticCurveTo(w, hBot, w, hBot + r);
  panelShape.lineTo(w + 0.04, hTop);
  panelShape.lineTo(-w - 0.04, hTop);
  panelShape.lineTo(-w, hBot + r);
  panelShape.quadraticCurveTo(-w, hBot, -w + r, hBot);

  const panelGeo = new THREE.ShapeGeometry(panelShape, 14);
  geometries.push(panelGeo);

  // Back wall sits behind the tumbler
  const backMat = new THREE.MeshStandardMaterial({
    color: 0xdcd5c7,
    roughness: 0.94,
    metalness: 0.0,
    transparent: true,
    opacity: 0,
    depthWrite: true,
    side: THREE.DoubleSide,
  });
  materials.push(backMat);
  const backMesh = new THREE.Mesh(panelGeo, backMat);
  backMesh.position.z = -halfDepth;
  backMesh.renderOrder = 1;
  group.add(backMesh);

  // Side gussets & bottom floor enclose the interior cavity
  const gussetMat = new THREE.MeshStandardMaterial({
    color: 0xd1c9b8,
    roughness: 0.94,
    metalness: 0.0,
    transparent: true,
    opacity: 0,
    depthWrite: true,
    side: THREE.DoubleSide,
  });
  materials.push(gussetMat);

  const sideHeight = hTop - (hBot + r * 0.4);
  const sideGeo = new THREE.PlaneGeometry(halfDepth * 2, sideHeight);
  geometries.push(sideGeo);

  const leftSide = new THREE.Mesh(sideGeo, gussetMat);
  leftSide.rotation.y = Math.PI / 2;
  leftSide.rotation.x = -0.028;
  leftSide.position.set(-w - 0.015, (hTop + hBot + r * 0.4) / 2, 0);
  leftSide.renderOrder = 2;
  group.add(leftSide);

  const rightSide = new THREE.Mesh(sideGeo, gussetMat);
  rightSide.rotation.y = Math.PI / 2;
  rightSide.rotation.x = 0.028;
  rightSide.position.set(w + 0.015, (hTop + hBot + r * 0.4) / 2, 0);
  rightSide.renderOrder = 2;
  group.add(rightSide);

  const bottomGeo = new THREE.PlaneGeometry((w - r * 0.3) * 2, halfDepth * 2);
  geometries.push(bottomGeo);
  const bottomMesh = new THREE.Mesh(bottomGeo, gussetMat);
  bottomMesh.rotation.x = -Math.PI / 2;
  bottomMesh.position.set(0, hBot, 0);
  bottomMesh.renderOrder = 2;
  group.add(bottomMesh);

  // Translucent front cloth wall renders after the tumbler so the tucked tumbler shows softly through the fabric
  const frontMat = new THREE.MeshPhysicalMaterial({
    color: 0xf1ece1,
    roughness: 0.92,
    metalness: 0.0,
    sheen: 0.25,
    sheenRoughness: 0.85,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  materials.push(frontMat);
  const frontMesh = new THREE.Mesh(panelGeo, frontMat);
  frontMesh.position.z = halfDepth;
  frontMesh.renderOrder = 10;
  group.add(frontMesh);

  // Subtle folded canvas hem along top edge of front & back panels (open top)
  const frontHemMat = new THREE.MeshStandardMaterial({
    color: 0xe2dbcc,
    roughness: 0.9,
    metalness: 0.0,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  materials.push(frontHemMat);

  const hemGeo = new THREE.PlaneGeometry((w + 0.04) * 2, 0.055);
  geometries.push(hemGeo);

  const frontHem = new THREE.Mesh(hemGeo, frontHemMat);
  frontHem.position.set(0, hTop - 0.028, halfDepth + 0.002);
  frontHem.renderOrder = 11;
  group.add(frontHem);

  const backHem = new THREE.Mesh(hemGeo, gussetMat);
  backHem.position.set(0, hTop - 0.028, -halfDepth - 0.002);
  backHem.renderOrder = 2;
  group.add(backHem);

  // Tote handles (front strap renders in front of front cloth, back strap behind)
  const strapMat = new THREE.MeshStandardMaterial({
    color: 0xcfc7b6,
    roughness: 0.88,
    metalness: 0.0,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  materials.push(strapMat);

  const makeStrap = (zOffset: number, order: number) => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.44, hTop - 0.01, zOffset),
      new THREE.Vector3(-0.39, hTop + 0.3, zOffset),
      new THREE.Vector3(0, hTop + 0.4, zOffset),
      new THREE.Vector3(0.39, hTop + 0.3, zOffset),
      new THREE.Vector3(0.44, hTop - 0.01, zOffset),
    ]);
    const tubeGeo = new THREE.TubeGeometry(curve, 24, 0.024, 8, false);
    geometries.push(tubeGeo);
    const mesh = new THREE.Mesh(tubeGeo, strapMat);
    mesh.renderOrder = order;
    group.add(mesh);
  };
  makeStrap(halfDepth, 11);
  makeStrap(-halfDepth, 2);

  return {
    group,
    backMat,
    gussetMat,
    frontMat,
    strapMat,
    frontHemMat,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}

function createCrossSectionCapGeometry(profile: [number, number][]): THREE.ShapeGeometry {
  const shape = new THREE.Shape();
  profile.forEach(([x, y], idx) => {
    if (idx === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  });
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

export function FeaturesTumbler3D({
  activeStep,
  storyProgress,
  isDesktop,
  reducedMotion,
}: FeaturesTumbler3DProps) {
  const [webglUnavailable, setWebglUnavailable] = useState(false);
  const [readoutProgress, setReadoutProgress] = useState(storyProgress);
  const [reachedWaterMarks, setReachedWaterMarks] = useState(0);

  const mountRef = useRef<HTMLDivElement | null>(null);
  const wallLabelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const wallLineRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const scaleLabelRefs = useRef<(HTMLDivElement | null)[]>([]);

  const targetProgressRef = useRef<number>(storyProgress);
  const reducedMotionRef = useRef<boolean>(reducedMotion);
  const isDesktopRef = useRef<boolean>(isDesktop);
  const activeStepRef = useRef<FeatureStepIndex>(activeStep);
  const wakeRenderRef = useRef<(() => void) | null>(null);

  targetProgressRef.current = storyProgress;
  reducedMotionRef.current = reducedMotion;
  isDesktopRef.current = isDesktop;
  activeStepRef.current = activeStep;

  useEffect(() => {
    setReadoutProgress(storyProgress);
    wakeRenderRef.current?.();
  }, [storyProgress, activeStep, reducedMotion]);

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
    renderer.localClippingEnabled = true;
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
    const camPos = new THREE.Vector3(0, 1.04, 3.55);
    const camLook = new THREE.Vector3(0, 0.94, 0);
    camera.position.copy(camPos);
    camera.lookAt(camLook);

    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];
    const textures: THREE.Texture[] = [];

    const cutPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
    const waterTopPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), CHAMBER_FLOOR_Y);

    const assemblyGroup = new THREE.Group();
    scene.add(assemblyGroup);

    const tumblerGroup = new THREE.Group();
    assemblyGroup.add(tumblerGroup);

    // 1. Bottom silicone pad
    const padProfile = [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(0.296, 0.0),
      new THREE.Vector2(0.312, 0.01),
      new THREE.Vector2(0.312, 0.024),
      new THREE.Vector2(0.0, 0.024),
    ];
    const baseGeo = new THREE.LatheGeometry(padProfile, 64);
    baseGeo.computeVertexNormals();
    geometries.push(baseGeo);

    const siliconePadMat = new THREE.MeshStandardMaterial({
      color: 0x3b3f46,
      roughness: 0.92,
      metalness: 0.02,
      side: THREE.DoubleSide,
      clippingPlanes: [cutPlane],
    });
    materials.push(siliconePadMat);
    const baseMesh = new THREE.Mesh(baseGeo, siliconePadMat);
    tumblerGroup.add(baseMesh);

    // 2. Outer wall (바깥벽) — thin outer shell leaving wide 0.068 vacuum gap
    const outerWallProfile = [
      new THREE.Vector2(0.0, 0.022),
      new THREE.Vector2(0.305, 0.022),
      new THREE.Vector2(0.326, 0.026),
      new THREE.Vector2(0.341, 0.044),
      new THREE.Vector2(0.346, 0.085),
      new THREE.Vector2(0.404, 1.345),
      new THREE.Vector2(0.404, 1.385),
      new THREE.Vector2(0.394, 1.4),
      new THREE.Vector2(0.384, 1.4),
      new THREE.Vector2(0.384, 1.345),
      new THREE.Vector2(0.326, 0.09),
      new THREE.Vector2(0.316, 0.056),
      new THREE.Vector2(0.295, 0.045),
      new THREE.Vector2(0.0, 0.045),
    ];
    const outerWallGeo = new THREE.LatheGeometry(outerWallProfile, 64);
    outerWallGeo.computeVertexNormals();
    geometries.push(outerWallGeo);

    const outerWallMat = new THREE.MeshPhysicalMaterial({
      color: 0xf2ece1,
      roughness: 0.5,
      metalness: 0.04,
      clearcoat: 0.16,
      clearcoatRoughness: 0.45,
      envMapIntensity: 0.95,
      side: THREE.DoubleSide,
      clippingPlanes: [cutPlane],
    });
    materials.push(outerWallMat);
    const outerWallMesh = new THREE.Mesh(outerWallGeo, outerWallMat);
    tumblerGroup.add(outerWallMesh);

    const outerCapMat = new THREE.MeshStandardMaterial({
      color: 0xd6cfc2,
      roughness: 0.65,
      metalness: 0.08,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 1,
    });
    materials.push(outerCapMat);

    const outerHalfSection: [number, number][] = [
      [0.0, 0.022],
      [0.326, 0.026],
      [0.346, 0.085],
      [0.404, 1.345],
      [0.404, 1.395],
      [0.384, 1.395],
      [0.384, 1.345],
      [0.326, 0.09],
      [0.295, 0.045],
      [0.0, 0.045],
    ];
    const outerCapGeoR = createCrossSectionCapGeometry(outerHalfSection);
    const outerCapGeoL = createCrossSectionCapGeometry(
      outerHalfSection.map(([x, y]) => [-x, y]),
    );
    geometries.push(outerCapGeoR, outerCapGeoL);

    const outerCapR = new THREE.Mesh(outerCapGeoR, outerCapMat);
    const outerCapL = new THREE.Mesh(outerCapGeoL, outerCapMat);
    outerCapR.position.z = 0.001;
    outerCapL.position.z = 0.001;
    tumblerGroup.add(outerCapR, outerCapL);

    // 3. Inner stainless steel wall (안쪽벽) — clearly separated by 0.068 radial & 0.095 bottom vacuum gap
    const innerWallProfile = [
      new THREE.Vector2(0.0, 0.138),
      new THREE.Vector2(0.24, 0.138),
      new THREE.Vector2(0.258, 0.15),
      new THREE.Vector2(0.316, 1.355),
      new THREE.Vector2(0.352, 1.4),
      new THREE.Vector2(0.332, 1.4),
      new THREE.Vector2(0.296, 1.355),
      new THREE.Vector2(0.238, 0.16),
      new THREE.Vector2(0.0, 0.16),
    ];
    const innerWallGeo = new THREE.LatheGeometry(innerWallProfile, 64);
    innerWallGeo.computeVertexNormals();
    geometries.push(innerWallGeo);

    const innerWallMat = new THREE.MeshStandardMaterial({
      color: 0xb4bec9,
      metalness: 0.78,
      roughness: 0.3,
      envMapIntensity: 1.05,
      side: THREE.DoubleSide,
      clippingPlanes: [cutPlane],
    });
    materials.push(innerWallMat);
    const innerWallMesh = new THREE.Mesh(innerWallGeo, innerWallMat);
    tumblerGroup.add(innerWallMesh);

    const innerCapMat = new THREE.MeshStandardMaterial({
      color: 0x8590a0,
      metalness: 0.72,
      roughness: 0.35,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 1,
    });
    materials.push(innerCapMat);

    const innerHalfSection: [number, number][] = [
      [0.0, 0.138],
      [0.252, 0.144],
      [0.258, 0.155],
      [0.316, 1.355],
      [0.342, 1.395],
      [0.322, 1.395],
      [0.296, 1.355],
      [0.238, 0.16],
      [0.0, 0.16],
    ];
    const innerCapGeoR = createCrossSectionCapGeometry(innerHalfSection);
    const innerCapGeoL = createCrossSectionCapGeometry(
      innerHalfSection.map(([x, y]) => [-x, y]),
    );
    geometries.push(innerCapGeoR, innerCapGeoL);

    const innerCapR = new THREE.Mesh(innerCapGeoR, innerCapMat);
    const innerCapL = new THREE.Mesh(innerCapGeoL, innerCapMat);
    innerCapR.position.z = 0.002;
    innerCapL.position.z = 0.002;
    tumblerGroup.add(innerCapR, innerCapL);

    // 4. Silkscreen "WARM 400" logo on front outer shell (appears seamlessly when cutaway closes)
    const logoYBottom = 0.92;
    const logoYTop = 1.09;
    const slope = (0.404 - 0.346) / (1.345 - 0.085);
    const logoRBottom = 0.346 + (logoYBottom - 0.085) * slope + 0.0016;
    const logoRTop = 0.346 + (logoYTop - 0.085) * slope + 0.0016;
    const logoArc = Math.PI * 0.4;
    const logoGeo = new THREE.CylinderGeometry(
      logoRTop,
      logoRBottom,
      logoYTop - logoYBottom,
      48,
      1,
      true,
      -logoArc / 2,
      logoArc,
    );
    geometries.push(logoGeo);

    const logoTexture = createSilkscreenLogoTexture(renderer.capabilities.getMaxAnisotropy());
    textures.push(logoTexture);
    const logoMat = new THREE.MeshStandardMaterial({
      map: logoTexture,
      color: 0x1c2026,
      transparent: true,
      depthWrite: false,
      roughness: 0.42,
      metalness: 0.05,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      clippingPlanes: [cutPlane],
    });
    materials.push(logoMat);
    const logoMesh = new THREE.Mesh(logoGeo, logoMat);
    logoMesh.position.y = (logoYBottom + logoYTop) / 2;
    tumblerGroup.add(logoMesh);

    // 5. Mirror-polished stainless upper rim
    const rimProfile = [
      new THREE.Vector2(0.335, 1.4),
      new THREE.Vector2(0.398, 1.4),
      new THREE.Vector2(0.413, 1.43),
      new THREE.Vector2(0.413, 1.468),
      new THREE.Vector2(0.398, 1.488),
      new THREE.Vector2(0.365, 1.488),
    ];
    const rimGeo = new THREE.LatheGeometry(rimProfile, 64);
    rimGeo.computeVertexNormals();
    geometries.push(rimGeo);

    const rimMat = new THREE.MeshStandardMaterial({
      color: 0xe6eaef,
      metalness: 1.0,
      roughness: 0.2,
      envMapIntensity: 1.2,
      side: THREE.DoubleSide,
      clippingPlanes: [cutPlane],
    });
    materials.push(rimMat);
    const rimMesh = new THREE.Mesh(rimGeo, rimMat);
    tumblerGroup.add(rimMesh);

    // Separate lidGroup so Scene 1 can gently lift the lid to reveal steam rising above the rim
    const lidGroup = new THREE.Group();
    tumblerGroup.add(lidGroup);

    const gasketGeo = new THREE.TorusGeometry(0.398, 0.006, 12, 64);
    geometries.push(gasketGeo);
    const gasketMat = new THREE.MeshStandardMaterial({
      color: 0x9ca3af,
      roughness: 0.85,
      metalness: 0.02,
      clippingPlanes: [cutPlane],
    });
    materials.push(gasketMat);
    const gasketMesh = new THREE.Mesh(gasketGeo, gasketMat);
    gasketMesh.rotation.x = Math.PI / 2;
    gasketMesh.position.y = 1.49;
    lidGroup.add(gasketMesh);

    const lidProfile = [
      new THREE.Vector2(0.365, 1.492),
      new THREE.Vector2(0.404, 1.492),
      new THREE.Vector2(0.408, 1.508),
      new THREE.Vector2(0.408, 1.564),
      new THREE.Vector2(0.398, 1.584),
      new THREE.Vector2(0.382, 1.594),
      new THREE.Vector2(0.355, 1.596),
      new THREE.Vector2(0.0, 1.596),
    ];
    const lidGeo = new THREE.LatheGeometry(lidProfile, 64);
    lidGeo.computeVertexNormals();
    geometries.push(lidGeo);

    const lidMat = new THREE.MeshStandardMaterial({
      color: 0x2c3037,
      roughness: 0.54,
      metalness: 0.06,
      side: THREE.DoubleSide,
      clippingPlanes: [cutPlane],
    });
    materials.push(lidMat);
    const lidMesh = new THREE.Mesh(lidGeo, lidMat);
    lidGroup.add(lidMesh);

    const sipLipGeo = new THREE.TorusGeometry(0.05, 0.008, 14, 32);
    geometries.push(sipLipGeo);
    const sipLipMesh = new THREE.Mesh(sipLipGeo, lidMat);
    sipLipMesh.rotation.x = Math.PI / 2;
    sipLipMesh.scale.set(1.2, 0.82, 1.0);
    sipLipMesh.position.set(0, 1.598, 0.22);
    lidGroup.add(sipLipMesh);

    const sipHoleGeo = new THREE.CylinderGeometry(0.044, 0.042, 0.01, 24);
    geometries.push(sipHoleGeo);
    const sipHoleMat = new THREE.MeshStandardMaterial({
      color: 0x111418,
      roughness: 0.92,
      metalness: 0.0,
      clippingPlanes: [cutPlane],
    });
    materials.push(sipHoleMat);
    const sipHoleMesh = new THREE.Mesh(sipHoleGeo, sipHoleMat);
    sipHoleMesh.scale.set(1.18, 1.0, 0.8);
    sipHoleMesh.position.set(0, 1.594, 0.22);
    lidGroup.add(sipHoleMesh);

    const lockBaseGeo = new THREE.BoxGeometry(0.115, 0.016, 0.072);
    geometries.push(lockBaseGeo);
    const lockBaseMesh = new THREE.Mesh(lockBaseGeo, siliconePadMat);
    lockBaseMesh.position.set(0, 1.602, -0.17);
    lidGroup.add(lockBaseMesh);

    const lockButtonGeo = new THREE.BoxGeometry(0.068, 0.016, 0.036);
    geometries.push(lockButtonGeo);
    const lockButtonMat = new THREE.MeshStandardMaterial({
      color: 0xe6eaef,
      metalness: 1.0,
      roughness: 0.2,
      envMapIntensity: 1.2,
      clippingPlanes: [cutPlane],
    });
    materials.push(lockButtonMat);
    const lockButtonMesh = new THREE.Mesh(lockButtonGeo, lockButtonMat);
    lockButtonMesh.position.set(0, 1.615, -0.17);
    lidGroup.add(lockButtonMesh);

    // 6. Scene 1: Coffee liquid & calm rising steam particles (visible out past the rim under lifted lid)
    const coffeeRTop = innerChamberRadiusAtY(COFFEE_LEVEL_Y) - 0.002;
    const coffeeRBot = innerChamberRadiusAtY(CHAMBER_FLOOR_Y) - 0.002;
    const coffeeGeo = new THREE.CylinderGeometry(
      coffeeRTop,
      coffeeRBot,
      COFFEE_LEVEL_Y - CHAMBER_FLOOR_Y,
      48,
      1,
      false,
    );
    geometries.push(coffeeGeo);
    const coffeeMat = new THREE.MeshStandardMaterial({
      color: 0x5b3a29,
      roughness: 0.28,
      metalness: 0.04,
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
      clippingPlanes: [cutPlane],
    });
    materials.push(coffeeMat);
    const coffeeMesh = new THREE.Mesh(coffeeGeo, coffeeMat);
    coffeeMesh.position.y = (COFFEE_LEVEL_Y + CHAMBER_FLOOR_Y) / 2;
    tumblerGroup.add(coffeeMesh);

    const coffeeCapShape = new THREE.Shape();
    coffeeCapShape.moveTo(-coffeeRBot, CHAMBER_FLOOR_Y);
    coffeeCapShape.lineTo(coffeeRBot, CHAMBER_FLOOR_Y);
    coffeeCapShape.lineTo(coffeeRTop, COFFEE_LEVEL_Y);
    coffeeCapShape.lineTo(-coffeeRTop, COFFEE_LEVEL_Y);
    coffeeCapShape.closePath();
    const coffeeCapGeo = new THREE.ShapeGeometry(coffeeCapShape);
    geometries.push(coffeeCapGeo);
    const coffeeCapMat = new THREE.MeshStandardMaterial({
      color: 0x4b2f21,
      roughness: 0.35,
      metalness: 0.02,
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
    });
    materials.push(coffeeCapMat);
    const coffeeCapMesh = new THREE.Mesh(coffeeCapGeo, coffeeCapMat);
    coffeeCapMesh.position.z = 0.003;
    tumblerGroup.add(coffeeCapMesh);

    // Steam particles (fewer particles on mobile <= 600px for light performance)
    const MAX_STEAM_COUNT = 24;
    const MOBILE_STEAM_COUNT = 10;
    const steamGeo = new THREE.SphereGeometry(0.03, 10, 10);
    geometries.push(steamGeo);
    const steamMat = new THREE.MeshBasicMaterial({
      color: 0xd8dfe8,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
    materials.push(steamMat);
    const steamMesh = new THREE.InstancedMesh(steamGeo, steamMat, MAX_STEAM_COUNT);
    steamMesh.frustumCulled = false;
    const steamSeeds = Array.from({ length: MAX_STEAM_COUNT }, (_, idx) => ({
      phase: idx / MAX_STEAM_COUNT,
      xOffset: ((idx * 37) % 19 - 9) * 0.018,
      zOffset: -0.05 - ((idx * 17) % 10) * 0.012,
      speed: 0.38 + ((idx * 13) % 7) * 0.04,
      baseScale: 0.72 + ((idx * 11) % 5) * 0.14,
    }));
    tumblerGroup.add(steamMesh);

    // 7. Scene 2: Evenly-spaced graduation tick lines on back inner wall + dynamic water fill
    const scaleTopY = SCALE_400_Y + 0.045;
    const scaleBotY = CHAMBER_FLOOR_Y;
    const scaleRTop = innerChamberRadiusAtY(scaleTopY) - 0.003;
    const scaleRBot = innerChamberRadiusAtY(scaleBotY) - 0.003;
    const scaleArc = Math.PI * 0.56;
    const scaleGeo = new THREE.CylinderGeometry(
      scaleRTop,
      scaleRBot,
      scaleTopY - scaleBotY,
      32,
      1,
      true,
      Math.PI - scaleArc / 2,
      scaleArc,
    );
    geometries.push(scaleGeo);
    const scaleTex = createGraduationTicksTexture(renderer.capabilities.getMaxAnisotropy());
    textures.push(scaleTex);
    const scaleMat = new THREE.MeshBasicMaterial({
      map: scaleTex,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    materials.push(scaleMat);
    const scaleMesh = new THREE.Mesh(scaleGeo, scaleMat);
    scaleMesh.position.y = (scaleTopY + scaleBotY) / 2;
    tumblerGroup.add(scaleMesh);

    const waterMaxY = SCALE_400_Y;
    const waterRTopMax = innerChamberRadiusAtY(waterMaxY) - 0.002;
    const waterRBot = innerChamberRadiusAtY(CHAMBER_FLOOR_Y) - 0.002;
    const waterBodyGeo = new THREE.CylinderGeometry(
      waterRTopMax,
      waterRBot,
      waterMaxY - CHAMBER_FLOOR_Y,
      48,
      1,
      false,
    );
    geometries.push(waterBodyGeo);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x6b8eb2,
      roughness: 0.22,
      metalness: 0.04,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      clippingPlanes: [cutPlane, waterTopPlane],
    });
    materials.push(waterMat);
    const waterBodyMesh = new THREE.Mesh(waterBodyGeo, waterMat);
    waterBodyMesh.position.y = (waterMaxY + CHAMBER_FLOOR_Y) / 2;
    tumblerGroup.add(waterBodyMesh);

    const waterCapShape = new THREE.Shape();
    waterCapShape.moveTo(-waterRBot, CHAMBER_FLOOR_Y);
    waterCapShape.lineTo(waterRBot, CHAMBER_FLOOR_Y);
    waterCapShape.lineTo(waterRTopMax, waterMaxY);
    waterCapShape.lineTo(-waterRTopMax, waterMaxY);
    waterCapShape.closePath();
    const waterCapGeo = new THREE.ShapeGeometry(waterCapShape);
    geometries.push(waterCapGeo);
    const waterCapMat = new THREE.MeshStandardMaterial({
      color: 0x5c7fa3,
      roughness: 0.25,
      metalness: 0.03,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      clippingPlanes: [waterTopPlane],
    });
    materials.push(waterCapMat);
    const waterCapMesh = new THREE.Mesh(waterCapGeo, waterCapMat);
    waterCapMesh.position.z = 0.003;
    tumblerGroup.add(waterCapMesh);

    const waterSurfaceGeo = new THREE.CircleGeometry(1, 48);
    waterSurfaceGeo.rotateX(-Math.PI / 2);
    geometries.push(waterSurfaceGeo);
    const waterSurfaceMat = new THREE.MeshStandardMaterial({
      color: 0x80a2c4,
      roughness: 0.16,
      metalness: 0.06,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      clippingPlanes: [cutPlane],
    });
    materials.push(waterSurfaceMat);
    const waterSurfaceMesh = new THREE.Mesh(waterSurfaceGeo, waterSurfaceMat);
    tumblerGroup.add(waterSurfaceMesh);

    // 8. Scene 3: Simple translucent eco-bag pouch
    const ecoBag = createEcoBagGroup();
    assemblyGroup.add(ecoBag.group);

    // Floor contact shadow
    const shadowTex = createContactShadowTexture();
    textures.push(shadowTex);
    const shadowGeo = new THREE.PlaneGeometry(1.85, 1.85);
    geometries.push(shadowGeo);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.42,
    });
    materials.push(shadowMat);
    const shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = 0.002;
    scene.add(shadowPlane);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    const dummy = new THREE.Object3D();
    const targetCamPos = new THREE.Vector3();
    const targetCamLook = new THREE.Vector3();
    const projVec = new THREE.Vector3();
    const projAnchorVec = new THREE.Vector3();

    let currentProgress = reducedMotionRef.current ? activeStepRef.current + 1 : storyProgress;
    let currentTime = 0;
    let sloshTimeRemaining = 0;
    let prevReached400 = false;
    let lastMarksCount = -1;
    let contextLost = false;
    let isInView = false;
    let disposed = false;
    let frameId = 0;
    let loopRunning = false;
    let lastTime = performance.now();

    const syncProjectedHtmlOverlays = (prog: number) => {
      camera.updateMatrixWorld();
      const cw = Math.max(container.clientWidth, 1);

      // Update Scene 1 wall labels ("바깥벽", "진공층", "안쪽벽") with leader lines
      const showWallLabels = prog < 0.94;
      for (let i = 0; i < WALL_LABELS.length; i++) {
        const wrapper = wallLabelRefs.current[i];
        const line = wallLineRefs.current[i];
        if (!wrapper || !line) continue;

        if (!showWallLabels) {
          wrapper.style.opacity = '0';
          continue;
        }

        const item = WALL_LABELS[i];
        projVec.set(item.wallX, item.y, 0).project(camera);
        projAnchorVec.set(0.5, item.y, 0).project(camera);

        const startX = (projVec.x * 0.5 + 0.5) * cw;
        const anchorX = (projAnchorVec.x * 0.5 + 0.5) * cw;
        const yPct = (-projVec.y * 0.5 + 0.5) * 100;

        const lineWidth = Math.max(12, anchorX - startX);
        wrapper.style.left = `${startX.toFixed(1)}px`;
        wrapper.style.top = `${yPct.toFixed(2)}%`;
        wrapper.style.opacity = `${Math.max(0, Math.min(1, (0.94 - prog) / 0.12)).toFixed(2)}`;
        line.style.width = `${lineWidth.toFixed(1)}px`;
      }

      // Update Scene 2 scale labels (100 / 200 / 300 / 400ml) centered in front of the water chamber
      const scene2LabelOpacity =
        prog < 0.96
          ? 0
          : prog < 1.08
            ? (prog - 0.96) / 0.12
            : prog < 1.96
              ? 1
              : Math.max(0, 1 - (prog - 1.96) / 0.12);

      for (let i = 0; i < SCALE_MARKS.length; i++) {
        const el = scaleLabelRefs.current[i];
        if (!el) continue;
        if (scene2LabelOpacity < 0.02) {
          el.style.opacity = '0';
          continue;
        }
        projVec.set(0, SCALE_MARKS[i].y, 0.02).project(camera);
        const xPct = (projVec.x * 0.5 + 0.5) * 100;
        const yPct = (-projVec.y * 0.5 + 0.5) * 100;
        el.style.left = `${xPct.toFixed(2)}%`;
        el.style.top = `${yPct.toFixed(2)}%`;
        el.style.opacity = `${scene2LabelOpacity.toFixed(2)}`;
      }
    };

    const applyStoryState = (prog: number, elapsed: number, dt: number, isReduced: boolean) => {
      const p = Math.max(0, Math.min(3, prog));

      // Cutaway offset: 0 (open) in Scenes 1 & 2, sweeps to 0.56 (closed) at start of Scene 3
      const closeFactor = Math.max(0, Math.min(1, (p - 1.98) / 0.24));
      cutPlane.constant = closeFactor * 0.56;

      const capOpacity = Math.max(0, 1 - closeFactor * 2.4);
      outerCapMat.opacity = capOpacity;
      innerCapMat.opacity = capOpacity;
      const showCaps = capOpacity > 0.02;
      outerCapR.visible = showCaps;
      outerCapL.visible = showCaps;
      innerCapR.visible = showCaps;
      innerCapL.visible = showCaps;

      // Scene 1: Lift lid gently upward so steam rises freely in full view; smoothly close down into Scene 2
      const lidLiftFactor = p < 0.85 ? 1 : Math.max(0, 1 - (p - 0.85) / 0.2);
      lidGroup.position.y = lidLiftFactor * 0.34;

      // Scene 1: Coffee & rising steam
      const coffeeFade = p < 0.9 ? 1 : Math.max(0, 1 - (p - 0.9) / 0.14);
      coffeeMat.opacity = coffeeFade;
      coffeeCapMat.opacity = coffeeFade;
      const showCoffee = coffeeFade > 0.02;
      coffeeMesh.visible = showCoffee;
      coffeeCapMesh.visible = showCoffee;

      const steamAlpha = coffeeFade * 0.42;
      steamMat.opacity = steamAlpha;
      steamMesh.visible = steamAlpha > 0.02;
      if (steamMesh.visible) {
        const activeSteamCount = isDesktopRef.current ? MAX_STEAM_COUNT : MOBILE_STEAM_COUNT;
        steamMesh.count = activeSteamCount;
        for (let i = 0; i < activeSteamCount; i++) {
          const seed = steamSeeds[i];
          const life = isReduced
            ? (0.35 + seed.phase * 0.4) % 1
            : (seed.phase + elapsed * seed.speed) % 1;
          // Rise up through the open rim (y=1.06 .. 1.72) under the lifted lid
          const riseY = COFFEE_LEVEL_Y + 0.04 + life * 0.66;
          const swayX = isReduced
            ? seed.xOffset
            : seed.xOffset + Math.sin(elapsed * 1.8 + i) * 0.024;
          const s = seed.baseScale * Math.sin(life * Math.PI);
          dummy.position.set(swayX, riseY, seed.zOffset);
          dummy.scale.setScalar(Math.max(0.001, s));
          dummy.updateMatrix();
          steamMesh.setMatrixAt(i, dummy.matrix);
        }
        steamMesh.instanceMatrix.needsUpdate = true;
      }

      // Scene 2: Evenly-spaced graduation ticks & water fill
      const scene2Vis =
        p < 0.96
          ? 0
          : p < 1.08
            ? (p - 0.96) / 0.12
            : p < 1.98
              ? 1
              : Math.max(0, 1 - (p - 1.98) / 0.14);
      scaleMat.opacity = scene2Vis * 0.85;
      scaleMesh.visible = scene2Vis > 0.02;

      const t1 = Math.max(0, Math.min(1, p - 1));
      const fillFrac = isReduced && activeStepRef.current === 1 ? 1 : Math.min(1, t1 / 0.78);
      const currentWaterY = CHAMBER_FLOOR_Y + fillFrac * (SCALE_400_Y - CHAMBER_FLOOR_Y);
      waterTopPlane.constant = currentWaterY;

      const marksReached =
        fillFrac >= 0.99
          ? 4
          : fillFrac >= 0.75
            ? 3
            : fillFrac >= 0.5
              ? 2
              : fillFrac >= 0.25
                ? 1
                : 0;
      if (marksReached !== lastMarksCount) {
        lastMarksCount = marksReached;
        setReachedWaterMarks(marksReached);
      }

      const waterAlpha = scene2Vis * (fillFrac > 0.01 ? 0.82 : 0);
      waterMat.opacity = waterAlpha;
      waterCapMat.opacity = waterAlpha;
      waterSurfaceMat.opacity = scene2Vis * (fillFrac > 0.01 ? 0.9 : 0);
      const showWater = waterAlpha > 0.02;
      waterBodyMesh.visible = showWater;
      waterCapMesh.visible = showWater;
      waterSurfaceMesh.visible = showWater;

      if (showWater) {
        const surfRadius = innerChamberRadiusAtY(currentWaterY) - 0.003;
        waterSurfaceMesh.position.y = currentWaterY;
        waterSurfaceMesh.scale.set(surfRadius, 1, surfRadius);

        const reached400 = fillFrac >= 0.995 && p >= 1.75 && p < 2.05;
        if (!isReduced && reached400 && !prevReached400) {
          sloshTimeRemaining = 1.4;
        }
        prevReached400 = reached400;

        if (!isReduced && sloshTimeRemaining > 0) {
          sloshTimeRemaining = Math.max(0, sloshTimeRemaining - dt);
          const sloshAge = 1.4 - sloshTimeRemaining;
          const dampAmp = 0.065 * Math.exp(-sloshAge * 2.4);
          waterSurfaceMesh.rotation.z = Math.sin(sloshAge * 13) * dampAmp;
          waterSurfaceMesh.rotation.x = Math.cos(sloshAge * 10) * dampAmp * 0.7;
        } else {
          waterSurfaceMesh.rotation.set(0, 0, 0);
        }
      }

      // Scene 3: Button click -> open-top translucent eco-bag appears -> tumbler tilts sideways inside (only lid tip peeking out) -> gentle sway
      const t2 = isReduced && activeStepRef.current === 2 ? 1 : Math.max(0, Math.min(1, p - 2));

      const pressDepth = Math.max(0, Math.min(1, (t2 - 0.14) / 0.14));
      lockButtonMesh.position.y = 1.615 - pressDepth * 0.011;

      const bagVis = Math.max(0, Math.min(1, (t2 - 0.3) / 0.18));
      ecoBag.group.visible = bagVis > 0.02;
      ecoBag.backMat.opacity = bagVis * 0.88;
      ecoBag.gussetMat.opacity = bagVis * 0.82;
      ecoBag.frontMat.opacity = bagVis * 0.52;
      ecoBag.frontHemMat.opacity = bagVis * 0.72;
      ecoBag.strapMat.opacity = bagVis * 0.85;

      // Tilt sideways ~57.6 deg inside the bag cavity so the body sits behind the translucent front cloth and only the lid tip peeks above the opening
      const layFrac = Math.max(0, Math.min(1, (t2 - 0.34) / 0.3));
      const smoothLay = layFrac * layFrac * (3 - 2 * layFrac);
      tumblerGroup.rotation.z = smoothLay * (Math.PI * 0.32);
      tumblerGroup.position.x = smoothLay * 0.66;
      tumblerGroup.position.y = smoothLay * 0.36;

      // Sway the eco-bag once tucked (t2 in 0.64..0.94), then settle still for the final 15% hold (t2 === 1.0)
      const swayIn = Math.max(0, Math.min(1, (t2 - 0.64) / 0.1));
      const swayOut = Math.max(0, Math.min(1, (1.0 - t2) / 0.06));
      const shakeFactor = isReduced ? 0 : swayIn * swayOut;
      if (shakeFactor > 0.01) {
        assemblyGroup.rotation.z = Math.sin(elapsed * 4.4) * 0.048 * shakeFactor;
        assemblyGroup.position.x = Math.sin(elapsed * 3.1) * 0.025 * shakeFactor;
      } else {
        assemblyGroup.rotation.z = 0;
        assemblyGroup.position.x = 0;
      }

      // Camera framing tailored cleanly to each act so nothing ever clips on the edges
      if (p < 1.0) {
        // Scene 1: extra headroom for lifted lid & rising steam
        targetCamPos.set(0, 1.04, 3.55);
        targetCamLook.set(0, 0.94, 0);
      } else if (p < 1.98) {
        // Scene 2: crisp front-on cutaway centered on the graduated chamber
        targetCamPos.set(0, 0.92, 3.25);
        targetCamLook.set(0, 0.8, 0);
      } else if (t2 < 0.32) {
        // Phase 3A/3B: subtle shift up for the lock button click
        const focus = Math.sin(Math.min(1, t2 / 0.32) * Math.PI);
        targetCamPos.set(0.16 * focus, 0.92 + 0.82 * focus, 3.25 - 0.55 * focus);
        targetCamLook.set(0, 0.8 + 0.54 * focus, 0);
      } else {
        // Phase 3C/3D: pulled back so entire eco-bag + handles + tucked tumbler fit cleanly inside safe area
        const bagCam = Math.min(1, (t2 - 0.32) / 0.24);
        targetCamPos.set(0, 0.92 + 0.1 * bagCam, 3.25 + 2.2 * bagCam);
        targetCamLook.set(0, 0.8 + 0.12 * bagCam, 0);
      }

      if (isReduced || isSoftwareGl) {
        camPos.copy(targetCamPos);
        camLook.copy(targetCamLook);
      } else {
        const camLambda = 7.5;
        camPos.x = THREE.MathUtils.damp(camPos.x, targetCamPos.x, camLambda, dt);
        camPos.y = THREE.MathUtils.damp(camPos.y, targetCamPos.y, camLambda, dt);
        camPos.z = THREE.MathUtils.damp(camPos.z, targetCamPos.z, camLambda, dt);
        camLook.x = THREE.MathUtils.damp(camLook.x, targetCamLook.x, camLambda, dt);
        camLook.y = THREE.MathUtils.damp(camLook.y, targetCamLook.y, camLambda, dt);
        camLook.z = THREE.MathUtils.damp(camLook.z, targetCamLook.z, camLambda, dt);
      }
      camera.position.copy(camPos);
      camera.lookAt(camLook);

      const shadowScale = 1 + bagVis * 0.2;
      shadowPlane.scale.set(shadowScale, shadowScale * (1 - bagVis * 0.25), 1);
      shadowMat.opacity = 0.42 - bagVis * 0.12;

      syncProjectedHtmlOverlays(p);
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
        const staticProgress = activeStepRef.current + 1;
        applyStoryState(staticProgress, 0, 0, true);
        renderer.render(scene, camera);
        loopRunning = false;
        return;
      }

      currentTime += dt;
      currentProgress = isSoftwareGl
        ? targetProgressRef.current
        : THREE.MathUtils.damp(currentProgress, targetProgressRef.current, 14, dt);

      applyStoryState(currentProgress, currentTime, dt, false);
      renderer.render(scene, camera);
      scheduleNext(tick);
    };

    const startLoopIfActive = () => {
      if (disposed || contextLost || !isInView || document.hidden) return;
      if (reducedMotionRef.current) {
        applyStoryState(activeStepRef.current + 1, 0, 0, true);
        renderer.render(scene, camera);
        return;
      }
      if (!loopRunning) {
        loopRunning = true;
        lastTime = performance.now();
        tick();
      }
    };

    wakeRenderRef.current = startLoopIfActive;

    const handleResize = () => {
      if (!container || disposed) return;
      const w = Math.max(container.clientWidth, 1);
      const h = Math.max(container.clientHeight, 1);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      syncProjectedHtmlOverlays(
        reducedMotionRef.current ? activeStepRef.current + 1 : currentProgress,
      );
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

    applyStoryState(
      reducedMotionRef.current ? activeStepRef.current + 1 : storyProgress,
      0,
      0,
      reducedMotionRef.current,
    );
    renderer.render(scene, camera);

    return () => {
      disposed = true;
      wakeRenderRef.current = null;
      stopLoop();
      visibilityObserver?.disconnect();
      resizeObserver.disconnect();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      ecoBag.dispose();
      envTarget.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  const t0 = reducedMotion ? 1 : Math.max(0, Math.min(1, readoutProgress));
  const hours = Math.round(t0 * 7);
  const temp = Math.round(95 - t0 * 35);

  return (
    <div className="w-full flex flex-col items-center">
      <div className="relative w-full max-w-[360px] min-[601px]:max-w-[448px]">
        <div
          role="img"
          aria-label="특징 설명에 따라 단면, 물 채움, 원터치 밀폐 과정을 보여 주는 WARM 400 텀블러 3D 그래픽"
          style={{
            maskImage:
              'radial-gradient(ellipse 98% 98% at 50% 50%, #000 80%, rgba(0, 0, 0, 0.55) 93%, transparent 100%)',
            WebkitMaskImage:
              'radial-gradient(ellipse 98% 98% at 50% 50%, #000 80%, rgba(0, 0, 0, 0.55) 93%, transparent 100%)',
          }}
          className="w-full h-44 min-[601px]:h-[432px] mx-auto pointer-events-none select-none"
        >
          {webglUnavailable ? (
            <div className="w-full h-full flex items-center justify-center p-4 text-center text-sm text-neutral-500">
              WARM 400 텀블러 3D 그래픽
            </div>
          ) : (
            <div ref={mountRef} className="w-full h-full" />
          )}
        </div>

        {/* Scene 1 Cutaway Leader Lines + Labels (13px gray HTML) */}
        {!webglUnavailable && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-visible">
            {WALL_LABELS.map((item, idx) => (
              <div
                key={item.id}
                ref={(el) => {
                  wallLabelRefs.current[idx] = el;
                }}
                style={{ opacity: 0, transform: 'translateY(-50%)' }}
                className="absolute flex items-center gap-1.5 transition-opacity duration-150"
              >
                <span
                  ref={(el) => {
                    wallLineRefs.current[idx] = el;
                  }}
                  className="block h-px bg-neutral-400 shrink-0"
                />
                <span className="text-[13px] leading-none text-neutral-500 whitespace-nowrap">
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Scene 2 Graduation Labels (13px HTML in front of water chamber, highlighted as water passes) */}
        {!webglUnavailable && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            {SCALE_MARKS.map((mark, idx) => {
              const reached = reachedWaterMarks > idx;
              return (
                <div
                  key={mark.id}
                  ref={(el) => {
                    scaleLabelRefs.current[idx] = el;
                  }}
                  style={{
                    opacity: 0,
                    transform: 'translate(-50%, -50%)',
                    textShadow:
                      '0 0 6px rgba(255, 255, 255, 0.96), 0 0 2px rgba(255, 255, 255, 0.96)',
                  }}
                  className={`absolute text-[13px] leading-none tabular-nums whitespace-nowrap transition-colors duration-200 ${
                    reached ? 'font-bold text-neutral-950' : 'font-normal text-neutral-500'
                  }`}
                >
                  {mark.label}
                </div>
              );
            })}
          </div>
        )}

        {/* Scene 1 Readout: Bottom-left empty space beside the tumbler shadow so it never overlaps the lifted lid */}
        {(reducedMotion ? activeStep === 0 : readoutProgress < 0.96) && (
          <div
            aria-live="off"
            className="absolute left-0 bottom-2 min-[601px]:bottom-4 flex items-center justify-center gap-2 min-[601px]:gap-3 border border-neutral-200 bg-white/95 rounded-lg px-2.5 py-1.5 min-[601px]:px-4 min-[601px]:py-2 text-xs min-[601px]:text-sm font-medium text-neutral-800"
          >
            <span className="inline-flex items-center gap-1 tabular-nums whitespace-nowrap">
              <Clock
                className="w-3.5 h-3.5 min-[601px]:w-4 min-[601px]:h-4 text-neutral-600"
                aria-hidden="true"
              />
              {hours}시간
            </span>
            <span aria-hidden="true" className="text-neutral-300">
              ·
            </span>
            <span className="inline-flex items-center gap-1 tabular-nums whitespace-nowrap">
              <Thermometer
                className="w-3.5 h-3.5 min-[601px]:w-4 min-[601px]:h-4 text-neutral-600"
                aria-hidden="true"
              />
              {temp}℃
            </span>
          </div>
        )}

        {/* Scene 3 Readout: Appears only after tumbler has finished entering the eco-bag */}
        {(reducedMotion ? activeStep === 2 : readoutProgress >= 2.66) && (
          <div
            aria-live="off"
            className="absolute right-0 top-2 min-[601px]:top-4 flex items-center justify-center gap-1.5 border border-neutral-200 bg-white/95 rounded-lg px-2.5 py-1.5 min-[601px]:px-4 min-[601px]:py-2 text-xs min-[601px]:text-sm font-medium text-neutral-800 whitespace-nowrap"
          >
            <Droplets
              className="w-3.5 h-3.5 min-[601px]:w-4 min-[601px]:h-4 text-neutral-600"
              aria-hidden="true"
            />
            <span className="tabular-nums">새는 물 0방울</span>
          </div>
        )}
      </div>

      <p className="mt-2 text-xs text-neutral-500 text-center">이해를 돕기 위한 그래픽입니다</p>
    </div>
  );
}
