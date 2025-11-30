const fs = require('fs');
const https = require('https');
const path = require('path');

const targetDir = path.join('public', 'models');
const modelUrl = 'https://huggingface.co/briaai/RMBG-1.4/resolve/main/onnx/model.onnx';
const fileName = 'rmbg-1.4.onnx';

if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

const filePath = path.join(targetDir, fileName);
console.log(`Downloading model to ${filePath}...`);

const fileStream = fs.createWriteStream(filePath);

https.get(modelUrl, response => {
    if (response.statusCode === 302 || response.statusCode === 301) {
        // 리다이렉트 처리
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
                console.log('\nModel download completed!');
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
            console.log('\nModel download completed!');
        });
    }
}).on('error', err => {
    console.error(`Error downloading model:`, err.message);
});
