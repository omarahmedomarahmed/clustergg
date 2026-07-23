"use client";

import { useEffect, useRef } from "react";
import { DEFAULT_MAP_GLB_CFG, type MapGlbCfg } from "@/lib/quest-game";

// Three.js 3D terrain viewer for a quest map's GLB mesh (Higgsfield image→3D).
// The flat quest map art is projected onto the mesh UNLIT (never dark) so the
// terrain always shows the exact art colours. By default the art is draped
// top-down by world XZ ("planar", axis "y") so features land in their correct
// place on the 3D rock; admins can pick a different projection plane and nudge
// offset / scale / rotation / flip / yaw / pitch / brightness / contrast to line
// it up perfectly (all live). three.js is loaded lazily so it never enters the
// main bundle.
export default function GlbTerrain({
  url, textureUrl, accent = "#8b5cf6", cfg,
}: { url: string; textureUrl?: string | null; accent?: string; cfg?: MapGlbCfg | null }) {
  const ref = useRef<HTMLDivElement | null>(null);
  // Live-tunable values read every frame so the admin editor updates instantly
  // without rebuilding the three.js scene.
  const cfgRef = useRef<Required<MapGlbCfg>>({ ...DEFAULT_MAP_GLB_CFG, ...(cfg ?? {}) });
  useEffect(() => { cfgRef.current = { ...DEFAULT_MAP_GLB_CFG, ...(cfg ?? {}) }; }, [cfg]);

  // Structural settings that require a rebuild (projection plane / axis / fit).
  const projection = cfg?.projection ?? DEFAULT_MAP_GLB_CFG.projection;
  const planarAxis = cfg?.planarAxis ?? DEFAULT_MAP_GLB_CFG.planarAxis;
  const fitContain = cfg?.fitContain ?? DEFAULT_MAP_GLB_CFG.fitContain;

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

        // IMPORTANT: flush every node's world matrix BEFORE we read it. The old
        // code captured `mesh.matrixWorld` before calling updateWorldMatrix, so
        // the UVs were baked from a stale (often identity) matrix — the #1 reason
        // the art never lined up. Update the whole tree once up front instead.
        obj.updateMatrixWorld(true);

        // Measure the mesh footprint in WORLD space (matches the baked vertices).
        const box0 = new THREE.Box3().setFromObject(obj);
        const size0 = box0.getSize(new THREE.Vector3());

        // Pick the two axes to drape the art across, based on the chosen plane.
        //   "y" top-down  → U=X, V=Z   (default; features land like a map)
        //   "z" front     → U=X, V=Y
        //   "x" side      → U=Z, V=Y
        const axisMap = {
          y: { u: "x", v: "z" },
          z: { u: "x", v: "y" },
          x: { u: "z", v: "y" },
        } as const;
        const { u: uAxis, v: vAxis } = axisMap[planarAxis];
        const uMin = box0.min[uAxis], vMin = box0.min[vAxis];
        let uSpan = size0[uAxis] || 1, vSpan = size0[vAxis] || 1;
        // fitContain: use the SAME span on both axes (the larger one) so the art
        // keeps its aspect ratio and covers the footprint once without stretching.
        if (fitContain) { const m = Math.max(uSpan, vSpan); uSpan = m; vSpan = m; }

        obj.traverse((child) => {
          const mesh = child as import("three").Mesh;
          if (!mesh.isMesh) return;

          // Planar UVs: project each vertex (in world space) onto the chosen
          // plane so the flat art lays over the terrain in the right position.
          if (projection === "planar" && mesh.geometry) {
            const pos = mesh.geometry.getAttribute("position");
            if (pos) {
              const uv = new Float32Array(pos.count * 2);
              const v = new THREE.Vector3();
              for (let i = 0; i < pos.count; i++) {
                v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
                uv[i * 2] = (v[uAxis] - uMin) / uSpan;
                uv[i * 2 + 1] = (v[vAxis] - vMin) / vSpan;
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

        // Now (AFTER UVs are baked from world space) centre + scale to fit view.
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
        // Brightness + a gentle contrast curve baked into the flat colour tint.
        for (const m of materials) {
          const b = c.brightness;
          // contrast>1 darkens mid-lows a touch to fake depth; applied around 0.5.
          const k = c.contrast;
          const tint = Math.min(3, Math.max(0.1, 0.5 + (b - 0.5) * k));
          m.color.setRGB(tint, tint, tint);
          if (m.wireframe !== c.wireframe) m.wireframe = c.wireframe;
        }
        // Model yaw + pitch + optional auto-rotate.
        const terrain = scene.getObjectByName("terrain");
        if (terrain) {
          terrain.rotation.x = (c.pitch * Math.PI) / 180;
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
  }, [url, textureUrl, accent, projection, planarAxis, fitContain]);

  return <div ref={ref} className="absolute inset-0" style={{ touchAction: "none" }} />;
}
