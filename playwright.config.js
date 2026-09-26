import { defineConfig, devices } from '@playwright/test';

// Chromium with a fake camera (a .y4m file) and a mocked GPS position at HOIV.
// A test can pick a different fake video by setting FAKE_VIDEO=test/fixtures/<file>.y4m.
const fakeVideo = process.env.FAKE_VIDEO || 'test/fixtures/light-green.y4m';

const fakeCamera = (file) => ({
  args: [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    `--use-file-for-fake-video-capture=${file}`,
  ],
});

export default defineConfig({
  testDir: 'test/e2e',
  timeout: 30_000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3123',
    ...devices['Pixel 7'],
    geolocation: { latitude: 48.1761, longitude: 16.3954 }, // HOIV, Arsenalstraße 11
    permissions: ['geolocation', 'camera', 'microphone'],
    launchOptions: fakeCamera(fakeVideo),
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' }, testIgnore: /bus-video\.spec\.js/ },
    // Real footage: a 69A bus arriving (test-material/new-test/bus video.MOV → 270x480, 3 fps, loops)
    {
      name: 'bus-video',
      testMatch: /bus-video\.spec\.js/,
      use: { browserName: 'chromium', launchOptions: fakeCamera('test/fixtures/bus-69a.y4m') },
    },
  ],
  webServer: {
    command: 'node scripts/dev-server.js 3123',
    url: 'http://localhost:3123/api/health',
    reuseExistingServer: !process.env.CI,
  },
});
