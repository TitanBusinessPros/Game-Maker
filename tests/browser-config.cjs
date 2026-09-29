const playwright = require('playwright');
const engine = process.env.GIF_TEST_ENGINE || 'chromium';
const mobile = process.env.GIF_TEST_MOBILE === '1';
exports.pageOptions = mobile
  ? playwright.devices[engine === 'webkit' ? 'iPhone 13' : 'Pixel 7']
  : { viewport: { width: 1280, height: 800 } };
exports.launch = async () => {
  const browser = await playwright[engine].launch({ headless: true,
    ...(process.env.GIF_TEST_BROWSER ? { executablePath: process.env.GIF_TEST_BROWSER } : {}) });
  console.log(`BROWSER ${engine} ${browser.version()} ${mobile ? 'phone emulation' : 'desktop'}`);
  return browser;
};
