import { initDataFetch } from "./mapData";

const runOnce = process.argv.includes("--once");
initDataFetch(runOnce);