// The two scenes of this deck. Everything is computed from fixed numbers, so a frame is reproducible.
import { mountScene } from "/scene3d.js";

/** Title graphic: a point sphere (Fibonacci lattice) with two rings and a faceted shell, turning slowly. */
export function mountHero(root, { exportMode }) {
  return mountScene(root, {
    exportMode,
    build({ THREE, scene, camera }) {
      camera.position.set(0, 0, 15);
      const group = new THREE.Group();
      scene.add(group);
      const count = 420, radius = 3.2, golden = Math.PI * (3 - Math.sqrt(5));
      const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.085, 12, 9),
        new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.05 }), count);
      const near = new THREE.Color(0x009682), far = new THREE.Color(0x46413c), color = new THREE.Color();
      const m = new THREE.Matrix4();
      for (let i = 0; i < count; i++) {
        const y = 1 - 2 * (i + 0.5) / count, r = Math.sqrt(1 - y * y), phi = i * golden;
        m.makeTranslation(radius * r * Math.cos(phi), radius * y, radius * r * Math.sin(phi));
        dots.setMatrixAt(i, m);
        dots.setColorAt(i, color.lerpColors(far, near, (y + 1) / 2));
      }
      group.add(dots);
      const shell = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(2.8, 1)),
        new THREE.LineBasicMaterial({ color: 0xaaa5a0 }));
      group.add(shell);
      for (const [tilt, turn] of [[1.2, 0.2], [0.5, 1.1]]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.03, 8, 200), new THREE.MeshStandardMaterial({ color: 0x46413c }));
        ring.rotation.set(tilt, turn, 0);
        group.add(ring);
      }
      group.rotation.set(0.4, 0.7, 0);
      return {
        update: dt => { group.rotation.y += dt * 0.28; },
        snapshot: () => ({ spin: +group.rotation.y.toFixed(4), dots: count }),
      };
    },
  });
}

/** Figure scene: a (2, q) torus knot with OrbitControls. params = {q, tube, style} comes from the sliders. */
export function mountKnot(root, { exportMode, params }) {
  return mountScene(root, {
    exportMode,
    orbit: true,
    build({ THREE, scene, camera, requestRender }) {
      camera.position.set(0, 2.5, 13.5);
      const group = new THREE.Group();
      scene.add(group);
      const material = new THREE.MeshStandardMaterial({ color: 0x009682, roughness: 0.35, metalness: 0.1 });
      let mesh = null, faces = 0, builds = 0;
      const apply = () => {
        if (mesh) { group.remove(mesh); mesh.geometry.dispose(); }
        const geometry = new THREE.TorusKnotGeometry(2.6, params.tube, 260, 28, 2, params.q);
        faces = geometry.index.count / 3;
        builds += 1;
        material.wireframe = params.style === "wire";
        material.color.set(params.style === "wire" ? 0x46413c : 0x009682);
        mesh = new THREE.Mesh(geometry, material);
        group.add(mesh);
        requestRender();
      };
      apply();
      group.rotation.set(0.5, 0.3, 0);
      return {
        apply,
        update: dt => { group.rotation.y += dt * 0.2; },
        snapshot: () => ({ q: params.q, tube: params.tube, style: params.style, faces, builds, spin: +group.rotation.y.toFixed(4) }),
      };
    },
  });
}
