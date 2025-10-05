import Database from "better-sqlite3";
import { jobs } from "./models";

const db = new Database("cscjobs.db");

export function createdb() {
  const query = `CREATE TABLE IF NOT EXISTS POSTREFERENCE (
    id INTEGER PRIMARY KEY,
    agency TEXT,
    region TEXT,
    position TEXT,
    item_no TEXT,
    posting_date TEXT,
    closing_date TEXT,
    jobid TEXT,
    job_link TEXT
  )`;

  db.exec(query);
}

export function insertJob(job: jobs) {
  const query = `
    INSERT OR IGNORE INTO POSTREFERENCE (
        agency, region, position, item_no, posting_date, closing_date, jobid, job_link) VALUES (?,?,?,?,?,?,?,?)
    
    `;
  const stmt = db.prepare(query);

  stmt.run(
    job.agency,
    job.region,
    job.position,
    job.item_no,
    job.posting_date,
    job.closing_date,
    job.jobid,
    job.job_link
  );
  console.log("Job inserted successfully.");
}

export function getLatestJob(): jobs | null {
  const latestJob = db
    .prepare(
      `SELECT agency, region, position, item_no, posting_date, closing_date, jobid, job_link 
       FROM POSTREFERENCE 
       ORDER BY ROWID DESC 
       LIMIT 1`
    )
    .get() as jobs | undefined;

  if (latestJob) {
    console.log("Latest job ID:", latestJob.jobid);
    return latestJob;
  } else {
    console.log("No jobs found.");
    return null;
  }
}

export function deleteAllJobs() {

// delete all rows
db.prepare('DELETE FROM POSTREFERENCE').run();

console.log('All rows deleted from users table.');
}

