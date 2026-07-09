import fs from "fs";
import path from "path";

function printBase64(fileName) {
  const filePath = path.join(process.cwd(), "src", "local_test_images", fileName);
  const buffer = fs.readFileSync(filePath);
  console.log(`\nconst ${fileName.replace("_local", "").replace(".", "")}Base64 = "${buffer.toString("base64")}";`);
}

printBase64("imageA_local.jpg");
printBase64("imageB_local.png");
printBase64("imageC_local.jpg");
