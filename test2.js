const wrap = (s) => "{ return " + s + " };";
(async () => {
  const executeInit = new Function(
    wrap(
      `async function init({ chromePath, url }) { const puppeteer = await import('puppeteer'); const waitFor = async (time) => { return new Promise((resolve) => { setTimeout(() => { resolve(); }, time); }); }; const browser = await puppeteer.launch({ executablePath: chromePath, headless: false, }); const page = await browser.newPage(); await page.goto(url); return { browser, page, waitFor }; }`
    )
  );
  const params = {
    chromePath: "C://Program Files/Google/Chrome/Application/chrome.exe",
    url: "https://www.quora.com/",
  };
  await executeInit.call(null).call(null, params);
})();
