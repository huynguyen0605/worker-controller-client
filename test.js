async function init({ chromePath, url }) {
  const puppeteer = await import("puppeteer");
  const waitFor = async (time) => {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve();
      }, time);
    });
  };
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: false,
    args: ["--incognito"],
  });
  const pages = await browser.pages();
  const fbPage = pages[0];
  await fbPage.goto(url);
  return { browser, fbPage, waitFor };
}

(() => {
  init({
    chromePath: "C://Program Files/Google/Chrome/Application/chrome.exe",
    url: "https://mbasic.facebook.com",
  });
})();
