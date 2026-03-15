/**
 * linkedin-multi.js
 * LinkedIn API wrapper that accepts token + personUrn as arguments
 * (instead of reading from env vars), enabling multi-user posting.
 */
const axios = require("axios");

const LINKEDIN_API = "https://api.linkedin.com/v2";

async function postToLinkedInAs(token, personUrn, text) {
  if (!token || !personUrn) {
    throw new Error("Missing accessToken or personUrn for this user.");
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
    if (status === 401) throw new Error(`Token expired for this user. Detail: ${detail}`);
    if (status === 422) throw new Error(`LinkedIn rejected the post. Detail: ${detail}`);
    throw new Error(`LinkedIn API error (${status}): ${detail}`);
  }
}

module.exports = { postToLinkedInAs };
