/**
 * Chromium flags for the browser tools: WebGPU on SwiftShader's Vulkan,
 * which can show WebGPU frames headless (ANGLE's SwiftShader alone loses the
 * device on the first presented frame).
 */
export function gpuArgs() {
  return [
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--disable-gpu-sandbox',
    '--no-sandbox',
    '--enable-unsafe-webgpu',
    '--enable-features=Vulkan',
    '--use-vulkan=swiftshader',
    '--use-webgpu-adapter=swiftshader',
  ];
}
