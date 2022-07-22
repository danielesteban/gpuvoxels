import './main.css';
import { vec3 } from 'gl-matrix';
import Atlas from './textures/atlas.js';
import Renderer from './core/renderer.js';
import Scenes from './scenes.js';
import Volume from './core/volume.js';

const Main = async () => {
  if (!navigator.gpu || !navigator.gpu.getPreferredCanvasFormat) {
    throw new Error('WebGPU');
  }
  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter.requestDevice();
  const renderer = new Renderer({
    adapter,
    device,
    atlas: Atlas(),
  });
  document.getElementById('renderer').appendChild(renderer.canvas);
  renderer.setSize(window.innerWidth, window.innerHeight);
  window.addEventListener('resize', () => (
    renderer.setSize(window.innerWidth, window.innerHeight)
  ), false);

  const volume = new Volume({
    device,
    width: 300,
    height: 300,
    depth: 300,
  });

  vec3.set(
    renderer.camera.target,
    volume.width * 0.5, volume.height * 0.5, volume.depth * 0.5
  );

  let clock = performance.now() / 1000;
  let scene;
  let sceneIndex;
  let simulationClock;
  const source = document.getElementById('source');
  const load = (index) => {
    scene = Scenes[index];
    sceneIndex = index;
    simulationClock = -1;
    let text = scene.source;
    if (text.includes('fn distanceToScene(pos : vec3<f32>) -> f32')) {
      text = text.slice(0, text.indexOf('fn getValueAt(pos : vec3<f32>) -> u32'));
    }
    source.innerText = text;
    volume.setScene(scene.source);
    if (scene.onLoad) {
      scene.onLoad(renderer, volume);
    }
  };
  load(0);
  setInterval(() => (
    load((sceneIndex + 1) % Scenes.length)
  ), 10000);

  const animate = () => {
    requestAnimationFrame(animate);
    const time = performance.now() / 1000;
    const delta = time - clock;
    clock = time;
    if (scene.onAnimation) {
      scene.onAnimation(delta, time, renderer, volume);
    }

    const command = device.createCommandEncoder();
    if (
      scene.maxFPS === undefined
      || (scene.maxFPS > 0 && simulationClock <= (time - (1 / scene.maxFPS)))
      || simulationClock === -1
    ) {
      simulationClock = time;
      volume.compute(command, time);
    }
    renderer.render(command, volume);
    device.queue.submit([command.finish()]);
  };
  requestAnimationFrame(animate);
};

Main()
  .catch((e) => {
    console.error(e);
    document.getElementById('canary').classList.add('enabled');
  })
  .finally(() => document.getElementById('loading').classList.remove('enabled'));
