import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  
  const viewports = [
    { width: 375, height: 812, name: 'iphone-13-mini' },
    { width: 390, height: 844, name: 'iphone-13' },
    { width: 412, height: 915, name: 'android-mid-range' },
  ];

  for (const vp of viewports) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    
    // Test Home
    await page.goto('http://localhost:5173/');
    // Wait for it to render
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `/Users/angelhanasato/.gemini/antigravity-ide/brain/b24fb389-20e3-429d-a497-e7aa9460461d/home-${vp.name}.png` });
    
    // Add other pages later
    await context.close();
  }

  await browser.close();
})();
