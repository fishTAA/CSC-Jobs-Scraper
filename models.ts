export interface jobs {
  agency: string;
  region: string;
  position: string;
  item_no: string;
  posting_date: string;
  closing_date: string;
  jobid: string;
  job_link: string;
}
export interface FacebookPagePostResponse {
  data: FacebookPost[];
  paging: {
    cursors: {
      before: string;
      after: string;
    };
  };
}

export interface FacebookPost {
  created_time: string; // e.g. "2025-04-09T01:21:12+0000"
  message: string; // The full content of the post
  id: string; // Post ID
}
