import { Jimp } from "jimp";
import fs from "fs";
import path from "path";

async function testJimp() {
  try {
    console.log("Testing Jimp on imageB_local.png...");
    const filePath = path.join(process.cwd(), "src", "local_test_images", "imageB_local.png");
    const buffer = fs.readFileSync(filePath);
    console.log(`Buffer length: ${buffer.length} bytes`);
    
    const image = await Jimp.read(buffer);
    console.log(`Jimp success! Width: ${image.width}, Height: ${image.height}`);
  } catch (err) {
    console.error("Jimp error on imageB_local.png:", err);
  }

  try {
    console.log("\nTesting Jimp on imageC_local.jpg...");
    const filePath = path.join(process.cwd(), "src", "local_test_images", "imageC_local.jpg");
    const buffer = fs.readFileSync(filePath);
    console.log(`Buffer length: ${buffer.length} bytes`);
    
    const image = await Jimp.read(buffer);
    console.log(`Jimp success! Width: ${image.width}, Height: ${image.height}`);
  } catch (err) {
    console.error("Jimp error on imageC_local.jpg:", err);
  }
}

testJimp();
