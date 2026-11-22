import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export interface DisposableTracker {
  geometries: THREE.BufferGeometry[];
  materials: THREE.Material[];
  textures: THREE.Texture[];
}

export interface Warm400TumblerAssets {
  group: THREE.Group;
  bodyMat: THREE.MeshPhysicalMaterial;
  logoMat: THREE.MeshStandardMaterial;
  dispose: () => void;
}

export function detectSoftwareWebGL(): { supported: boolean; isSoftwareGl: boolean } {
  let probeCanvas: HTMLCanvasElement | null = document.createElement('canvas');
  const probeGl =
    probeCanvas.getContext('webgl2') ||
    probeCanvas.getContext('webgl') ||
    probeCanvas.getContext('experimental-webgl');

  if (!probeGl) {
    probeCanvas = null;
    return { supported: false, isSoftwareGl: false };
  }

  const glCtx = probeGl as WebGLRenderingContext;
  const debugExt = glCtx.getExtension('WEBGL_debug_renderer_info');
  const rendererParam = debugExt ? debugExt.UNMASKED_RENDERER_WEBGL : glCtx.RENDERER;
  const gpuString = String(glCtx.getParameter(rendererParam) || '');
  glCtx.getExtension('WEBGL_lose_context')?.loseContext();
  probeCanvas = null;

  const isSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpuString);
  return { supported: true, isSoftwareGl };
}

export function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const half = size / 2;
    const gradient = ctx.createRadialGradient(half, half, 14, half, half, half);
    gradient.addColorStop(0, 'rgba(17, 24, 39, 0.45)');
    gradient.addColorStop(0.45, 'rgba(17, 24, 39, 0.2)');
    gradient.addColorStop(0.75, 'rgba(17, 24, 39, 0.06)');
    gradient.addColorStop(1, 'rgba(17, 24, 39, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createSilkscreenLogoTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const width = 1024;
  const height = 256;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 58px "Noto Sans KR", sans-serif';

    const label = 'WARM 400';
    const tracking = 10;
    const chars = Array.from(label);
    const charWidths = chars.map((ch) => ctx.measureText(ch).width);
    const totalWidth =
      charWidths.reduce((acc, w) => acc + w, 0) + tracking * (chars.length - 1);

    let cursorX = (width - totalWidth) / 2;
    const centerY = height / 2;
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      const w = charWidths[i];
      ctx.fillText(ch, cursorX + w / 2, centerY);
      cursorX += w + tracking;
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  texture.needsUpdate = true;
  return texture;
}

export function setupStudioLightingAndEnv(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  isSoftwareGl: boolean,
): THREE.WebGLRenderTarget {
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const envTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envTarget.texture;
  pmremGenerator.dispose();

  const hemiLight = new THREE.HemisphereLight(0xf1f5ff, 0xd8d4cf, 0.85);
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight(0xfff8ef, 1.65);
  keyLight.position.set(3.2, 4.8, 3.6);
  keyLight.castShadow = !isSoftwareGl;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 14;
  keyLight.shadow.camera.left = -2;
  keyLight.shadow.camera.right = 2;
  keyLight.shadow.camera.top = 2.5;
  keyLight.shadow.camera.bottom = -1.5;
  keyLight.shadow.bias = -0.0005;
  keyLight.shadow.normalBias = 0.02;
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0xffffff, 0.9);
  rimLight.position.set(-2.8, 2.4, -3.0);
  scene.add(rimLight);

  return envTarget;
}

export function createWarm400TumblerModel(options: {
  bodyHex?: string;
  inkHex?: string;
  maxAnisotropy: number;
  castShadow?: boolean;
}): Warm400TumblerAssets {
  const {
    bodyHex = '#f2ece1',
    inkHex = '#1c2026',
    maxAnisotropy,
    castShadow = false,
  } = options;

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];

  const group = new THREE.Group();

  // 1. Thin bottom silicone pad (flush on ground y = 0)
  const padProfile = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.296, 0.0),
    new THREE.Vector2(0.308, 0.004),
    new THREE.Vector2(0.314, 0.012),
    new THREE.Vector2(0.314, 0.024),
    new THREE.Vector2(0.0, 0.024),
  ];
  const baseGeo = new THREE.LatheGeometry(padProfile, 72);
  baseGeo.computeVertexNormals();
  geometries.push(baseGeo);

  const siliconePadMat = new THREE.MeshStandardMaterial({
    color: 0x3b3f46,
    roughness: 0.92,
    metalness: 0.02,
  });
  materials.push(siliconePadMat);

  const baseMesh = new THREE.Mesh(baseGeo, siliconePadMat);
  baseMesh.castShadow = castShadow;
  baseMesh.receiveShadow = castShadow;
  group.add(baseMesh);

  // 2. Powder-coated matte body with softly rounded top & bottom edges (wider at top)
  const bodyProfile = [
    new THREE.Vector2(0.0, 0.022),
    new THREE.Vector2(0.305, 0.022),
    new THREE.Vector2(0.322, 0.025),
    new THREE.Vector2(0.336, 0.036),
    new THREE.Vector2(0.343, 0.056),
    new THREE.Vector2(0.346, 0.085),
    new THREE.Vector2(0.404, 1.345),
    new THREE.Vector2(0.405, 1.368),
    new THREE.Vector2(0.402, 1.386),
    new THREE.Vector2(0.395, 1.398),
    new THREE.Vector2(0.365, 1.402),
  ];
  const bodyGeo = new THREE.LatheGeometry(bodyProfile, 72);
  bodyGeo.computeVertexNormals();
  geometries.push(bodyGeo);

  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(bodyHex),
    roughness: 0.5,
    metalness: 0.04,
    clearcoat: 0.16,
    clearcoatRoughness: 0.45,
    envMapIntensity: 0.95,
  });
  materials.push(bodyMat);

  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  bodyMesh.castShadow = castShadow;
  bodyMesh.receiveShadow = castShadow;
  group.add(bodyMesh);

  // 3. Silkscreen "WARM 400" print curved flush onto the front face of the tapered body
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

  const logoTexture = createSilkscreenLogoTexture(maxAnisotropy);
  textures.push(logoTexture);

  const logoMat = new THREE.MeshStandardMaterial({
    map: logoTexture,
    color: new THREE.Color(inkHex),
    transparent: true,
    depthWrite: false,
    roughness: 0.42,
    metalness: 0.05,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  materials.push(logoMat);

  const logoMesh = new THREE.Mesh(logoGeo, logoMat);
  logoMesh.position.y = (logoYBottom + logoYTop) / 2;
  group.add(logoMesh);

  // 4. Mirror-polished stainless steel upper rim collar (metalness 1, roughness 0.2)
  const rimProfile = [
    new THREE.Vector2(0.365, 1.4),
    new THREE.Vector2(0.398, 1.4),
    new THREE.Vector2(0.409, 1.412),
    new THREE.Vector2(0.413, 1.43),
    new THREE.Vector2(0.413, 1.468),
    new THREE.Vector2(0.408, 1.482),
    new THREE.Vector2(0.398, 1.488),
    new THREE.Vector2(0.37, 1.488),
  ];
  const rimGeo = new THREE.LatheGeometry(rimProfile, 72);
  rimGeo.computeVertexNormals();
  geometries.push(rimGeo);

  const rimMat = new THREE.MeshStandardMaterial({
    color: 0xe6eaef,
    metalness: 1.0,
    roughness: 0.2,
    envMapIntensity: 1.2,
  });
  materials.push(rimMat);

  const rimMesh = new THREE.Mesh(rimGeo, rimMat);
  rimMesh.castShadow = castShadow;
  rimMesh.receiveShadow = castShadow;
  group.add(rimMesh);

  // 5. Silicone seal ring between metallic rim and lid
  const gasketGeo = new THREE.TorusGeometry(0.398, 0.006, 12, 72);
  geometries.push(gasketGeo);
  const gasketMat = new THREE.MeshStandardMaterial({
    color: 0x9ca3af,
    roughness: 0.85,
    metalness: 0.02,
  });
  materials.push(gasketMat);
  const gasketMesh = new THREE.Mesh(gasketGeo, gasketMat);
  gasketMesh.rotation.x = Math.PI / 2;
  gasketMesh.position.y = 1.49;
  group.add(gasketMesh);

  // 6. Flat top lid with softly bevelled outer edge
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
  const lidGeo = new THREE.LatheGeometry(lidProfile, 72);
  lidGeo.computeVertexNormals();
  geometries.push(lidGeo);

  const lidMat = new THREE.MeshStandardMaterial({
    color: 0x2c3037,
    roughness: 0.54,
    metalness: 0.06,
  });
  materials.push(lidMat);

  const lidMesh = new THREE.Mesh(lidGeo, lidMat);
  lidMesh.castShadow = castShadow;
  lidMesh.receiveShadow = castShadow;
  group.add(lidMesh);

  // 7. Drinking hole on front top of the lid (+Z side)
  const sipLipGeo = new THREE.TorusGeometry(0.05, 0.008, 16, 36);
  geometries.push(sipLipGeo);
  const sipLipMesh = new THREE.Mesh(sipLipGeo, lidMat);
  sipLipMesh.rotation.x = Math.PI / 2;
  sipLipMesh.scale.set(1.2, 0.82, 1.0);
  sipLipMesh.position.set(0, 1.598, 0.22);
  group.add(sipLipMesh);

  const sipHoleGeo = new THREE.CylinderGeometry(0.044, 0.042, 0.01, 32);
  geometries.push(sipHoleGeo);
  const sipHoleMat = new THREE.MeshStandardMaterial({
    color: 0x111418,
    roughness: 0.92,
    metalness: 0.0,
  });
  materials.push(sipHoleMat);
  const sipHoleMesh = new THREE.Mesh(sipHoleGeo, sipHoleMat);
  sipHoleMesh.scale.set(1.18, 1.0, 0.8);
  sipHoleMesh.position.set(0, 1.594, 0.22);
  group.add(sipHoleMesh);

  // 8. Small one-touch lock button assembly on the lid
  const lockBaseGeo = new THREE.BoxGeometry(0.115, 0.016, 0.072);
  geometries.push(lockBaseGeo);
  const lockBaseMesh = new THREE.Mesh(lockBaseGeo, siliconePadMat);
  lockBaseMesh.position.set(0, 1.602, -0.17);
  group.add(lockBaseMesh);

  const lockButtonGeo = new THREE.BoxGeometry(0.068, 0.014, 0.036);
  geometries.push(lockButtonGeo);
  const lockButtonMesh = new THREE.Mesh(lockButtonGeo, rimMat);
  lockButtonMesh.position.set(0, 1.613, -0.17);
  group.add(lockButtonMesh);

  return {
    group,
    bodyMat,
    logoMat,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
    },
  };
}
