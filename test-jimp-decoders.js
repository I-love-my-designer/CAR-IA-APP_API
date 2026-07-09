import { Jimp } from "jimp";

console.log("Jimp object:", Object.keys(Jimp));
console.log("Jimp decoders:", Jimp.decoders ? Object.keys(Jimp.decoders) : "undefined");
console.log("Jimp encoders:", Jimp.encoders ? Object.keys(Jimp.encoders) : "undefined");
