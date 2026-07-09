import { Jimp } from "jimp";
import fs from "fs";
import path from "path";

async function testJimpTypedArray() {
  try {
    console.log("Testing Jimp on imageC_local.jpg via Uint8Array...");
    const filePath = path.join(process.cwd(), "src", "local_test_images", "imageC_local.jpg");
    const buffer = fs.readFileSync(filePath);
    const typedArray = new Uint8Array(buffer);
    console.log(`Uint8Array length: ${typedArray.length} bytes`);
    
    const image = await Jimp.read(typedArray);
    console.log(`Jimp success with Uint8Array! Width: ${image.width}, Height: ${image.height}`);
  } catch (err) {
    console.error("Jimp error on Uint8Array:", err);
  }
}

testJimpTypedArray();
