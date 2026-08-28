import { loadData, boot } from "./game.js?v=desk4";

const root = document.querySelector("#desk");
const status = document.querySelector("#boot-status");

try {
  const data = await loadData();
  status.hidden = true;
  boot(root, data);
} catch (err) {
  status.hidden = false;
  status.textContent =
    "Could not load local JSON. Serve this folder over HTTP (python3 -m http.server) rather than opening the file directly. " +
    (err && err.message ? err.message : String(err));
  console.error(err);
}
