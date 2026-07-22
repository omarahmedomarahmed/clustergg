"use client";

import { useEffect, useRef } from "react";

// Three.js 3D terrain viewer for a quest map's GLB mesh (Higgsfield image→3D).
// Auto-rotates, drag to orbit, pinch/wheel to zoom — three.js is loaded lazily
// so it never enters the main bundle. If the mesh ships without a baked texture
// (image_to_3d sometimes returns geometry-only, which renders plain white), we
// drape the quest's own map art onto it so the terrain always looks textured.
export default function GlbTerrain({ url, textureUrl, accent = "#8b5cf6" }: { url: string; textureUrl?: string | null; accent?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);

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
      cam.position.set(0, 1.1, 2.4);
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(el.clientWidth, el.clientHeight);
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
      // Correct color pipeline so baked textures show their real colours instead
      // of washing out to white.
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.0;
      el.appendChild(renderer.domElement);

      // Gentle, balanced lighting — the previous rig was ~4× too bright and blew
      // the terrain out to a flat white.
      scene.add(new THREE.AmbientLight(0xffffff, 0.65));
      const hemi = new THREE.HemisphereLight(0xbcd4ff, 0x1a1030, 0.5); scene.add(hemi);
      const key = new THREE.DirectionalLight(0xffffff, 1.15); key.position.set(2, 3, 2); scene.add(key);
      const rim = new THREE.DirectionalLight(new THREE.Color(accent), 0.6); rim.position.set(-2, 1.5, -2); scene.add(rim);

      const controls = new OrbitControls(cam, renderer.domElement);
      controls.enableDamping = true;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 1.1;
      controls.minDistance = 1.2;
      controls.maxDistance = 5;

      // Preload the fallback texture (the quest map art) once.
      let fallbackTex: import("three").Texture | null = null;
      if (textureUrl) {
        try {
          fallbackTex = await new THREE.TextureLoader().loadAsync(textureUrl);
          fallbackTex.colorSpace = THREE.SRGBColorSpace;
          fallbackTex.flipY = false; // glTF UV convention
        } catch { fallbackTex = null; }
      }
      if (stop) return;

      new GLTFLoader().load(url, (g) => {
        if (stop) return;
        const obj = g.scene;
        obj.traverse((child) => {
          const mesh = child as import("three").Mesh;
          if (!mesh.isMesh) return;
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const m of mats) {
            const mat = m as import("three").MeshStandardMaterial;
            // Untextured/near-white material → drape the map art on it.
            const hasMap = !!mat.map;
            if (!hasMap && fallbackTex) { mat.map = fallbackTex; mat.color?.set(0xffffff); mat.needsUpdate = true; }
            if ("metalness" in mat) mat.metalness = Math.min(mat.metalness ?? 0, 0.2);
            if ("roughness" in mat) mat.roughness = Math.max(mat.roughness ?? 1, 0.75);
          }
        });
        const box = new THREE.Box3().setFromObject(obj);
        const size = box.getSize(new THREE.Vector3()).length() || 1;
        const center = box.getCenter(new THREE.Vector3());
        obj.position.sub(center);
        obj.scale.setScalar(2.2 / size);
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

      const loop = () => {
        if (stop) { ro.disconnect(); return; }
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
  }, [url, textureUrl, accent]);

  return <div ref={ref} className="absolute inset-0" style={{ touchAction: "none" }} />;
}
