import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import supabaseAdmin from '@/lib/supabase/admin';
import { GoogleGenAI } from '@google/genai';
import * as ort from 'onnxruntime-node';
import { promises as fs } from 'fs';
import path from 'path';
import sharp from 'sharp';

// 동적 렌더링 강제 (cookies() 사용을 위해 필요)
export const dynamic = 'force-dynamic';

// Google Gemini API를 통한 포즈 생성
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyDxYqZJ-r8Wgg2NSOzNzvPuc7ubsAJwM7I';

// ONNX 세션 캐싱 (배경 제거용)
let bgRemoveSession: ort.InferenceSession | null = null;

// 오늘 날짜 문자열 반환 (YYYY-MM-DD)
function getTodayDateString(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 비회원 여부 체크 (세션 쿠키 확인)
async function isGuest(cookieStore: Awaited<ReturnType<typeof cookies>>): Promise<boolean> {
  // TODO: 실제 회원 인증 로직으로 대체
  // 예: const session = cookieStore.get('session'); return !session || !isAuthenticated(session);
  // 현재는 세션 쿠키가 없으면 비회원으로 간주
  const sessionCookie = cookieStore.get('session');
  return !sessionCookie; // 세션이 없으면 비회원
}

// 비회원이 오늘 이미 생성했는지 체크
async function hasGuestGeneratedToday(cookieStore: Awaited<ReturnType<typeof cookies>>): Promise<boolean> {
  if (!(await isGuest(cookieStore))) return false; // 회원이면 제한 없음
  
  const lastGenerationDate = cookieStore.get('guest_pose_generation_date')?.value;
  const today = getTodayDateString();
  
  return lastGenerationDate === today;
}

// 비회원 생성 기록 저장 (성공 시 호출)
async function saveGuestGenerationDate(cookieStore: Awaited<ReturnType<typeof cookies>>): Promise<void> {
  if (!(await isGuest(cookieStore))) return; // 회원이면 저장하지 않음
  
  const today = getTodayDateString();
  cookieStore.set('guest_pose_generation_date', today, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24, // 24시간 (하루)
    path: '/',
  });
}

// 배경 제거 함수
async function removeBackgroundFromImage(imageDataUrl: string): Promise<string> {
  // Base64 데이터 URL을 Buffer로 변환
  const base64Data = imageDataUrl.split(',')[1];
  const buffer = Buffer.from(base64Data, 'base64');
  
  // ONNX 세션 로드 (최초 1회)
  if (!bgRemoveSession) {
    const modelPath = path.join(process.cwd(), 'public', 'models', 'rmbg-1.4-quantized.onnx');
    bgRemoveSession = await ort.InferenceSession.create(modelPath, {
      executionProviders: ['cpu'],
      graphOptimizationLevel: 'all',
    });
  }
  
  // sharp로 이미지 처리
  const image = sharp(buffer);
  const metadata = await image.metadata();
  
  // 모델이 고정된 입력 크기(1024x1024)를 요구함
  const size = 1024;
  const resizedImage = await image
    .resize(size, size, { fit: 'cover', kernel: 'lanczos3' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data, info } = resizedImage;
  const channels = info.channels || 3;
  const pixelCount = size * size;
  const pixelStride = channels;

  // 텐서 생성
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
  const inputTensor = new ort.Tensor('float32', inputTensorData, [1, 3, size, size]);
  const feeds = { [bgRemoveSession.inputNames[0]]: inputTensor };
  const results = await bgRemoveSession.run(feeds);
  const outputTensor = results[bgRemoveSession.outputNames[0]];
  let maskData = outputTensor.data as Float32Array;

  // 마스크 후처리 (성능 최적화: 더 강한 threshold로 노이즈 제거)
  const threshold = 0.4; // threshold를 낮춰서 더 많은 배경 제거
  const gamma = 0.8; // gamma를 높여서 경계를 더 부드럽게
  const processedMask = new Float32Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    let value = Math.max(0, Math.min(1, maskData[i]));
    // threshold 적용 및 gamma 보정
    processedMask[i] = value < threshold ? 0 : Math.pow(value, gamma);
  }
  maskData = processedMask;

  // 원본 이미지 처리
  const originalRaw = await image
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  
  const originalWidth = originalRaw.info.width;
  const originalHeight = originalRaw.info.height;
  const originalPixels = originalRaw.data;
  const originalPixelCount = originalWidth * originalHeight;
  
  // 마스크 매핑
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
        maskAlpha = v11 * (1 - fx) * (1 - fy) + v21 * fx * (1 - fy) + v12 * (1 - fx) * fy + v22 * fx * fy;
      }
      
      const pixelIdx = (y * originalWidth + x) * 4;
      finalBuffer[pixelIdx + 0] = originalPixels[pixelIdx + 0];
      finalBuffer[pixelIdx + 1] = originalPixels[pixelIdx + 1];
      finalBuffer[pixelIdx + 2] = originalPixels[pixelIdx + 2];
      finalBuffer[pixelIdx + 3] = Math.round(Math.max(0, Math.min(255, maskAlpha * 255)));
    }
  }
  
  // Feathering (성능 최적화: 경계 영역만 처리)
  const featherRadius = 2;
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
  const finalImage = await sharp(finalBuffer, {
    raw: { width: originalWidth, height: originalHeight, channels: 4 },
  })
  .png({ 
    compressionLevel: 6, // 기본값 6 (0-9, 낮을수록 빠름)
    adaptiveFiltering: false // 성능 최적화
  })
  .toBuffer();
  
  return `data:image/png;base64,${finalImage.toString('base64')}`;
}

// 참조 포즈 설명 (토끼 포즈)
const REFERENCE_POSE_DESCRIPTIONS: Record<string, string> = {
  smile: '웃는 포즈: 입을 크게 벌리고 웃는 표정, 밝고 활기찬 느낌',
  point: '손가락 포인트: 오른팔을 옆으로 뻗어 손가락으로 가리키는 포즈',
  think: '생각하는 포즈: 오른손을 턱에 대고 생각에 잠긴 표정, 약간 고민스러운 표정',
  heart: '하트 포즈: 양손을 가슴 앞에서 모아 하트 모양을 만드는 포즈, 밝은 미소',
};

export async function POST(request: NextRequest) {
  try {
    // 사용자 세션 및 일일 제한 체크
    let cookieStore;
    let user = null;
    const supabase = await createClient();

    try {
      cookieStore = await cookies();
      const { data } = await supabase.auth.getUser();
      user = data.user;

      if (user) {
        // 회원: DB 기반 제한 체크
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('daily_generation_count, last_generation_date, subscription_tier, credits')
          .eq('id', user.id)
          .single();

        if (error) {
          console.error('[Server] Failed to fetch user profile:', error);
          // 프로필이 없으면 생성 (트리거가 있지만 안전장치)
          // 여기서는 일단 통과시키고 아래에서 업데이트 시도
        } else {
          const today = getTodayDateString();
          const lastDate = profile.last_generation_date;

          // 디버깅: 프로필 정보 로그
          console.log('[Server] User profile:', {
            subscription_tier: profile.subscription_tier,
            credits: profile.credits,
            daily_generation_count: profile.daily_generation_count,
            last_generation_date: profile.last_generation_date,
          });

          // 무료 회원 제한 체크
          if (profile.subscription_tier === 'free') {
            // 날짜가 바뀌었으면 카운트 리셋이 필요하므로 제한 체크 건너뜀 (아래 업데이트 로직에서 처리)
            // 오늘이고 무료 회원이면 카운트 체크
            if (lastDate === today && profile.daily_generation_count >= 1) {
              return NextResponse.json(
                {
                  error: '무료 회원은 하루에 1번만 포즈를 생성할 수 있습니다. 추가 생성을 위해 구독해주세요!',
                  code: 'FREE_USER_DAILY_LIMIT_EXCEEDED'
                },
                { status: 429 }
              );
            }
          } else if (profile.subscription_tier === 'paid') {
            // 유료 회원: credits 기반 제한 체크
            const credits = profile.credits || 0;
            if (credits <= 0) {
              return NextResponse.json(
                {
                  error: '사용 가능한 포즈 생성 횟수가 부족합니다. 추가 구매해주세요!',
                  code: 'PAID_USER_CREDITS_EXHAUSTED'
                },
                { status: 429 }
              );
            }
          }
          // subscription_tier가 null이거나 다른 값이면 무료 회원으로 간주하여 통과
        }
      } else {
        // 비회원: 항상 차단
        return NextResponse.json(
          {
            error: '비회원은 포즈를 생성할 수 없습니다. 회원가입 후 이용해주세요!',
            code: 'GUEST_NOT_ALLOWED'
          },
          { status: 401 }
        );
      }
    } catch (authError: any) {
      console.error('[Server] Auth check error:', authError);
      // 에러 발생 시 비회원으로 간주
      return NextResponse.json(
        {
          error: '비회원은 포즈를 생성할 수 없습니다. 회원가입 후 이용해주세요!',
          code: 'GUEST_NOT_ALLOWED'
        },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const personImage = formData.get('personImage') as File; // 생성 대상 인물 이미지
    const basePoseCollectionId = formData.get('basePoseCollectionId') as string | null; // 선택된 포즈 모음 ID

    if (!personImage) {
      return NextResponse.json(
        { error: '인물 이미지가 없습니다.' },
        { status: 400 }
      );
    }

    // 업로드한 인물 이미지를 Base64로 변환
    const arrayBuffer = await personImage.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64PersonImage = buffer.toString('base64');
    const personMimeType = personImage.type || 'image/jpeg';

    // 선택된 포즈 모음 가져오기 (없으면 기본 포즈 사용)
    let referencePosePaths: Array<{ id: string; path: string; name: string; url?: string }> = [];

    if (basePoseCollectionId) {
      // DB에서 선택된 포즈 모음 가져오기
      try {
        const { data: poses, error } = await supabase
          .from('poses')
          .select('id, name, image_url')
          .eq('collection_id', basePoseCollectionId)
          .order('sort_order', { ascending: true });

        if (error) throw error;

        if (poses && poses.length > 0) {
          // URL 기반 레퍼런스 포즈 사용
          referencePosePaths = poses.map((pose) => ({
            id: pose.id,
            path: '', // URL 사용 시 path는 빈 문자열
            name: pose.name,
            url: pose.image_url,
          }));
          console.log(`[Server] Using ${poses.length} reference poses from collection ${basePoseCollectionId}`);
        }
      } catch (error) {
        console.error('[Server] Failed to fetch pose collection:', error);
        // 에러 발생 시 기본 포즈로 폴백
      }
    }

    // 기본 포즈로 폴백 (DB 조회 실패 또는 ID 미제공 시)
    if (referencePosePaths.length === 0) {
      referencePosePaths = [
        { id: 'smile', path: path.join(process.cwd(), 'public', 'reference-poses', 'rabbit-smile.png'), name: '웃는 포즈' },
        { id: 'point', path: path.join(process.cwd(), 'public', 'reference-poses', 'rabbit-point.png'), name: '손가락 포인트' },
        { id: 'think', path: path.join(process.cwd(), 'public', 'reference-poses', 'rabbit-think.png'), name: '생각하는 포즈' },
        { id: 'heart', path: path.join(process.cwd(), 'public', 'reference-poses', 'rabbit-heart.png'), name: '하트 포즈' },
      ];
      console.log('[Server] Using default reference poses');
    }

    // 1단계: 레퍼런스 포즈 이미지를 하나로 합치기 (2x2 그리드)
    console.log('[Server] Step 1: Combining reference pose images into one');
    const referenceImages: Buffer[] = [];

    for (const refPose of referencePosePaths) {
      try {
        let imageBuffer: Buffer;

        if (refPose.url) {
          // URL에서 이미지 다운로드
          console.log(`[Server] Downloading reference pose from URL: ${refPose.url}`);
          const response = await fetch(refPose.url);
          if (!response.ok) {
            throw new Error(`Failed to fetch image from ${refPose.url}`);
          }
          const arrayBuffer = await response.arrayBuffer();
          imageBuffer = Buffer.from(arrayBuffer);
        } else {
          // 로컬 파일에서 읽기
          imageBuffer = await fs.readFile(refPose.path);
        }

        referenceImages.push(imageBuffer);
        console.log(`[Server] Loaded reference pose: ${refPose.name}`);
      } catch (error) {
        console.error(`[Server] Reference pose ${refPose.id} not found:`, error);
        return NextResponse.json(
          { error: `레퍼런스 포즈 이미지를 찾을 수 없습니다: ${refPose.name}` },
          { status: 500 }
        );
      }
    }

    // 각 이미지 크기 확인 및 통일
    const imageSize = 512; // 각 포즈 이미지 크기
    const resizedImages = await Promise.all(
      referenceImages.map(img => 
        sharp(img)
          .resize(imageSize, imageSize, { fit: 'cover', kernel: 'lanczos3' })
          .png()
          .toBuffer()
      )
    );

    // 2x2 그리드로 합치기
    const combinedWidth = imageSize * 2;
    const combinedHeight = imageSize * 2;
    
    const combinedImage = await sharp({
      create: {
        width: combinedWidth,
        height: combinedHeight,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 0 }, // 투명 배경
      },
    })
    .composite([
      { input: resizedImages[0], left: 0, top: 0 },           // Top-Left (smile)
      { input: resizedImages[1], left: imageSize, top: 0 },  // Top-Right (point)
      { input: resizedImages[2], left: 0, top: imageSize },  // Bottom-Left (think)
      { input: resizedImages[3], left: imageSize, top: imageSize }, // Bottom-Right (heart)
    ])
    .png()
    .toBuffer();

    const combinedImageBase64 = combinedImage.toString('base64');
    console.log('[Server] Combined reference poses image created');

    // 활성화된 프롬프트 템플릿 가져오기
    console.log('[Server] Step 1.5: Fetching active prompt template');
    let promptText = '첫 번째 이미지는 생성할 인물 사진이고, 두 번째 이미지는 2x2 그리드로 배치된 4가지 포즈 레퍼런스입니다. 인물 사진의 인물이 각 레퍼런스 포즈를 취하도록 4개의 포즈를 생성해주세요. 왼쪽 위부터 시계방향으로: 1) 웃는 포즈, 2) 손가락 포인트 포즈, 3) 생각하는 포즈, 4) 하트 포즈입니다. 인물의 얼굴과 신체 특징은 그대로 유지하면서 포즈만 레퍼런스와 동일하게 변경해주세요. 실물사진을 애니메이션화 하지 마세요. 배경은 투명하게 처리하고, 2x2 그리드 형태로 생성해주세요.';

    try {
      const { data: promptTemplate, error: promptError } = await supabase
        .from('prompt_templates')
        .select('template, variables')
        .eq('category', 'pose_generation')
        .eq('is_active', true)
        .single();

      if (!promptError && promptTemplate) {
        console.log('[Server] Using custom prompt template');

        // 포즈 설명 생성
        const poseDescriptions = referencePosePaths.map((pose, idx) =>
          `${idx + 1}) ${pose.name}`
        ).join(', ');

        // 변수 치환
        promptText = promptTemplate.template;
        const variables = promptTemplate.variables || [];

        // 기본 변수 값 설정
        const variableValues: Record<string, string> = {
          pose_count: referencePosePaths.length.toString(),
          pose_descriptions: `왼쪽 위부터 시계방향으로: ${poseDescriptions}입니다.`,
          style_instruction: '실물사진을 애니메이션화 하지 마세요.',
        };

        // 사용자 정의 기본값 적용
        variables.forEach((v: any) => {
          if (!variableValues[v.name] && v.default) {
            variableValues[v.name] = v.default;
          }
        });

        // 변수 치환
        Object.entries(variableValues).forEach(([key, value]) => {
          const regex = new RegExp(`{{${key}}}`, 'g');
          promptText = promptText.replace(regex, value);
        });

        console.log('[Server] Prompt after variable substitution:', promptText);
      } else {
        console.log('[Server] No active prompt template found, using default');
      }
    } catch (promptError) {
      console.error('[Server] Error fetching prompt template:', promptError);
      console.log('[Server] Using default prompt');
    }

    // 2단계: Gemini AI로 한번에 포즈 생성
    console.log('[Server] Step 2: Generating poses with single Gemini API call');
    const ai = new GoogleGenAI({
      apiKey: GEMINI_API_KEY,
    });

    let generatedCombinedImageDataUrl: string | null = null;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: [
          {
            text: promptText,
          },
          {
            inlineData: {
              data: base64PersonImage,
              mimeType: personMimeType,
            },
          },
          {
            inlineData: {
              data: combinedImageBase64,
              mimeType: 'image/png',
            },
          },
        ],
        config: {
          imageConfig: {
            aspectRatio: '1:1',
            imageSize: '2048x2048', // 2x2 그리드이므로 더 큰 크기
          },
        },
      });

      // 생성된 이미지 추출
      if (response.candidates && response.candidates.length > 0) {
        for (const candidate of response.candidates) {
          if (candidate.content && candidate.content.parts) {
            for (const part of candidate.content.parts) {
              if (part.inlineData && part.inlineData.data) {
                const imageData = part.inlineData.data;
                generatedCombinedImageDataUrl = `data:image/png;base64,${imageData}`;
                console.log('[Server] Combined poses image generated');
                break;
              }
            }
          }
          if (generatedCombinedImageDataUrl) break;
        }
      }

      if (!generatedCombinedImageDataUrl) {
        throw new Error('이미지 생성 실패');
      }

    } catch (error: any) {
      console.error('[Server] Error generating combined poses:', error);
      return NextResponse.json(
        { error: '포즈 생성 실패', details: error.message },
        { status: 500 }
      );
    }

    // 3단계: 생성된 이미지를 4개로 분리
    console.log('[Server] Step 3: Splitting generated image into 4 poses');
    const generatedPoses: Array<{ poseId: string; name: string; image: string }> = [];
    
    const base64Data = generatedCombinedImageDataUrl.split(',')[1];
    const generatedBuffer = Buffer.from(base64Data, 'base64');
    const generatedImage = sharp(generatedBuffer);
    const generatedMetadata = await generatedImage.metadata();
    
    const generatedWidth = generatedMetadata.width || 2048;
    const generatedHeight = generatedMetadata.height || 2048;
    const panelWidth = Math.floor(generatedWidth / 2);
    const panelHeight = Math.floor(generatedHeight / 2);

    // 4개 패널 추출
    for (let i = 0; i < 4; i++) {
      const row = Math.floor(i / 2);
      const col = i % 2;
      const x = col * panelWidth;
      const y = row * panelHeight;
      
      const lastPanelWidth = generatedWidth - panelWidth;
      const lastPanelHeight = generatedHeight - panelHeight;
      const extractWidth = col === 1 ? lastPanelWidth : panelWidth;
      const extractHeight = row === 1 ? lastPanelHeight : panelHeight;

      const refPose = referencePosePaths[i];
      
      try {
        const panelBuffer = await generatedImage
          .clone()
          .extract({
            left: x,
            top: y,
            width: extractWidth,
            height: extractHeight,
          })
          .png()
          .toBuffer();

        const panelBase64 = panelBuffer.toString('base64');
        const panelDataUrl = `data:image/png;base64,${panelBase64}`;

        // 4단계: 배경 제거 적용
        console.log(`[Server] Step 4: Removing background for pose ${refPose.id}`);
        const imageWithoutBg = await removeBackgroundFromImage(panelDataUrl);

        generatedPoses.push({
          poseId: refPose.id,
          name: refPose.name,
          image: imageWithoutBg,
        });

      } catch (error: any) {
        console.error(`[Server] Error processing pose ${refPose.id}:`, error);
        // 에러 발생 시 원본 인물 이미지 사용 (폴백)
        generatedPoses.push({
          poseId: refPose.id,
          name: refPose.name,
          image: `data:${personMimeType};base64,${base64PersonImage}`,
        });
      }
    }

    // 성공 응답 반환 전에 생성 기록 저장
    if (user) {
      // 회원: DB 업데이트
      const today = getTodayDateString();

      // 먼저 현재 상태 조회 (동시성 문제가 있을 수 있으나 간단하게 처리)
      const { data: currentProfile } = await supabase
        .from('profiles')
        .select('daily_generation_count, last_generation_date, subscription_tier, credits')
        .eq('id', user.id)
        .single();

      if (currentProfile) {
        if (currentProfile.subscription_tier === 'paid') {
          // 유료 회원: credits 차감
          const newCredits = (currentProfile.credits || 0) - 1;

          const { error: updateError } = await supabase
            .from('profiles')
            .update({ credits: newCredits })
            .eq('id', user.id);

          if (updateError) {
            console.error('[Server] Failed to update user credits:', updateError);
          }
        } else {
          // 무료 회원 또는 subscription_tier가 null: 일일 카운트 증가
          let newCount = 1;
          if (currentProfile.last_generation_date === today) {
            newCount = currentProfile.daily_generation_count + 1;
          }

          const { error: updateError } = await supabase
            .from('profiles')
            .update({
              daily_generation_count: newCount,
              last_generation_date: today
            })
            .eq('id', user.id);

          if (updateError) {
            console.error('[Server] Failed to update user profile:', updateError);
          }
        }
      }
    }

    // 성공 응답 반환 (200)
    return NextResponse.json({
      success: true,
      poses: generatedPoses,
      message: `${generatedPoses.length}개 포즈 생성 및 배경 제거 완료`,
    }, { status: 200 });

  } catch (error: any) {
    console.error('[Server] Pose generation error:', error);
    return NextResponse.json(
      { error: '포즈 생성 중 오류가 발생했습니다.', details: error.message },
      { status: 500 }
    );
  }
}
