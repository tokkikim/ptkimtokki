const fs = require('fs');
const https = require('https');
const path = require('path');

const targetDir = path.join('public', 'models');
// RMBG-1.4 Quantized (INT8) - 용량 약 40MB, 속도 빠름, 품질 좋음
const modelUrl = 'https://huggingface.co/briaai/RMBG-1.4/resolve/main/onnx/model_quantized.onnx';
const fileName = 'rmbg-1.4-quantized.onnx';

if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

const filePath = path.join(targetDir, fileName);
console.log(`Downloading Quantized RMBG-1.4 to ${filePath}...`);

const fileStream = fs.createWriteStream(filePath);

https.get(modelUrl, response => {
    if (response.statusCode === 302 || response.statusCode === 301) {
        https.get(response.headers.location, redirectResponse => {
            const len = parseInt(redirectResponse.headers['content-length'], 10);
            let downloaded = 0;
            
            redirectResponse.pipe(fileStream);
            
            redirectResponse.on('data', (chunk) => {
                downloaded += chunk.length;
                process.stdout.write(`\rDownloaded ${(downloaded / 1024 / 1024).toFixed(2)} MB / ${(len / 1024 / 1024).toFixed(2)} MB`);
            });

            fileStream.on('finish', () => {
                fileStream.close();
                console.log('\nDownload completed!');
            });
        });
    } else {
        const len = parseInt(response.headers['content-length'], 10);
        let downloaded = 0;
        
        response.pipe(fileStream);
        
        response.on('data', (chunk) => {
            downloaded += chunk.length;
            process.stdout.write(`\rDownloaded ${(downloaded / 1024 / 1024).toFixed(2)} MB / ${(len / 1024 / 1024).toFixed(2)} MB`);
        });

        fileStream.on('finish', () => {
            fileStream.close();
            console.log('\nDownload completed!');
        });
    }
}).on('error', err => {
    console.error(`Error:`, err.message);
});
