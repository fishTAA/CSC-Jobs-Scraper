import { chromium, Page } from "playwright";
import dotenv from "dotenv";
import { jobs, FacebookPagePostResponse } from "./models";
import { deleteAllJobs, getLatestJob, insertJob } from "./db";

dotenv.config();

async function scrape_CSC_W_CHECK() {
  const lastposted: jobs | null = await getLatestJob(); // Get the latest posted job
  console.log("latest jobid" + lastposted?.jobid, lastposted?.position);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  let jobs;

  await page.setExtraHTTPHeaders({
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
  });

  console.log("Navigating to CSC Career site...");
  await page.goto("https://csc.gov.ph/career/", { waitUntil: "networkidle" });

  // await page.setViewportSize({ width: 1280, height: 1024 });

  await page.waitForSelector('select[name="region"]');

  console.log("Selecting NCR region...");
  await page.selectOption('select[name="region"]', { label: "NCR" });

  await page.click('button[name="sort_list"]');

  // WAIT for the table to fully load FIRST before selecting 100 rows
  await page.waitForSelector("table#jobs tbody tr");

  // Now safely select 100 rows
  await page.selectOption("select[name='jobs_length']", { value: "100" });

  // Poll until 100 rows are loaded
  while (true) {
    const rowCount = await page.evaluate(
      () => document.querySelectorAll("table#jobs tbody tr").length
    );

    if (rowCount >= 100) {
      console.log(`Loaded ${rowCount} rows`);
      break;
    }

    await page.waitForTimeout(500); // wait 0.5 second before checking again
  }

  console.log("Traversing pages for new jobs...");
  if (lastposted) {
    console.log("Finding last job");
    jobs = await traversTablePages(page, lastposted);
  } else {
    console.log("No job posting yet, scrapping page 1");
    jobs = await scrapePage1(page);
  }

  // console.log(jobs);

  await browser.close();

  return jobs;
}
async function scrapePage1(page: Page) {
  const jobData: jobs[] = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll("table#jobs tbody tr"));
    return rows.map((row, index) => {
      const cells = row.querySelectorAll("td");
      console.log(index);
      const jobLink = row
        .querySelector('button[id^="info_"]')
        ?.id.replace("info_", "");
      return {
        agency: cells[0]?.innerText.trim(),
        region: cells[1]?.innerText.trim(),
        position: cells[2]?.innerText.trim(),
        item_no: cells[3]?.innerText.trim(),
        posting_date: cells[4]?.innerText.trim(),
        closing_date: cells[5]?.innerText.trim(),
        jobid: jobLink!,
        job_link: jobLink ? `https://csc.gov.ph/career/job/${jobLink}` : "",
      };
    });
  });
  return jobData;
}

async function traversTablePages(page: Page, lastJobId: jobs) {
  const newJobs = [];
  let found = false;

  while (!found) {
    console.log("Searching current page...");

    await page.selectOption("select[name='jobs_length']", { value: "100" });
    await page.waitForTimeout(2000);

    const rows = await page.$$("table#jobs tbody tr");

    for (const row of rows) {
      const jobLinkId = await row.$eval('button[id^="info_"]', (btn) =>
        btn.id.replace("info_", "")
      );

      // Collect job details
      const cells = await row.$$eval("td", (tds) =>
        tds.map((td) => td.innerText.trim())
      );

      newJobs.push({
        agency: cells[0],
        region: cells[1],
        position: cells[2],
        item_no: cells[3],
        posting_date: cells[4],
        closing_date: cells[5],
        jobid: jobLinkId,
        job_link: `https://csc.gov.ph/career/job/${jobLinkId}`,
      });

      // Check if this is the last known job
      if (jobLinkId === lastJobId.jobid) {
        console.log("Last known job found:", jobLinkId);
        found = true;
        break; // Stop collecting once found
      }
    }

    if (found) break;

    const nextButton = await page.$("#jobs_next");
    const isDisabled = await nextButton!.evaluate((btn) =>
      btn.classList.contains("disabled")
    );

    if (isDisabled) {
      console.log("Reached last page. Job not found.");
      break;
    }

    console.log("Going to next page...");
    await nextButton!.click();
    await page.waitForTimeout(1000);
  }

  return newJobs;
}

async function facbookPagePost(jobs: jobs[]) {
  if (!process.env.FB_ACCESSTOKEN || !process.env.PAGE_ID) {
    throw new Error("Missing API_URL or API_TOKEN in .env");
  }

  const padding = " ".repeat(12);

  const message = jobs
    .map((job, index) => {
      const paddingstart = index === 0 ? " ".repeat(12) : "";
      return `
        \n-----------------------\n
        ${String(index + 1)}.
        ${job.agency} \n${padding}is hiring!
        ${"Position:"}\n${padding}${job.position}
        ${"Region:"}${job.region}
        ${"Posting date:"}${job.posting_date}
        ${"Closing date:"}${job.closing_date}
        ${"Link:"}${job.job_link}
      `;
    })
    .join();

  const data = {
    message,
    access_token: process.env.FB_ACCESSTOKEN,
  };

  const response = await fetch(
    `https://graph.facebook.com/v22.0/${process.env.PAGE_ID}/feed`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    }
  );

  if (!response.ok) {
    throw new Error(
      `Facebook API error: ${response.status} - ${await response.text()}`
    );
  }

  const result = await response.json();
  console.log("Success:", result);
  return result;
}

async function main() {
  try {
    console.log("Starting CSC Scraper...");

    const jobs: jobs[] = await scrape_CSC_W_CHECK();

    if (jobs.length === 1) {
      console.log("No new jobs found. Nothing to post.");
      return;
    }

    console.log(
      `Found ${jobs.length} new jobs. Posting to Facebook in batches...`
    );

    // Insert the first job after a successful Facebook post
    const firstJob = jobs[0];
    let isFirstPostSuccessful = false; // Flag to track if the first post was successful

    // Now handle the jobs in batches
    const batchSize = 150;
    for (let i = 0; i < jobs.length; i += batchSize) {
      const batch = jobs.slice(i, i + batchSize);
      console.log(
        `Posting batch ${Math.floor(i / batchSize) + 1} with ${
          batch.length
        } jobs...`
      );
      try {
        await facbookPagePost(batch); // Wait for Facebook post to finish
        if (!isFirstPostSuccessful) {
         await deleteAllJobs(); // Clear the table only before inserting the first job
          console.log("Database cleared before inserting the first job.");
          // If the first post has been successfully made, insert the first job
          await insertJob(firstJob);
          console.log("First job inserted into the database.");
          isFirstPostSuccessful = true; // Set the flag to true after successful insertion
        }
      } catch (error) {
        console.error(`Failed to post batch starting from index ${i}:`, error);
      }
    }

    console.log("All jobs posted to Facebook!");
  } catch (error) {
    console.error("Error in main:", error);
  }
}
main();

async function test() {
  const jobs: jobs[] = await scrape_CSC_W_CHECK();
  console.log(jobs);
}

// test();


async function jobScreenShot() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.setExtraHTTPHeaders({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
  });

  console.log("Navigating to CSC Career site...");
  await page.goto("https://csc.gov.ph/career/", { waitUntil: "networkidle" });

  // Listen for new page if there's a redirect to a new tab
  const [newPage] = await Promise.all([
    context.waitForEvent('page'), // Waits for new tab
    page.click('button[id="info_4429004"]'), // Trigger action that could open new tab
  ]);

  await newPage.waitForLoadState('networkidle');
  await newPage.waitForTimeout(2000);
  await newPage.screenshot({ path: 'screenshot.png' });

  await browser.close();
}





