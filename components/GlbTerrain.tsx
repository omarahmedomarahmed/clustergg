"use client";

import { useEffect, useRef } from "react";

// Three.js 3D terrain viewer for a quest map's GLB mesh (Higgsfield
// image→3D). Auto-rotates, drag to orbit, pinch/wheel to zoom — loaded
// lazily so three.js never enters the main bundle.
export default function GlbTerrain({ url, accent = "#8b5cf6" }: { url: string; accent?: string }) {
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
      el.appendChild(renderer.domElement);

      scene.add(new THREE.AmbientLight(0xffffff, 1.2));
      const key = new THREE.DirectionalLight(0xffffff, 1.8); key.position.set(2, 3, 2); scene.add(key);
      const rim = new THREE.DirectionalLight(new THREE.Color(accent), 1.1); rim.position.set(-2, 1, -2); scene.add(rim);

      const controls = new OrbitControls(cam, renderer.domElement);
      controls.enableDamping = true;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 1.1;
      controls.minDistance = 1.2;
      controls.maxDistance = 5;

      new GLTFLoader().load(url, (g) => {
        if (stop) return;
        const obj = g.scene;
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
  }, [url, accent]);

  return <div ref={ref} className="absolute inset-0" style={{ touchAction: "none" }} />;
}
