import { loadChallenges, boot } from "./council.js?v=ob35";

const root = document.querySelector("#desk");
const status = document.querySelector("#boot-status");

try {
  const data = await loadChallenges();
  if (status) status.textContent = `London · ${data.challenges.length} challenges`;
  boot(root, data);
} catch (err) {
  if (status) {
    status.hidden = false;
    status.textContent =
      "Could not load local JSON. Serve this folder over HTTP. " +
      (err && err.message ? err.message : String(err));
  }
  console.error(err);
}
