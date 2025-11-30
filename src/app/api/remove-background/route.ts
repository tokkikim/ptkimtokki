import { NextRequest, NextResponse } from 'next/server';
import * as ort from 'onnxruntime-node';
import { promises as fs } from 'fs';
import path from 'path';

// sharp는 동적 import (선택적 의존성)
let sharp: any = null;
async function getSharp() {
  if (!sharp) {
    sharp = (await import('sharp')).default;
  }
  return sharp;
}

// 세션 캐싱 (서버 재시작 전까지 유지)
let cachedSession: ort.InferenceSession | null = null;

// 배경 제거 함수 (재사용)
async function removeBackground(
  imageBuffer: Buffer,
  sharpInstance: any,
  session: ort.InferenceSession
): Promise<Buffer> {
  const perfStart = Date.now();
  
  // 모델이 고정된 입력 크기(1024x1024)를 요구함
  const size = 1024;
  
  // 이미지 전처리
  const image = sharpInstance(imageBuffer, {
    failOn: 'none',
    limitInputPixels: false
  });
  
  const metadata = await image.metadata();
  const preprocessStart = Date.now();
  
  // 1024x1024로 리사이즈 (모델 요구사항)
  const resizedImage = await image
    .resize(size, size, { 
      fit: 'cover',
      kernel: 'lanczos3' // 고품질 리사이즈
    })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  
  const preprocessTime = Date.now() - preprocessStart;

  const { data, info } = resizedImage;
  const channels = info.channels || 3;
  const pixelCount = size * size;
  const pixelStride = channels;

  // RGB 데이터 추출 및 정규화
  const inputTensorData = new Float32Array(1 * 3 * pixelCount);
  
  for (let i = 0; i < pixelCount; i++) {
    const pixelIdx = i * pixelStride;
    const r = (data[pixelIdx + 0] / 255.0 - 0.5) / 0.5;
    const g = (data[pixelIdx + 1] / 255.0 - 0.5) / 0.5;
    const b = (data[pixelIdx + 2] / 255.0 - 0.5) / 0.5;

    inputTensorData[i] = r;
    inputTensorData[i + pixelCount] = g;
    inputTensorData[i + 2 * pixelCount] = b;
  }

  // 추론 실행
  const inferenceStart = Date.now();
  const inputTensor = new ort.Tensor('float32', inputTensorData, [1, 3, size, size]);
  const feeds = { [session.inputNames[0]]: inputTensor };
  const results = await session.run(feeds);
  const outputTensor = results[session.outputNames[0]];
  let maskData = outputTensor.data as Float32Array;
  const inferenceTime = Date.now() - inferenceStart;
  
  console.log(`[Performance] Preprocess: ${preprocessTime}ms, Inference: ${inferenceTime}ms`);

  // 마스크 후처리 (성능 최적화: 더 강한 threshold로 노이즈 제거)
  const threshold = 0.4; // threshold를 낮춰서 더 많은 배경 제거
  const gamma = 0.8; // gamma를 높여서 경계를 더 부드럽게
  
  // 한 번의 루프로 처리 (성능 최적화)
  const processedMask = new Float32Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    let value = Math.max(0, Math.min(1, maskData[i]));
    // threshold 적용 및 gamma 보정
    processedMask[i] = value < threshold ? 0 : Math.pow(value, gamma);
  }
  
  maskData = processedMask;

  // 원본 이미지 처리
  const originalImage = sharpInstance(imageBuffer, {
    failOn: 'none',
    limitInputPixels: false
  });
  const originalMetadata = await originalImage.metadata();
  
  const originalRaw = await originalImage
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  
  const originalWidth = originalRaw.info.width;
  const originalHeight = originalRaw.info.height;
  const originalPixels = originalRaw.data;
  const originalPixelCount = originalWidth * originalHeight;
  
  // 마스크를 원본 크기로 리사이즈 (비율 유지, 중앙 정렬)
  const scale = Math.min(originalWidth / size, originalHeight / size);
  const scaledMaskWidth = size * scale;
  const scaledMaskHeight = size * scale;
  const offsetX = (originalWidth - scaledMaskWidth) / 2;
  const offsetY = (originalHeight - scaledMaskHeight) / 2;
  
  const finalBuffer = Buffer.allocUnsafe(originalPixelCount * 4);
  
  for (let y = 0; y < originalHeight; y++) {
    for (let x = 0; x < originalWidth; x++) {
      const maskX = (x - offsetX) / scale;
      const maskY = (y - offsetY) / scale;
      
      let maskAlpha = 0;
      
      if (maskX >= 0 && maskX < size - 1 && maskY >= 0 && maskY < size - 1) {
        const x1 = Math.floor(maskX);
        const y1 = Math.floor(maskY);
        const x2 = Math.min(x1 + 1, size - 1);
        const y2 = Math.min(y1 + 1, size - 1);
        
        const fx = maskX - x1;
        const fy = maskY - y1;
        
        const v11 = maskData[y1 * size + x1];
        const v21 = maskData[y1 * size + x2];
        const v12 = maskData[y2 * size + x1];
        const v22 = maskData[y2 * size + x2];
        
        maskAlpha = 
          v11 * (1 - fx) * (1 - fy) +
          v21 * fx * (1 - fy) +
          v12 * (1 - fx) * fy +
          v22 * fx * fy;
      }
      
      const pixelIdx = (y * originalWidth + x) * 4;
      
      finalBuffer[pixelIdx + 0] = originalPixels[pixelIdx + 0];
      finalBuffer[pixelIdx + 1] = originalPixels[pixelIdx + 1];
      finalBuffer[pixelIdx + 2] = originalPixels[pixelIdx + 2];
      finalBuffer[pixelIdx + 3] = Math.round(Math.max(0, Math.min(255, maskAlpha * 255)));
    }
  }
  
  // Feathering (성능 최적화: 더 작은 radius 사용)
  const featherRadius = 2; // 약간 증가하여 품질 유지
  const tempBuffer = Buffer.from(finalBuffer);
  
  // 성능 최적화: 경계 영역만 feathering 적용
  for (let y = 0; y < originalHeight; y++) {
    for (let x = 0; x < originalWidth; x++) {
      const pixelIdx = (y * originalWidth + x) * 4;
      const alpha = tempBuffer[pixelIdx + 3];
      
      // 완전히 투명하거나 불투명한 영역은 스킵 (성능 최적화)
      if (alpha === 0 || alpha === 255) {
        continue;
      }
      
      let sum = 0;
      let weight = 0;
      
      // 3x3 커널만 사용 (성능 최적화)
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          
          if (nx >= 0 && nx < originalWidth && ny >= 0 && ny < originalHeight) {
            const dist = Math.sqrt(dx * dx + dy * dy);
            const w = dist === 0 ? 1 : Math.exp(-dist * dist / (2 * featherRadius * featherRadius));
            const neighborIdx = (ny * originalWidth + nx) * 4;
            sum += tempBuffer[neighborIdx + 3] * w;
            weight += w;
          }
        }
      }
      
      if (weight > 0) {
        finalBuffer[pixelIdx + 3] = Math.round(sum / weight);
      }
    }
  }
  
  // PNG로 인코딩 (성능 최적화: 빠른 압축 레벨 사용)
  const encodeStart = Date.now();
  const result = await sharpInstance(finalBuffer, {
    raw: {
      width: originalWidth,
      height: originalHeight,
      channels: 4,
    },
  })
  .png({ 
    compressionLevel: 6, // 기본값 6 (0-9, 낮을수록 빠름)
    adaptiveFiltering: false // 성능 최적화
  })
  .toBuffer();
  
  const totalTime = Date.now() - perfStart;
  const encodeTime = Date.now() - encodeStart;
  console.log(`[Performance] Encode: ${encodeTime}ms, Total: ${totalTime}ms`);
  
  return result;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const imageFile = formData.get('image') as File;
    const splitPanels = formData.get('splitPanels') === 'true'; // 패널 분할 여부
    
    if (!imageFile) {
      return NextResponse.json(
        { error: '이미지 파일이 없습니다.' },
        { status: 400 }
      );
    }

    const arrayBuffer = await imageFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 모델 로드
    if (!cachedSession) {
      const modelPath = path.join(process.cwd(), 'public', 'models', 'rmbg-1.4-quantized.onnx');
      
      try {
        await fs.access(modelPath);
      } catch {
        return NextResponse.json(
          { error: '모델 파일을 찾을 수 없습니다. public/models/rmbg-1.4-quantized.onnx 파일이 필요합니다.' },
          { status: 500 }
        );
      }

      try {
        cachedSession = await ort.InferenceSession.create(modelPath, {
          executionProviders: ['cpu'],
          graphOptimizationLevel: 'all',
        });
        console.log('[Server] ONNX Session created with CPU');
      } catch (error: any) {
        console.error('[Server] ONNX Session creation failed:', error);
        throw new Error(`ONNX 세션 생성 실패: ${error.message}`);
      }
    }

    const sharpInstance = await getSharp();
    const image = sharpInstance(buffer);
    const metadata = await image.metadata();
    
    // 패널 분할 모드
    if (splitPanels) {
      const width = metadata.width || 0;
      const height = metadata.height || 0;
      
      if (width === 0 || height === 0) {
        return NextResponse.json(
          { error: '이미지 크기를 읽을 수 없습니다.' },
          { status: 400 }
        );
      }
      
      console.log(`[Server] Splitting image: ${width}x${height}`);
      
      // 2x2 그리드로 분할 (정확한 크기 계산)
      const panelWidth = Math.floor(width / 2);
      const panelHeight = Math.floor(height / 2);
      
      // 마지막 패널은 나머지 픽셀 포함
      const lastPanelWidth = width - panelWidth;
      const lastPanelHeight = height - panelHeight;
      
      const panels: Buffer[] = [];
      const startTime = Date.now();
      
      // 4개 패널 추출 및 배경 제거
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 2; col++) {
          const x = col * panelWidth;
          const y = row * panelHeight;
          
          // 마지막 행/열인 경우 나머지 픽셀 포함
          const extractWidth = col === 1 ? lastPanelWidth : panelWidth;
          const extractHeight = row === 1 ? lastPanelHeight : panelHeight;
          
          // 범위 검증
          if (x < 0 || y < 0 || x + extractWidth > width || y + extractHeight > height) {
            console.error(`[Server] Invalid extract area: x=${x}, y=${y}, w=${extractWidth}, h=${extractHeight}, image=${width}x${height}`);
            return NextResponse.json(
              { error: `패널 추출 영역이 유효하지 않습니다. (${x}, ${y}, ${extractWidth}, ${extractHeight})` },
              { status: 400 }
            );
          }
          
          console.log(`[Server] Extracting panel ${row * 2 + col + 1}: x=${x}, y=${y}, w=${extractWidth}, h=${extractHeight}`);
          
          // 패널 추출
          const panelBuffer = await image
            .clone() // 원본 이미지 복사 (여러 번 extract 사용 시 필요)
            .extract({
              left: x,
              top: y,
              width: extractWidth,
              height: extractHeight
            })
            .png()
            .toBuffer();
          
          // 배경 제거
          const processedPanel = await removeBackground(panelBuffer, sharpInstance, cachedSession!);
          panels.push(processedPanel);
        }
      }
      
      const processingTime = Date.now() - startTime;
      
      // Base64로 인코딩하여 반환
      const results = panels.map((panel, index) => ({
        index: index + 1,
        image: `data:image/png;base64,${panel.toString('base64')}`,
        filename: `panel-${index + 1}.png`
      }));
      
      return NextResponse.json({
        success: true,
        panels: results,
        processingTime: processingTime,
        message: `4개 패널 처리 완료 (처리 시간: ${processingTime}ms)`,
      });
    }
    
    // 단일 이미지 처리 (기존 로직)
    const startTime = Date.now();
    const processedImage = await removeBackground(buffer, sharpInstance, cachedSession!);
    const inferenceTime = Date.now() - startTime;
    
    const finalBase64 = processedImage.toString('base64');
    const finalDataUrl = `data:image/png;base64,${finalBase64}`;

    return NextResponse.json({
      success: true,
      image: finalDataUrl,
      inferenceTime: inferenceTime,
      message: `처리 완료 (추론 시간: ${inferenceTime}ms)`,
    });

  } catch (error: any) {
    console.error('[Server] Background removal error:', error);
    return NextResponse.json(
      { error: '배경 제거 처리 중 오류가 발생했습니다.', details: error.message },
      { status: 500 }
    );
  }
}