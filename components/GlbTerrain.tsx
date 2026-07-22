"use client";

import { useEffect, useRef } from "react";
import { DEFAULT_MAP_GLB_CFG, type MapGlbCfg } from "@/lib/quest-game";

// Three.js 3D terrain viewer for a quest map's GLB mesh (Higgsfield image→3D).
// The flat quest map art is projected onto the mesh UNLIT (never dark) so the
// terrain always shows the exact art colours. By default the art is draped
// top-down by world XZ ("planar") so features land in their correct place on
// the 3D rock; admins can nudge offset / scale / rotation / flip / yaw /
// brightness to line it up perfectly (all live). three.js is loaded lazily so
// it never enters the main bundle.
export default function GlbTerrain({
  url, textureUrl, accent = "#8b5cf6", cfg,
}: { url: string; textureUrl?: string | null; accent?: string; cfg?: MapGlbCfg | null }) {
  const ref = useRef<HTMLDivElement | null>(null);
  // Live-tunable values read every frame so the admin editor updates instantly
  // without rebuilding the three.js scene.
  const cfgRef = useRef<Required<MapGlbCfg>>({ ...DEFAULT_MAP_GLB_CFG, ...(cfg ?? {}) });
  useEffect(() => { cfgRef.current = { ...DEFAULT_MAP_GLB_CFG, ...(cfg ?? {}) }; }, [cfg]);

  // Structural settings that require a rebuild (projection + which mesh UVs).
  const projection = cfg?.projection ?? DEFAULT_MAP_GLB_CFG.projection;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let stop = false;
    let frame = 0;
    let renderer: import("three").WebGLRenderer | null = null;

    (async () => {
      const THREE = await import("three");
      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      if (stop || !el) return;

      const scene = new THREE.Scene();
      const cam = new THREE.PerspectiveCamera(45, Math.max(1, el.clientWidth) / Math.max(1, el.clientHeight), 0.01, 100);
      cam.position.set(0, 1.2, 2.5);
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(el.clientWidth, el.clientHeight);
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      el.appendChild(renderer.domElement);

      const controls = new OrbitControls(cam, renderer.domElement);
      controls.enableDamping = true;
      controls.autoRotateSpeed = 1.1;
      controls.minDistance = 1.2;
      controls.maxDistance = 5;

      // The map art, loaded once, applied UNLIT so nothing is ever in shadow.
      let tex: import("three").Texture | null = null;
      if (textureUrl) {
        try {
          tex = await new THREE.TextureLoader().loadAsync(textureUrl);
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
          tex.center.set(0.5, 0.5);
        } catch { tex = null; }
      }
      if (stop) return;

      const materials: import("three").MeshBasicMaterial[] = [];

      new GLTFLoader().load(url, (g) => {
        if (stop) return;
        const obj = g.scene;

        // Normalise to a unit-ish size centred at origin FIRST so planar UVs use
        // the local geometry box.
        const box0 = new THREE.Box3().setFromObject(obj);
        const size0 = box0.getSize(new THREE.Vector3());
        const minXZ = new THREE.Vector3(box0.min.x, 0, box0.min.z);
        const spanX = size0.x || 1, spanZ = size0.z || 1;

        obj.traverse((child) => {
          const mesh = child as import("three").Mesh;
          if (!mesh.isMesh) return;

          // Planar top-down UVs: project each vertex onto the XZ plane so the
          // flat art lays over the terrain in the right position.
          if (projection === "planar" && mesh.geometry) {
            const pos = mesh.geometry.getAttribute("position");
            if (pos) {
              const uv = new Float32Array(pos.count * 2);
              const v = new THREE.Vector3();
              const worldMatrix = mesh.matrixWorld;
              mesh.updateWorldMatrix(true, false);
              for (let i = 0; i < pos.count; i++) {
                v.fromBufferAttribute(pos, i).applyMatrix4(worldMatrix);
                uv[i * 2] = (v.x - minXZ.x) / spanX;
                uv[i * 2 + 1] = (v.z - minXZ.z) / spanZ;
              }
              mesh.geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
            }
          }

          // Unlit material showing the texture at full brightness.
          const existing = mesh.material as import("three").MeshStandardMaterial;
          const map = tex ?? existing?.map ?? null;
          const mat = new THREE.MeshBasicMaterial({ map: map ?? undefined, color: 0xffffff, side: THREE.DoubleSide });
          if (!map) mat.color.set(new THREE.Color(accent).multiplyScalar(0.7));
          mesh.material = mat;
          materials.push(mat);
        });

        const box = new THREE.Box3().setFromObject(obj);
        const size = box.getSize(new THREE.Vector3()).length() || 1;
        const center = box.getCenter(new THREE.Vector3());
        obj.position.sub(center);
        obj.scale.setScalar(2.3 / size);
        obj.name = "terrain";
        scene.add(obj);
      });

      const onResize = () => {
        if (!el || !renderer) return;
        cam.aspect = Math.max(1, el.clientWidth) / Math.max(1, el.clientHeight);
        cam.updateProjectionMatrix();
        renderer.setSize(el.clientWidth, el.clientHeight);
      };
      const ro = new ResizeObserver(onResize);
      ro.observe(el);

      let lastYaw = 0;
      const loop = () => {
        if (stop) { ro.disconnect(); return; }
        const c = cfgRef.current;
        // Live texture transform.
        if (tex) {
          tex.offset.set(c.offsetX, c.offsetY);
          tex.repeat.set((c.flipX ? -1 : 1) * c.scaleX, (c.flipY ? -1 : 1) * c.scaleY);
          tex.rotation = (c.rotation * Math.PI) / 180;
          tex.needsUpdate = true;
        }
        for (const m of materials) { const b = c.brightness; m.color.setRGB(b, b, b); }
        // Model yaw + optional auto-rotate.
        const terrain = scene.getObjectByName("terrain");
        if (terrain) {
          if (c.autoRotate) terrain.rotation.y += 0.006;
          else { terrain.rotation.y += ((c.yaw * Math.PI) / 180) - lastYaw; lastYaw = (c.yaw * Math.PI) / 180; }
        }
        controls.update();
        renderer!.render(scene, cam);
        frame = requestAnimationFrame(loop);
      };
      loop();
    })();

    return () => {
      stop = true;
      cancelAnimationFrame(frame);
      renderer?.dispose();
      if (el) el.innerHTML = "";
    };
  }, [url, textureUrl, accent, projection]);

  return <div ref={ref} className="absolute inset-0" style={{ touchAction: "none" }} />;
}
