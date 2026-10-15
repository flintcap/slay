/**
 * Chromium flags for the browser tools: WebGPU on SwiftShader's Vulkan,
 * which can show WebGPU frames headless (ANGLE's SwiftShader alone loses the
 * device on the first presented frame). Pass `webgl2` to leave WebGPU off
 * and test the WebGL2 fallback instead.
 */
export function gpuArgs({ webgl2 = false } = {}) {
  return [
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--disable-gpu-sandbox',
    '--no-sandbox',
    ...(webgl2 ? [] : ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader']),
  ];
}
