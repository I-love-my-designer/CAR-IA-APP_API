import fetch from "node-fetch"; // or standard fetch in Node 18+
import fs from "fs";

const imageA = "https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0870404092.firebasestorage.app/o/backgrounds%2Fdesert_road_hd.jpg?alt=media";
const imageB = "https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0870404092.firebasestorage.app/o/vehicles%2Fporsche_taycan_detoure.png?alt=media";
const imageC = "https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0870404092.firebasestorage.app/o/compositions%2Freference_comp_075.jpg?alt=media";

async function testUrl(url, name) {
  try {
    console.log(`\n--- Testing ${name} ---`);
    console.log(`URL: ${url}`);
    const res = await fetch(url);
    console.log(`Status: ${res.status} ${res.statusText}`);
    console.log(`Content-Type: ${res.headers.get("content-type")}`);
    console.log(`Content-Length: ${res.headers.get("content-length")}`);
    
    const buffer = Buffer.from(await res.arrayBuffer());
    console.log(`Downloaded size: ${buffer.length} bytes`);
    if (buffer.length > 0) {
      const hex = Array.from(buffer.subarray(0, 20)).map(b => b.toString(16).toUpperCase().padStart(2, "0")).join(" ");
      console.log(`Magic Bytes Hex: ${hex}`);
      console.log(`Text Sample: ${buffer.subarray(0, 100).toString("utf-8").replace(/[\x00-\x1F\x7F-\x9F]/g, ".")}`);
    }
  } catch (err) {
    console.error(`Error testing ${name}:`, err);
  }
}

async function run() {
  await testUrl(imageA, "Image A");
  await testUrl(imageB, "Image B");
  await testUrl(imageC, "Image C");
}

run();
