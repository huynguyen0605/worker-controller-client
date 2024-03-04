async function openFacebook({ chromePath, url }) {
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
  });
  const page = await browser.newPage();
  await page.goto(url);
  return { browser, page, waitFor };
}

const login = async ({ page, browser, waitFor }) => {
  const fs = await import("fs");
  const config = fs.readFileSync("config.json", "utf8");
  const { serverUrl, clientName } = JSON.parse(config);
  const accRes = await fetch(
    serverUrl + "/api/account-by-client?clientName=" + clientName
  );
  const accounts = await accRes.json();
  console.log("accounts", accounts);
  const [userId, userPass, user2fa] = accounts[0].info.split("|");
  const links = accounts[0].links;
  const fbEmailSelector = 'input[type="text"][name="email"]';
  await page.waitForSelector(fbEmailSelector, {
    visible: true,
    timeout: 20000,
  });

  await page.focus(fbEmailSelector);
  await page.type(fbEmailSelector, userId);

  await waitFor(700);

  const fbPasswordSelector = 'input[type="password"][name="pass"]';
  await page.focus(fbPasswordSelector);
  await page.type(fbPasswordSelector, userPass);

  await waitFor(1000);

  const fbButtonLogin = 'button[type="submit"][name="login"]';
  await page.click(fbButtonLogin);

  await waitFor(2000);
  const authPage = await browser.newPage();
  await authPage.goto("https://2fa.live");

  const authTokenSelector = 'textarea[id="listToken"]';
  await authPage.waitForSelector(authTokenSelector, { timeout: 10000 });

  await authPage.focus(authTokenSelector);
  await authPage.type(authTokenSelector, user2fa);

  await waitFor(1000);

  const authButtonSubmit = 'a[id="submit"]';
  await authPage.click(authButtonSubmit);

  await waitFor(1000);

  const authResultSelector = 'textarea[id="output"]';
  const outputValue = await authPage.$eval(
    authResultSelector,
    (textarea) => textarea.value
  );

  const code = outputValue.split("|")[1];

  await authPage.close();

  await waitFor(3000);
  const fbCodeSelector = 'input[type="text"][id="approvals_code"]';
  await page.focus(fbCodeSelector);
  await page.type(fbCodeSelector, code);

  await waitFor(2000);
  const fbCodeSubmitSelector = 'button[id="checkpointSubmitButton"]';
  await page.click(fbCodeSubmitSelector);

  await waitFor(3000);
  await page.click(fbCodeSubmitSelector);

  try {
    await page.waitForSelector(fbCodeSubmitSelector, { timeout: 5000 });
    await waitFor(2000);
    await page.click(fbCodeSubmitSelector);

    await page.waitForSelector(fbCodeSubmitSelector, { timeout: 5000 });
    await waitFor(2000);
    await page.click(fbCodeSubmitSelector);

    await page.waitForSelector(fbCodeSubmitSelector, { timeout: 5000 });
    await waitFor(2000);
    await page.click(fbCodeSubmitSelector);
  } catch (error) {
    console.log("no checkpoint button");
  }
  return { page, browser, waitFor, userId, userPass, user2fa, links };
};

const interaction = async ({
  page,
  browser,
  waitFor,
  userId,
  userPass,
  user2fa,
  links,
}) => {
  const scroll = async () => {
    await page.evaluate(() => {
      const random = Math.random() * 200;
      window.scrollBy(0, random);
    });
  };

  const like = async () => {
    const likeSelector1 = `div[aria-label="Like"]`;
    const likeSelector2 = `div[aria-label="Thích"]`;
    const selectors1 = await page.$$(likeSelector1);
    const selectors2 = await page.$$(likeSelector2);

    if (selectors1.length > 0) {
      await page.evaluate((selector) => {
        selector.click();
        console.log("huynvq::=========>clicked 1", selector);
      }, selectors1[0]);
    } else {
      await page.evaluate((selector) => {
        selector.click();
        console.log("huynvq::=========>clicked 2", selector);
      }, selectors2[0]);
    }
  };

  async function fetchFeed(pageUrl) {
    const limitPost = 50;
    try {
      await page.goto(pageUrl);
      await waitFor(1000);
      const waitPageLoading = async () => {
        let scrolledHeight = 0;
        const scrollDuration = 10 * 1000;
        const scrollInterval = 1000;
        const startTime = Date.now();
        let currentTime = startTime;
        while (currentTime - startTime < scrollDuration) {
          await page.evaluate(() => {
            window.scrollBy(0, window.innerHeight);
          });
          await waitFor(scrollInterval);
          const newScrolledHeight = await page.evaluate(
            () => document.body.scrollHeight
          );
          if (newScrolledHeight === scrolledHeight) {
            break;
          }
          scrolledHeight = newScrolledHeight;
          currentTime = Date.now();
        }
      };
      const postLinks = [];
      while (true) {
        await waitPageLoading();
        const selectedLinks = await page.$$eval(
          'a[href*="' + pageUrl + '/posts"]',
          (elements) => {
            return elements.map((element) => element.href);
          }
        );
        if (selectedLinks) {
          selectedLinks.forEach((link) => {
            const newLink = link.replace(/\?.*$/, "");
            if (!postLinks.includes(newLink)) {
              postLinks.push(newLink);
            }
          });
        }
        if (postLinks.length >= limitPost) break;
      }
      const posts = [];
      for (const [indexLink, postLink] of postLinks.entries()) {
        await page.goto(postLink);
        await waitFor(2000);
        const postWrapperSelector =
          "body > div > div > div:nth-child(1) > div > div:nth-child(4) > div > div > div:nth-child(1) > div:nth-child(1) > div > div > div > div > div > div > div > div > div > div > div > div > div > div";
        const postWrappers = await page.$$(postWrapperSelector);
        if (postWrappers) {
          for (const [index, postWrapper] of postWrappers.entries()) {
            const isTrueElement = await page.evaluate((el) => {
              return (
                el.getAttribute("class") === null && el.childElementCount > 0
              );
            }, postWrapper);
            if (isTrueElement) {
              const childElementSelector =
                postWrapperSelector +
                ":nth-child(" +
                (index + 1) +
                ") > div > div > div:nth-child(3)";
              const childElement = await page.$(childElementSelector);
              const HTML = await page.evaluate(
                (element) => element.outerHTML,
                childElement
              );
              const data = {
                url: postLink,
                content: HTML,
              };
              posts.push(data);
            }
          }
        }
      }
      console.log(posts);
    } catch (error) {
      console.log("========> error: ", error);
    }
  }
  async function fetchGroup(groupUrl) {
    const limitPost = 50;
    try {
      await page.goto(groupUrl);
      await waitFor(1000);
      const elementEN = await page.$(
        'div[role="button"][aria-label="Join group"]'
      );
      const elementVN = await page.$(
        'div[role="button"][aria-label="Tham gia nhóm"]'
      );
      if (elementEN || elementVN) {
        if (elementEN) await elementEN.click();
        if (elementVN) await elementVN.click();
        await waitFor(1000);
        await page.reload();
      }
      const waitPageLoading = async () => {
        let scrolledHeight = 0;
        const scrollDuration = 10 * 1000;
        const scrollInterval = 1000;
        const startTime = Date.now();
        let currentTime = startTime;
        while (currentTime - startTime < scrollDuration) {
          await page.evaluate(() => {
            window.scrollBy(0, window.innerHeight);
          });
          await waitFor(scrollInterval);
          const newScrolledHeight = await page.evaluate(
            () => document.body.scrollHeight
          );
          if (newScrolledHeight === scrolledHeight) {
            break;
          }
          scrolledHeight = newScrolledHeight;
          currentTime = Date.now();
        }
      };
      const groupLink = (await page.url()).replace(/\?.*$/, "");
      const postLinks = [];
      while (true) {
        await waitPageLoading();
        const selectedLinks = await page.$$eval(
          'a[href*="' + groupLink + 'posts"]',
          (elements) => {
            return elements.map((element) => element.href);
          }
        );
        if (selectedLinks) {
          selectedLinks.forEach((link) => {
            const newLink = link.replace(/\?.*$/, "");
            if (!postLinks.includes(newLink)) {
              postLinks.push(newLink);
            }
          });
        }
        if (postLinks.length >= limitPost) break;
      }
      const posts = [];
      for (const [indexLink, postLink] of postLinks.entries()) {
        await page.goto(postLink);
        await waitFor(2000);
        const postWrapperSelector =
          "body > div > div > div:nth-child(1) > div > div:nth-child(4) > div > div > div > div:nth-child(1) > div > div:nth-child(3) > div > div > div:nth-child(4) > div > div > div > div > div > div > div > div > div > div > div > div > div > div > div > div > div > div";
        const postWrappers = await page.$$(postWrapperSelector);
        if (postWrappers) {
          for (const [index, postWrapper] of postWrappers.entries()) {
            const isTrueElement = await page.evaluate((el) => {
              return (
                el.getAttribute("class") === null && el.childElementCount > 0
              );
            }, postWrapper);
            if (isTrueElement) {
              const childElementSelector =
                postWrapperSelector +
                ":nth-child(" +
                (index + 1) +
                ") > div > div > div:nth-child(3)";
              const childElement = await page.$(childElementSelector);
              const HTML = await page.evaluate(
                (element) => element.outerHTML,
                childElement
              );
              const data = {
                url: postLink,
                content: HTML,
              };
              posts.push(data);
            }
          }
        }
      }
      console.log(posts);
    } catch (error) {
      console.log("========> error: ", error);
    }
  }

  async function fetchData() {
    for (const link of links) {
      const { type, url } = link;
      if (type === "group") {
        await fetchGroup(url);
      } else if (type === "feed") {
        await fetchFeed(url);
      }
    }
  }

  const functions = [
    { fn: scroll, weight: 200 },
    { fn: like, weight: 1 },
    { fn: fetchData, weight: 1 },
  ];

  const selectRandomFunction = () => {
    const totalWeight = functions.reduce((acc, { weight }) => acc + weight, 0);
    let random = Math.random() * totalWeight;

    for (const { fn, weight } of functions) {
      if (random < weight) {
        return fn;
      }
      random -= weight;
    }
  };
  while (true) {
    const randomFunction = selectRandomFunction();
    try {
      await randomFunction(page);
      await still(2000);
    } catch (error) {
      console.log("huynvq::=======.error", error.stack);
    }
  }
};

(async () => {
  const { browser, page, waitFor } = await openFacebook({
    chromePath: "C://Program Files/Google/Chrome/Application/chrome.exe",
    url: "https://www.facebook.com/login",
  });

  const [userId, userPass, user2fa] = [
    "100000453506473",
    "sAtzlGApDlht3f",
    "NBM6 JBNB MLTH NJZU OOEU O3YT U6PT WSXT",
  ];
  await login({ page, browser, userId, userPass, user2fa, waitFor });
})();
