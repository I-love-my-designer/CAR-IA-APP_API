import { Jimp } from "jimp";
import fs from "fs";
import path from "path";

async function generateFallbacks() {
  try {
    const dirPath = path.join(process.cwd(), "src", "local_test_images");
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    // Generate a 128x128 grey background JPEG
    console.log("Generating imageA_local.jpg...");
    const imgA = new Jimp({ width: 128, height: 128, color: 0x808080ff }); // solid gray
    const bufA = await imgA.getBuffer("image/jpeg");
    fs.writeFileSync(path.join(dirPath, "imageA_local.jpg"), bufA);
    console.log(`Saved imageA_local.jpg (${bufA.length} bytes)`);

    // Generate a 128x128 solid blue PNG for the vehicle
    console.log("Generating imageB_local.png...");
    const imgB = new Jimp({ width: 128, height: 128, color: 0x0000ffff }); // solid blue (vehicle placeholder)
    const bufB = await imgB.getBuffer("image/png");
    fs.writeFileSync(path.join(dirPath, "imageB_local.png"), bufB);
    console.log(`Saved imageB_local.png (${bufB.length} bytes)`);

    // Generate a 128x128 light gray JPEG for the composition reference
    console.log("Generating imageC_local.jpg...");
    const imgC = new Jimp({ width: 128, height: 128, color: 0xd3d3d3ff }); // solid light gray
    const bufC = await imgC.getBuffer("image/jpeg");
    fs.writeFileSync(path.join(dirPath, "imageC_local.jpg"), bufC);
    console.log(`Saved imageC_local.jpg (${bufC.length} bytes)`);

    console.log("\nAll local fallback files generated successfully!");
  } catch (err) {
    console.error("Error generating fallbacks:", err);
  }
}

generateFallbacks();
