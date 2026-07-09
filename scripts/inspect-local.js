import fs from "fs";
import path from "path";

function inspectLocalFile(fileName) {
  try {
    console.log(`\n--- Inspecting ${fileName} ---`);
    const filePath = path.join(process.cwd(), "src", "local_test_images", fileName);
    if (!fs.existsSync(filePath)) {
      console.log(`File does not exist: ${filePath}`);
      return;
    }
    const buffer = fs.readFileSync(filePath);
    console.log(`File size: ${buffer.length} bytes`);
    
    const hex = Array.from(buffer.subarray(0, 20)).map(b => b.toString(16).toUpperCase().padStart(2, "0")).join(" ");
    console.log(`Magic Bytes Hex: ${hex}`);
    console.log(`Text Sample: ${buffer.subarray(0, 100).toString("utf-8").replace(/[\x00-\x1F\x7F-\x9F]/g, ".")}`);
  } catch (err) {
    console.error(`Error inspecting ${fileName}:`, err);
  }
}

inspectLocalFile("imageA_local.jpg");
inspectLocalFile("imageB_local.png");
inspectLocalFile("imageC_local.jpg");
