import { createClient } from "@supabase/supabase-js";
import { jobs } from "./models";
import dotenv from "dotenv";
dotenv.config();
// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

/**
 * Note: In Supabase, tables are created using SQL inside the dashboard
 * or using the SQL Editor — not via runtime JS code.
 * 
 * Equivalent table schema:
 * 
 * CREATE TABLE IF NOT EXISTS POSTREFERENCE (
 *   id SERIAL PRIMARY KEY,
 *   agency TEXT,
 *   region TEXT,
 *   position TEXT,
 *   item_no TEXT,
 *   posting_date TEXT,
 *   closing_date TEXT,
 *   jobid TEXT UNIQUE,
 *   job_link TEXT
 * );
 */

export async function insertJob(job: jobs) {
  const { data, error } = await supabase
    .from("postreference")
    .insert([{
      agency: job.agency,
      region: job.region,
      position: job.position,
      item_no: job.item_no,
      posting_date: job.posting_date,
      closing_date: job.closing_date,
      jobid: job.jobid,
      job_link: job.job_link
    }])
    .select(); // optional, returns inserted row(s)
    
  if (error) {
    console.error("Insert failed:", error.message);
  } else {
    console.log("Job inserted successfully:", data);
  }
}

export async function getLatestJob(): Promise<jobs | null> {
  const { data, error } = await supabase
    .from("postreference")
    .select("*")
    .order("id", { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== "PGRST116") { // PGRST116 means no rows
    console.error("Failed to fetch latest job:", error.message);
    return null;
  }

  if (data) {
    console.log("Latest job ID:", data.jobid);
    return data as jobs;
  } else {
    console.log("No jobs found.");
    return null;
  }
}

export async function deleteAllJobs() {
  const { error } = await supabase.from("postreference").delete().neq("id", 0);

  if (error) {
    console.error("Failed to delete all jobs:", error.message);
  } else {
    console.log("All rows deleted from POSTREFERENCE table.");
  }
}
