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
  console.log("accounts", accounts);
  const [email, password] = accounts[0].info.split("|");
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
    const scrollInterval = 2000;
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
    const fs = await import("fs");
    const config = fs.readFileSync("config.json", "utf8");
    const { serverUrl, clientName } = JSON.parse(config);

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
                    url: linkContent,
                    title: textContent,
                    status: "iddle",
                  };
                  if (textContent !== "View all")
                    listQuestionObj.push(questionObj);
                }
              }
            }

            console.log(
              "::=========================>listQuestionObj",
              listQuestionObj
            );
            await fetch(serverUrl + "/api/quoras-bulk", {
              method: "post",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(listQuestionObj),
            });
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

async function executeJob({ browser, page, waitFor, wrap }) {
  const fs = await import("fs");
  const config = fs.readFileSync("config.json", "utf8");
  const { serverUrl, clientName } = JSON.parse(config);
  while (true) {
    try {
      const res = await fetch(
        serverUrl + "/api/job-by-client?clientName=" + clientName
      );
      const resJson = await res.json();
      console.log("resJson", resJson);
      const { code, _id } = resJson;
      console.log("id job", _id, code);
      const executeInit = new Function(wrap(code));
      await executeInit.call(null).call(null, { browser, page, waitFor, wrap });
      await fetch(serverUrl + "/api/done-job&id=" + _id);
      await waitFor(5000);
    } catch (error) {
      console.log("error", error.message);
      await waitFor(5000);
    }
  }
}

async function replyQuoraQuestion({ page, waitFor }) {
  await page.waitForSelector("#mainContent");
  await waitFor(3000);
  await page.goto(
    "https://www.quora.com/I-noticed-some-Chaoxianzu-Joseonjok-had-Chinese-last-names-Why-is-this-Were-they-actually-mixed-or-full-Chinese"
  );
  await waitFor(3000);
  const handleReply = async (editBtn, hasDelete) => {
    await editBtn.click();
    const elementHandle = await page.waitForSelector(
      '[data-placeholder="Write your answer"]'
    );
    if (hasDelete) {
      await elementHandle.click({ clickCount: 3 });
      await elementHandle.press("Backspace");
    }
    await elementHandle.type(
      `The Chaoxianzu, also known as Joseonjok or Korean Chinese, refers to ethnic Koreans living in China. The presence of Chinese last names among the Chaoxianzu may be due to historical and cultural factors. 1. Intermarriage and Cultural Exchange: Over the centuries, there has been cultural exchange and intermarriage between different ethnic groups in various regions. It's possible that some Chaoxianzu families have Chinese last names due to intermarriage or cultural interactions with the Chinese population. 2. Adoption of Chinese Naming Practices: In some cases, individuals or families may adopt Chinese naming practices for various reasons, such as assimilation, societal pressure, or administrative convenience. This could lead to the adoption of Chinese last names. 3. Historical Events: Historical events, migrations, and changes in political boundaries can also influence the ethnic makeup of populations. For example, during certain periods, some ethnic Koreans may have migrated to China, and their descendants might have acquired Chinese last names. 4. Administrative or Legal Requirements: In some cases, individuals might adopt Chinese names for administrative or legal purposes, which could include obtaining certain rights or benefits within the Chinese system. It's important to note that the presence of Chinese last names does not necessarily imply "mixing" in the genetic sense, as individuals can adopt names from other cultures for various reasons without being genetically mixed.`
    );
    const submitBtn = await page.evaluateHandle(() => {
      const xpathResult = document.evaluate(
        "//button[contains(., 'Post')]",
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      );
      const button = xpathResult.singleNodeValue;
      return button;
    });
    if (submitBtn.handle) await submitBtn.click();
    const doneBtn = await page.evaluateHandle(() => {
      const xpathResult = document.evaluate(
        "//button[contains(., 'Done')]",
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      );
      const button = xpathResult.singleNodeValue;
      return button;
    });
    if (doneBtn.handle) await doneBtn.click();
  };
  const answerButton = await page.evaluateHandle(() => {
    const xpathResult = document.evaluate(
      "//button[contains(., 'Answer')]",
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    );
    const button = xpathResult.singleNodeValue;
    return button;
  });
  const editDraftButton = await page.evaluateHandle(() => {
    const xpathResult = document.evaluate(
      "//button[contains(., 'Edit draft')]",
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    );
    const button = xpathResult.singleNodeValue;
    return button;
  });
  if (answerButton.handle) {
    handleReply(answerButton, false);
  } else if (editDraftButton.handle) {
    handleReply(editDraftButton, true);
  }
  await waitFor(5000);
  const url = await page.url();
}

(async () => {
  const { page, waitFor } = await openQuora({
    chromePath: "C://Program Files/Google/Chrome/Application/chrome.exe",
    url: "https://www.quora.com/answer",
  });
  const wrap = (s) => "{ return " + s + " };";
  const func =
    "async function replyQuoraQuestion({ page, waitFor }) {\n    await page.waitForSelector('#mainContent');\n    await waitFor(3000);\n    await page.goto(\"https://www.quora.com/Why-do-Vietnam-vets-not-talk-about-the-war\");\n    await waitFor(3000);\n    const handleReply = async (editBtn, hasDelete) => {\n      await editBtn.click();\n      const elementHandle = await page.waitForSelector('[data-placeholder=\"Write your answer\"]');\n      if (hasDelete) {\n        await elementHandle.click({ clickCount: 3 });\n        await elementHandle.press('Backspace');\n      }\n      await elementHandle.type(\"The question on Quora is asking why Vietnam veterans might choose not to talk about the Vietnam War. There could be various reasons why some Vietnam veterans might be reluctant to discuss their experiences in the war. Here are a few potential factors:\n\n1. Traumatic Experiences: Many Vietnam veterans went through intense and traumatic experiences during the war, which could include combat, loss of comrades, and exposure to difficult conditions. Discussing such traumatic events can be emotionally challenging, and some veterans may prefer not to relive those memories.\n2. Stigma and Controversy: The Vietnam War was a highly controversial conflict, and veterans returning home often faced negative public sentiment. Some veterans may have experienced hostility or felt that their service was not properly appreciated. This could contribute to a reluctance to discuss their experiences.\n3. Personal Coping Mechanisms: Each individual copes with trauma differently. Some veterans may find it more comfortable to cope with their experiences privately or within the support of close friends or fellow veterans rather than discussing them openly.\n4. Sense of Duty and Honor: Some veterans may hold a deep sense of duty and honor, and they may choose not to discuss their experiences as a way of protecting the reputation of their fellow soldiers, maintaining a sense of personal privacy, or avoiding potential misunderstandings.\n5. Complexity of the War: The Vietnam War was a complex and controversial conflict, and veterans may find it challenging to convey the full scope and nuances of their experiences. Some may choose not to discuss the war because they feel it is difficult to capture the complexity in a brief conversation.\n\nIt's essential to recognize that individuals vary, and not all Vietnam veterans share the same perspectives or reasons for choosing to discuss or not discuss their wartime experiences. Some veterans are quite open about their experiences, while others may prefer a more private approach. Respecting the choices of veterans regarding what they choose to share is important.\");\n      const submitBtn = await page.evaluateHandle(() => {\n        const xpathResult = document.evaluate(\n          \"//button[contains(., 'Post')]\",\n          document,\n          null,\n          XPathResult.FIRST_ORDERED_NODE_TYPE,\n          null,\n        );\n        const button = xpathResult.singleNodeValue;\n        return button;\n      });\n      if (submitBtn.handle) await submitBtn.click();\n      const doneBtn = await page.evaluateHandle(() => {\n        const xpathResult = document.evaluate(\n          \"//button[contains(., 'Done')]\",\n          document,\n          null,\n          XPathResult.FIRST_ORDERED_NODE_TYPE,\n          null,\n        );\n        const button = xpathResult.singleNodeValue;\n        return button;\n      });\n      if (doneBtn.handle) await doneBtn.click();\n    };\n    const answerButton = await page.evaluateHandle(() => {\n      const xpathResult = document.evaluate(\n        \"//button[contains(., 'Answer')]\",\n        document,\n        null,\n        XPathResult.FIRST_ORDERED_NODE_TYPE,\n        null,\n      );\n      const button = xpathResult.singleNodeValue;\n      return button;\n    });\n    const editDraftButton = await page.evaluateHandle(() => {\n      const xpathResult = document.evaluate(\n        \"//button[contains(., 'Edit draft')]\",\n        document,\n        null,\n        XPathResult.FIRST_ORDERED_NODE_TYPE,\n        null,\n      );\n      const button = xpathResult.singleNodeValue;\n      return button;\n    });\n    if (answerButton.handle) {\n      handleReply(answerButton, false);\n    } else if (editDraftButton.handle) {\n      handleReply(editDraftButton, true);\n    }\n    await waitFor(5000);\n    const url = await page.url();\n  }";
  const executeInit = new Function(wrap(func));
  await executeInit.call(null).call(null, { wrap, page, waitFor });
})();
