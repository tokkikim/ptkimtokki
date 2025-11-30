const fs = require('fs');
const https = require('https');
const path = require('path');

const targetDir = path.join('public', 'models');
// ModNet Quantized (INT8) 모델 URL - 훨씬 가볍고 빠름
const modelUrl = 'https://huggingface.co/Xenova/modnet/resolve/main/onnx/model_quantized.onnx';
const fileName = 'modnet_quantized.onnx';

if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

const filePath = path.join(targetDir, fileName);
console.log(`Downloading Quantized ModNet to ${filePath}...`);

const fileStream = fs.createWriteStream(filePath);

https.get(modelUrl, response => {
    if (response.statusCode === 302 || response.statusCode === 301) {
        https.get(response.headers.location, redirectResponse => {
            redirectResponse.pipe(fileStream);
            fileStream.on('finish', () => {
                fileStream.close();
                console.log('\nDownload completed!');
            });
        });
    } else {
        response.pipe(fileStream);
        fileStream.on('finish', () => {
            fileStream.close();
            console.log('\nDownload completed!');
        });
    }
}).on('error', err => {
    console.error(`Error:`, err.message);
});
