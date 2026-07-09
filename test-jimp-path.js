import { Jimp } from "jimp";
import path from "path";

async function testJimpPath() {
  try {
    console.log("Testing Jimp on imageC_local.jpg via file path...");
    const filePath = path.join(process.cwd(), "src", "local_test_images", "imageC_local.jpg");
    const image = await Jimp.read(filePath);
    console.log(`Jimp success with path! Width: ${image.width}, Height: ${image.height}`);
  } catch (err) {
    console.error("Jimp error on path:", err);
  }
}

testJimpPath();
