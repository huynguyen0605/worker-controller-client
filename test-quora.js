async function openQuora({ chromePath, url }) {
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

async function loginQuora({ page, waitFor }) {
  const fs = await import("fs");
  const config = fs.readFileSync("config.json", "utf8");
  const { serverUrl, clientName } = JSON.parse(config);
  const accRes = await fetch(
    serverUrl + "/api/account-by-client?clientName=" + clientName
  );
  const accounts = await accRes.json();
  const [email, password] = accounts.split("|");
  const emailSelector = 'input[id="email"]';
  await page.waitForSelector(emailSelector);
  await page.type(emailSelector, email);
  const passwordSelector = 'input[id="password"]';
  await page.waitForSelector(passwordSelector);
  await page.type(passwordSelector, password);
  const loginBtnSelector =
    "#root > div > div:nth-child(2) > div > div > div > div > div > div:nth-child(2) > div:nth-child(2) > div:nth-child(4) > button";
  const loginBtn = await page.$(loginBtnSelector);
  while (true) {
    const isDisabled = await page.evaluate(
      (button) => button.disabled,
      loginBtn
    );
    if (!isDisabled) {
      await page.click(loginBtnSelector);
      break;
    } else {
      await waitFor(1000);
    }
  }
  await page.click(loginBtnSelector);
}

async function executeJob({ browser, page, waitFor, wrap }) {
  const fs = await import("fs");
  const config = fs.readFileSync("config.json", "utf8");
  const { serverUrl, clientName } = JSON.parse(config);

  while (true) {
    const res = await fetch(
      serverUrl + "/api/job-by-client&clientName" + clientName
    );
    const resJson = await res.json();
    const { content, _id } = resJson;
    const executeInit = new Function(wrap(interaction.content));
    await executeInit.call(null).call(null, { browser, page, waitFor, wrap });

    await waitFor(5000);
  }
}

async function syncQuoraQuestion({ page, waitFor }) {
  const waitPageLoading = async () => {
    await page.waitForSelector("#mainContent");
    await waitFor(5000);
    const scrollDuration = 10 * 1000;
    const scrollInterval = 1000;
    const startTime = Date.now();
    let currentTime = startTime;
    while (currentTime - startTime < scrollDuration) {
      await page.evaluate(() => {
        window.scrollBy(0, window.innerHeight);
      });
      waitFor(scrollInterval);
      currentTime = Date.now();
    }
  };
  const syncQuestion = async () => {
    const newFeedWrapperSelector = "#mainContent > div > div";
    const newFeedWrapper = await page.$(newFeedWrapperSelector);
    if (newFeedWrapper) {
      const childElements = await newFeedWrapper.$$("div");
      const newFeedChildrens = [];
      for (const childElement of childElements) {
        const isDirectChild = await page.evaluate(
          (childElement, newFeedWrapperSelector) => {
            const parentElement = childElement.parentElement;
            const newFeedWrapper = document.querySelector(
              newFeedWrapperSelector
            );
            return parentElement === newFeedWrapper;
          },
          childElement,
          newFeedWrapperSelector
        );
        if (isDirectChild) {
          newFeedChildrens.push(childElement);
        }
      }
      if (Array.isArray(newFeedChildrens) && newFeedChildrens.length > 0) {
        for (let i = 0; i < newFeedChildrens.length; i++) {
          if (i === newFeedChildrens.length - 1) {
            const refreshButton = await newFeedChildrens[i].$("button");
            if (refreshButton) {
              await refreshButton.click();
            }
          } else {
            const newFeedChildElements = [];
            const questionChilds = await newFeedChildrens[i].$$(
              "div div:nth-child(2) div"
            );
            if (questionChilds) {
              for (const questionChild of questionChilds) {
                const isDirectChild = await page.evaluate(
                  (questionChild, newFeedWrapperSelector) => {
                    const parentElement = questionChild.parentElement;
                    const wrapperElement =
                      newFeedWrapperSelector.querySelector("div");
                    return parentElement === wrapperElement;
                  },
                  questionChild,
                  newFeedChildrens[i]
                );
                if (isDirectChild) {
                  newFeedChildElements.push(questionChild);
                }
              }
            }
            let listQuestionElementsData = [];
            if (newFeedChildElements[1]) {
              const getListQuestionElement = async (clickMore) => {
                const listQuestionElements = [];
                const listQuestion = await newFeedChildElements[1].$$("div");
                if (listQuestion) {
                  for (const itemQuestion of listQuestion) {
                    const isDirectChild = await page.evaluate(
                      (itemQuestion, itemQuestionWrapperSelector) => {
                        const parentElement = itemQuestion.parentElement;
                        return parentElement === itemQuestionWrapperSelector;
                      },
                      itemQuestion,
                      newFeedChildElements[1]
                    );
                    if (isDirectChild) {
                      listQuestionElements.push(itemQuestion);
                    }
                  }
                }
                if (listQuestionElements.length > 0 && clickMore) {
                  const btnMoreWrapper =
                    listQuestionElements[listQuestionElements.length - 1];
                  const btnMore = await btnMoreWrapper.$("button");
                  if (btnMore) {
                    await btnMore.click();
                  }
                }
                if (listQuestionElements.length > 0 && !clickMore) {
                  return listQuestionElements;
                }
              };
              await getListQuestionElement(true);
              listQuestionElementsData = await getListQuestionElement(false);
            }
            const listQuestionObj = [];
            if (listQuestionElementsData.length > 0) {
              for (let i = 0; i < listQuestionElementsData.length; i++) {
                const linkElement = await listQuestionElementsData[i].$("a");
                if (linkElement) {
                  const linkContent = await page.evaluate(
                    (element) => element.getAttribute("href"),
                    linkElement
                  );
                  const textContent = await page.evaluate(
                    (linkElement) => linkElement.textContent.trim(),
                    linkElement
                  );
                  const questionObj = {
                    linkContent,
                    textContent,
                  };
                  if (textContent !== "View all")
                    listQuestionObj.push(questionObj);
                }
              }
            }
            console.log("listQuestionObj: ", listQuestionObj);
          }
        }
      }
    }
  };
  while (true) {
    await waitPageLoading();
    await syncQuestion();
  }
}

(async () => {})();
