import './main.css';
import { Renderer, Volume } from 'gpuvoxels';
import { vec3 } from 'gl-matrix';
import Input from './input.js';
import Scenes from './scenes.js';

const checkConstSupport = async (device) => {
  const module = device.createShaderModule({
    code: `const checkConstSupport : f32 = 1;`,
  });
  const { messages } = await module.compilationInfo();
  if (messages.find(({ type }) => type === 'error')) {
    throw new Error('ConstSupport');
  }
};

const Main = async () => {
  if (!navigator.gpu || !navigator.gpu.getPreferredCanvasFormat) {
    throw new Error('WebGPU');
  }
  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter.requestDevice();
  await checkConstSupport(device);

  const renderer = new Renderer({
    adapter,
    device,
  });
  document.getElementById('renderer').appendChild(renderer.canvas);
  renderer.setSize(window.innerWidth, window.innerHeight);
  window.addEventListener('resize', () => (
    renderer.setSize(window.innerWidth, window.innerHeight)
  ), false);

  const volume = new Volume({
    device,
    time: renderer.time,
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
  const input = new Input();
  const scenes = Scenes(volume, (scene) => {
    clearInterval(interval);
    setScene(scene);
  });
  const source = document.getElementById('source');
  const setScene = (object) => {
    scene = object;
    simulationClock = -1;
    let text = scene.source || '';
    if (text.includes('fn distanceToScene(pos : vec3<f32>) -> f32')) {
      text = text.slice(0, text.indexOf('fn getValueAt(pos : vec3<f32>) -> f32'));
    }
    source.innerText = text;
    renderer.atlas.compute(scene.atlas);
    renderer.postprocessing.setEffect(scene.effect);
    volume.setScene(scene);
    if (scene.onLoad) {
      scene.onLoad(renderer, volume);
    }
  };
  const load = (index) => {
    if (scenes[index].loading) {
      load((index + 1) % scenes.length);
      return;
    }
    sceneIndex = index;
    setScene(scenes[index]);
  };
  load(0);
  let interval = setInterval(() => (
    load((sceneIndex + 1) % scenes.length)
  ), 10000);

  const animate = () => {
    requestAnimationFrame(animate);
    const time = performance.now() / 1000;
    const delta = time - clock;
    clock = time;
    input.update(delta);
    if (scene.onAnimation) {
      scene.onAnimation(delta, time, input, renderer, volume);
    } else {
      renderer.camera.setOrbit(
        input.look.state[0],
        input.look.state[1],
        volume.width * input.zoom.state
      );
    }

    renderer.time.set(time);
    const command = device.createCommandEncoder();
    if (
      scene.maxFPS === undefined
      || (scene.maxFPS > 0 && simulationClock <= (time - (1 / scene.maxFPS)))
      || simulationClock === -1
    ) {
      simulationClock = time;
      volume.compute(command);
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
