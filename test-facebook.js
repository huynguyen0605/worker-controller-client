async function step1({ defaultName, configPath }) {
  try {
    const wrap = (s) => "{ return " + s + " };";
    const fs = await import("fs");
    const config = fs.readFileSync(configPath, "utf8");
    const { serverUrl, clientName } = JSON.parse(config);
    let name = clientName;
    if (!name) name = defaultName;
    const resClient = await fetch(
      serverUrl + "/api/available-client?name=" + name
    );
    const availableClient = await resClient.json();
    if (availableClient) {
      const updatedConfig = {
        ...JSON.parse(fs.readFileSync(configPath, "utf8")),
        clientName: availableClient.name,
      };
      fs.writeFileSync(configPath, JSON.stringify(updatedConfig, null, 2));
    }
    console.log("availableClient", availableClient);
    return { wrap, configPath };
  } catch (error) {
    console.log("error================>", error.message);
  }
}

async function step2({ wrap, configPath }) {
  const fs = await import("fs");
  const config = fs.readFileSync(configPath, "utf8");
  const { serverUrl, clientName } = JSON.parse(config);
  setInterval(async () => {
    console.log("::=========>ping client");
    try {
      await fetch(serverUrl + "/api/ping-client?name=" + clientName);
    } catch (error) {
      console.log("error", error.message);
    }
  }, 120000);
  async function executeInteractions(interactions) {
    let allParams = { wrap };
    for (const interaction of interactions) {
      try {
        const executeInit = new Function(wrap(interaction.content));
        const params = JSON.parse(interaction.params);
        if (params) {
          allParams = { ...allParams, ...params };
        }
        console.log("execute interaction", interaction, allParams);
        const result = await executeInit.call(null).call(null, allParams);
        if (result) {
          allParams = { ...allParams, ...result };
        }
      } catch (error) {
        console.error("Error executing interaction: " + error.message);
        throw error;
      }
    }
  }
  async function fetchClient() {
    try {
      const cls = await fetch(
        serverUrl + "/api/client-by-name?clientName=" + clientName
      );
      return await cls.json();
    } catch (error) {
      console.error("Error fetching process: " + error.message);
      throw error;
    }
  }
  async function retryWithDelay(delay) {
    return new Promise((resolve) => setTimeout(resolve, delay));
  }
  for (let retryCount = 0; retryCount < 1000; retryCount++) {
    try {
      const client = await fetchClient();
      if (
        !client ||
        !client.process ||
        !client.process.interactions ||
        client.process.interactions.length === 0
      ) {
        console.warn("No interactions found. Retrying...");
        await retryWithDelay(60000);
        continue;
      }
      await executeInteractions(client.process.interactions);
      break;
    } catch (error) {
      console.error("Error during step2: " + error.message);
      await retryWithDelay(60000);
    }
  }
}

async function executeJob({ browser, page, waitFor, wrap, configPath }) {
  const fs = await import("fs");
  const config = fs.readFileSync(configPath, "utf8");
  const { serverUrl, clientName } = JSON.parse(config);

  while (true) {
    try {
      const res = await fetch(
        serverUrl + "/api/job-by-client&clientName" + clientName
      );
      const resJson = await res.json();
      const { content, _id } = resJson;
      const executeInit = new Function(wrap(interaction.content));
      await executeInit.call(null).call(null, { browser, page, waitFor, wrap });

      await waitFor(5000);
    } catch (error) {
      console.log("error", error.message);
    }
  }
}

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
  const context = browser.defaultBrowserContext();
  await context.overridePermissions("https://www.facebook.com/", [
    "notifications",
  ]);

  const page = await browser.newPage();
  page.on("dialog", async (dialog) => {
    console.log(`Dialog message: ${dialog.message()}`);
    await dialog.accept();
  });
  await page.goto(url);
  return { browser, page, waitFor };
}

async function login({ page, browser, waitFor, configPath }) {
  try {
    const fs = await import("fs");
    const config = fs.readFileSync(configPath, "utf8");
    const { serverUrl, clientName } = JSON.parse(config);
    const accRes = await fetch(
      serverUrl + "/api/account-by-client?clientName=" + clientName
    );
    const accounts = await accRes.json();
    console.log("accounts", accounts);
    const [userId, userPass, user2fa] = accounts[0].info.split("|");
    const links = accounts[0].links;
    const tags = accounts[0].tags;
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
    return {
      page,
      browser,
      waitFor,
      userId,
      userPass,
      user2fa,
      links,
      tags,
      configPath,
    };
  } catch (error) {
    await browser.close();
    throw error;
  }
}

async function interaction({
  page,
  browser,
  waitFor,
  userId,
  userPass,
  user2fa,
  links,
  tags,
  configPath,
  wrap,
}) {
  const fs = await import("fs");
  const config = fs.readFileSync(configPath, "utf8");
  const { serverUrl, clientName } = JSON.parse(config);

  var isExecuting = false;
  async function executeJob() {
    if (isExecuting) return;
    isExecuting = true;
    try {
      const res = await fetch(
        serverUrl + "/api/job-by-client?clientName=" + clientName
      );
      const resJson = await res.json();
      console.log("resJson", resJson);
      const { code, _id } = resJson;
      console.log("id job", _id, code);
      if (code) {
        const executeInit = new Function(wrap(code));
        await executeInit
          .call(null)
          .call(null, { browser, page, waitFor, wrap });
        await fetch(serverUrl + "/api/done-job&id=" + _id);
        await waitFor(5000);
        await page.goto("https://www.facebook.com");
      }
      await waitFor(10000);
      isExecuting = false;
    } catch (error) {
      isExecuting = false;
      console.log("error", error.message);
      await waitFor(5000);
      await page.goto("https://www.facebook.com");
    }
  }

  const scroll = async () => {
    await page.evaluate(() => {
      const random = Math.random() * 200;
      window.scrollBy(0, random);
    });
  };
  const like = async () => {
    console.log("clicked like");
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
    const limitPost = 20;
    const limitTurn = 10;
    let turn = 0;
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
          console.log(
            "huynvq::===================>scroll",
            currentTime,
            startTime,
            scrollDuration
          );
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
        console.log("huynvq::===================>wait page loading", postLinks);
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
        turn++;
        if (postLinks.length >= limitPost || turn > limitTurn) break;
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
                title: HTML,
                type: "post",
                tags: tags,
              };
              posts.push(data);
            }
          }
        }
      }
      console.log(posts);
      await fetch(serverUrl + "/api/facebooks-bulk", {
        method: "post",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(posts),
      });
    } catch (error) {
      console.log("========> error: ", error);
    }
  }
  async function fetchGroup(groupUrl) {
    const limitPost = 20;
    const limitTurn = 10;
    let turn = 0;
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
        console.log("postLinks", postLinks);
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
        turn++;
        if (postLinks.length >= limitPost || turn > limitTurn) break;
      }
      const posts = [];
      for (const [indexLink, postLink] of postLinks.entries()) {
        await page.goto(postLink);
        await waitFor(2000);
        let postWrapperSelector;
        const regex = /groups\/(\d+)\/?/;
        const match = postLink.match(regex);
        if (match) {
          postWrapperSelector =
            "body > div > div > div:nth-child(1) > div > div:nth-child(4) > div > div > div > div:nth-child(1) > div > div:nth-child(3) > div > div > div:nth-child(4) > div > div > div > div > div > div > div > div > div > div > div > div > div > div > div > div > div > div";
        } else {
          postWrapperSelector =
            "body > div > div > div:nth-child(1) > div > div:nth-child(4) > div > div > div > div:nth-child(1) > div > div:nth-child(3) > div > div > div:nth-child(4) > div > div > div > div > div > div > div > div > div > div > div > div > div > div > div > div > div > div > div";
        }

        ("/html/body/div[1]/div/div[1]/div/div[3]/div/div/div[1]/div[1]/div/div[3]/div/div/div[4]/div/div/div[2]/div/div/div/div[2]/div[2]/div[2]/div/div/div/div/div/div/div/div/div/div[8]/div/div/div[3]/div[1]");
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
              if (HTML) {
                const data = {
                  url: postLink,
                  title: HTML,
                  type: "group-post",
                  tags: tags,
                };
                posts.push(data);
              }
            }
          }
        }
      }
      console.log("start fetch", serverUrl + "/api/facebooks-bulk");
      await fetch(serverUrl + "/api/facebooks-bulk", {
        method: "post",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(posts),
      });
    } catch (error) {
      console.log("========> error: ", error);
    }
  }
  async function fetchData() {
    if (isExecuting) return;
    isExecuting = true;
    console.log("fetch data", links);
    try {
      for (const link of links) {
        const { type, url } = link;
        console.log("fetch data link", link, "type", type, "url", url);
        if (type === "group") {
          console.log("fetch data group");
          await fetchGroup(url);
        } else if (type === "feed") {
          console.log("fetch data feed");
          await fetchFeed(url);
        }
        await waitFor(1000);
      }
      await page.goto("https://www.facebook.com/");
      isExecuting = false;
      await waitFor(10000);
    } catch (error) {
      isExecuting = false;
      console.log("fetchData error " + error.message);
    }
  }
  const functions = [
    { fn: scroll, weight: 200 },
    { fn: like, weight: 1 },
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

  setInterval(async () => {
    await executeJob();
  }, 60 * 1000 * 2);

  setInterval(async () => {
    await fetchData();
  }, 60 * 1000 * 90);

  await fetchData();
  while (true) {
    const randomFunction = selectRandomFunction();
    try {
      await randomFunction(page);
      await waitFor(2000);
    } catch (error) {
      console.log("huynvq::=======.error", error.stack);
    }
  }
}

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
