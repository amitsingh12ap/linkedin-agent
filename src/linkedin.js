const axios = require("axios");
require("dotenv").config();

const LINKEDIN_API = "https://api.linkedin.com/v2";

async function postToLinkedIn(text) {
  const token = process.env.LINKEDIN_ACCESS_TOKEN;
  const personUrn = process.env.LINKEDIN_PERSON_URN;

  if (!token || !personUrn) {
    throw new Error(
      "Missing LINKEDIN_ACCESS_TOKEN or LINKEDIN_PERSON_URN env vars.\n" +
      "See README.md → LinkedIn API Setup for instructions."
    );
  }

  const payload = {
    author: personUrn,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text },
        shareMediaCategory: "NONE",
      },
    },
    visibility: {
      "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
    },
  };

  try {
    const response = await axios.post(`${LINKEDIN_API}/ugcPosts`, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
    });
    return { id: response.data.id, status: response.status };
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data?.message || err.message;
    if (status === 401) throw new Error(`LinkedIn token expired. Refresh LINKEDIN_ACCESS_TOKEN.\nDetail: ${detail}`);
    if (status === 422) throw new Error(`LinkedIn rejected the post. Detail: ${detail}`);
    throw new Error(`LinkedIn API error (${status}): ${detail}`);
  }
}

async function getMyPersonUrn() {
  const token = process.env.LINKEDIN_ACCESS_TOKEN;
  const response = await axios.get(`${LINKEDIN_API}/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return `urn:li:person:${response.data.id}`;
}

module.exports = { postToLinkedIn, getMyPersonUrn };
