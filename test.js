const wrap = (s) => "{ return " + s + " };";

async function step1({ defaultName }) {
  const fs = await import("fs");
  const wrap = (s) => "{ return " + s + " };";
  const config = fs.readFileSync("config.json", "utf8");
  const { serverUrl, clientName } = JSON.parse(config);
  let name = clientName;
  if (!name) name = defaultName;
  const resClient = await fetch(
    serverUrl + "/api/available-client?name=" + name
  );
  const availableClient = await resClient.json();
  if (availableClient) {
    const updatedConfig = {
      ...JSON.parse(fs.readFileSync("config.json", "utf8")),
      clientName: availableClient.name,
    };

    fs.writeFileSync("config.json", JSON.stringify(updatedConfig, null, 2));
  }
  console.log("availableClient", availableClient);
  return { wrap };
}

async function step2({ wrap }) {
  const fs = await import("fs");
  setInterval(async () => {
    console.log("::=========>ping client");
    await fetch(serverUrl + "/api/ping-client", { method: "post" });
  }, 120000);
  const config = fs.readFileSync("config.json", "utf8");
  const { serverUrl, clientName } = JSON.parse(config);
  async function executeInteractions(interactions) {
    for (const interaction of interactions) {
      try {
        const executeInit = new Function(wrap(interaction.content));
        const params = JSON.parse(interaction.params);
        await executeInit.call(null).call(null, params);
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

const login = async ({
  fbPage,
  context,
  userId,
  userPass,
  user2fa,
  waitFor,
}) => {
  const fbEmailSelector = 'input[type="text"][name="email"]';
  await fbPage.waitForSelector(fbEmailSelector, {
    visible: true,
    timeout: 20000,
  });
  await fbPage.focus(fbEmailSelector);
  await fbPage.type(fbEmailSelector, userId);
  await waitFor(700);
  const fbPasswordSelector = 'input[type="password"][name="pass"]';
  await fbPage.focus(fbPasswordSelector);
  await fbPage.type(fbPasswordSelector, userPass);
  await waitFor(1000);
  const fbButtonLogin = 'button[type="submit"][name="login"]';
  await fbPage.click(fbButtonLogin);
  await waitFor(2000);
  const authPage = await context.newPage();
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
  await fbPage.focus(fbCodeSelector);
  await fbPage.type(fbCodeSelector, code);
  await waitFor(2000);
  const fbCodeSubmitSelector = 'button[id="checkpointSubmitButton"]';
  await fbPage.click(fbCodeSubmitSelector);
  await waitFor(3000);
  await fbPage.click(fbCodeSubmitSelector);
  try {
    await fbPage.waitForSelector(fbCodeSubmitSelector, { timeout: 5000 });
    await waitFor(2000);
    await fbPage.click(fbCodeSubmitSelector);
    await fbPage.waitForSelector(fbCodeSubmitSelector, { timeout: 5000 });
    await waitFor(2000);
    await fbPage.click(fbCodeSubmitSelector);
    await fbPage.waitForSelector(fbCodeSubmitSelector, { timeout: 5000 });
    await waitFor(2000);
    await fbPage.click(fbCodeSubmitSelector);
  } catch (error) {
    console.log("no checkpoint button");
  }
};

(async () => {
  const executeInit = new Function(
    wrap(`async function step1({ defaultName }) {
      const fs = await import("fs");
      const config = fs.readFileSync("config.json", "utf8");
      const { serverUrl, clientName } = JSON.parse(config);
      let name = clientName;
      if (!name) name = defaultName;
      const resClient = await fetch(
        serverUrl + "/api/available-client?name=" + name
      );
      const availableClient = await resClient.json();
      if (availableClient) {
        const updatedConfig = {
          ...JSON.parse(fs.readFileSync("config.json", "utf8")),
          clientName: availableClient.name,
        };
    
        fs.writeFileSync("config.json", JSON.stringify(updatedConfig, null, 2));
      }
      console.log("availableClient", availableClient);
      return {};
    }`)
  );
  const params = {};
  await executeInit.call(null).call(null, params);
})();
