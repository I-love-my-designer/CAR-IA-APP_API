import { Jimp } from "jimp";

async function testValid() {
  try {
    const tinyPngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const buffer = Buffer.from(tinyPngBase64, "base64");
    
    console.log("Testing Jimp on a valid non-corrupted 1x1 PNG...");
    const image = await Jimp.read(buffer);
    console.log(`Success! Width: ${image.width}, Height: ${image.height}`);
  } catch (err) {
    console.error("Failed to read valid 1x1 PNG with Jimp:", err);
  }
}

testValid();
