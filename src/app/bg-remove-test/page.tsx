'use client';

import React, { useEffect, useRef, useState } from 'react';
import Webcam from 'react-webcam';
import { Loader2, Camera, X, Download, Upload, Grid, ChevronDown, Plus } from 'lucide-react';

// 타입 정의
type SelfieSegmentationType = any;
type CameraType = any;

// 배경 옵션 타입 정의
type BgOption = {
  id: string;
  label: string;
  type: 'color' | 'gradient' | 'image';
  value: string;
};

// 포즈 모음 타입 정의
type PoseCollection = {
  id: string;
  name: string;
  poseCount: number;
  isDefault: boolean;
};

// 배경 옵션 목록
const BG_OPTIONS: BgOption[] = [
  { id: 'transparent', label: '투명 (기본)', type: 'image', value: 'transparent' },
  { id: 'white', label: '화이트', type: 'color', value: '#ffffff' },
  { id: 'gray', label: '그레이', type: 'color', value: '#f3f4f6' },
  { id: 'pink', label: '핑크', type: 'color', value: '#fce7f3' },
  { id: 'blue', label: '블루', type: 'color', value: '#dbeafe' },
  { id: 'gradient-1', label: '네온 핑크', type: 'gradient', value: 'linear-gradient(to right, #ec4899, #8b5cf6)' },
  { id: 'gradient-2', label: '오션 블루', type: 'gradient', value: 'linear-gradient(to right, #06b6d4, #3b82f6)' },
  { id: 'gradient-3', label: '선셋', type: 'gradient', value: 'linear-gradient(to right, #f97316, #e11d48)' },
  { id: 'chroma', label: '크로마키 (그린)', type: 'color', value: '#00ff00' },
];

// 기본 포즈 모음 목록 (표시용, 클릭 이벤트 없음)
const DEFAULT_POSE_COLLECTIONS: PoseCollection[] = [
  { id: 'default-1', name: '기본 포즈 모음', poseCount: 12, isDefault: true },
  { id: 'default-2', name: '셀카 포즈', poseCount: 8, isDefault: true },
  { id: 'default-3', name: '전신 포즈', poseCount: 10, isDefault: true },
  { id: 'default-4', name: '프로필 포즈', poseCount: 6, isDefault: true },
];

export default function BgRemoveTestPage() {
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [selectedBg, setSelectedBg] = useState<BgOption>(BG_OPTIONS[0]);

  // 고화질 처리 상태 관리
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const [isProcessingHQ, setIsProcessingHQ] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');

  // 패널 분할 상태 관리
  const [processedPanels, setProcessedPanels] = useState<Array<{index: number, image: string, filename: string}>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 포즈 모음 관련 상태 관리
  const [isPoseDropdownOpen, setIsPoseDropdownOpen] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [hasAcceptedTerms, setHasAcceptedTerms] = useState(false);
  
  // 움직임 감지를 위한 Refs
  const lastFrameDataRef = useRef<Uint8ClampedArray | null>(null);
  const skipCountRef = useRef(0);
  const analysisCanvasRef = useRef<HTMLCanvasElement | null>(null);
  
  // 움직임 감지 설정
  const MOTION_THRESHOLD = 30; 
  const MAX_SKIP_FRAMES = 3;   

  const processPanels = async (file: File) => {
    setProcessedPanels([]);
    setProcessedImage(null);
    setIsProcessingHQ(true);
    setProgressMsg('4개 패널 분할 및 배경 제거 처리 중...');
    
    const startTime = performance.now();
    console.log(`[Performance] Start panel splitting and background removal`);

    try {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('splitPanels', 'true');
      
      const apiStart = performance.now();
      const apiResponse = await fetch('/api/remove-background', {
        method: 'POST',
        body: formData,
      });
      
      if (!apiResponse.ok) {
        const errorData = await apiResponse.json();
        const errorMessage = errorData.details 
          ? `${errorData.error}\n상세: ${errorData.details}`
          : errorData.error || '서버 처리 중 오류가 발생했습니다.';
        throw new Error(errorMessage);
      }
      
      const result = await apiResponse.json();
      const apiEnd = performance.now();
      
      console.log(`[Performance] Panel processing time: ${(apiEnd - apiStart).toFixed(2)}ms`);
      console.log(`[Performance] Processed ${result.panels.length} panels`);
      
      setProcessedPanels(result.panels);
      
      const totalTime = performance.now() - startTime;
      console.log(`[Performance] Total time: ${totalTime.toFixed(2)}ms`);
      setProgressMsg(`완료! ${result.panels.length}개 패널 처리됨 (${(totalTime/1000).toFixed(1)}s)`);
      
    } catch (error: any) {
      console.error('Panel processing error:', error);
      alert(`처리 중 오류가 발생했습니다: ${error.message}`);
    } finally {
      setIsProcessingHQ(false);
      if (processedPanels.length === 0) setProgressMsg('');
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('이미지 파일만 업로드 가능합니다.');
      return;
    }

    await processPanels(file);
  };

  // 포즈 모음 드롭다운 토글
  const togglePoseDropdown = () => {
    setIsPoseDropdownOpen(!isPoseDropdownOpen);
  };

  // 새 모음 추가 버튼 클릭
  const handleAddNewCollection = () => {
    if (!hasAcceptedTerms) {
      setShowTermsModal(true);
    } else {
      // 이용 약관에 이미 동의한 경우 바로 실행
      console.log('새 포즈 모음 추가 로직 실행');
      alert('새 포즈 모음을 추가합니다.');
    }
  };

  // 이용 약관 동의
  const handleAcceptTerms = () => {
    setHasAcceptedTerms(true);
    setShowTermsModal(false);
    console.log('이용 약관 동의 완료');
    alert('새 포즈 모음을 추가합니다.');
  };

  const takeHighQualityPhoto = async () => {
    if (!webcamRef.current) return;
    const imageSrc = webcamRef.current.getScreenshot();
    if (!imageSrc) return;

    setCapturedImage(imageSrc);
    setProcessedImage(null);
    setIsProcessingHQ(true);
    setProgressMsg('서버로 이미지 전송 중...');
    
    const startTime = performance.now();
    console.log(`[Performance] Start server-side processing using RMBG-1.4 Quantized (INT8)`);

    try {
      // Base64 데이터 URL을 Blob으로 변환
      // data:image/jpeg;base64, 또는 data:image/png;base64, 형식 처리
      const [header, base64Data] = imageSrc.split(',');
      const mimeMatch = header.match(/data:image\/(\w+);base64/);
      const imageType = mimeMatch ? mimeMatch[1] : 'jpeg'; // 기본값: jpeg
      
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: `image/${imageType}` });
      
      console.log(`[Client] Image type detected: ${imageType}, size: ${byteArray.length} bytes`);
      
      // FormData 생성
      const formData = new FormData();
      formData.append('image', blob, 'photo.jpg');
      
      setProgressMsg('서버에서 AI 처리 중... (GPU 가속)');
      
      // API 호출
      const apiStart = performance.now();
      const apiResponse = await fetch('/api/remove-background', {
        method: 'POST',
        body: formData,
      });
      
      if (!apiResponse.ok) {
        const errorData = await apiResponse.json();
        const errorMessage = errorData.details 
          ? `${errorData.error}\n상세: ${errorData.details}`
          : errorData.error || '서버 처리 중 오류가 발생했습니다.';
        throw new Error(errorMessage);
      }
      
      const result = await apiResponse.json();
      const apiEnd = performance.now();
      
      console.log(`[Performance] API Call Time: ${(apiEnd - apiStart).toFixed(2)}ms`);
      console.log(`[Performance] Server Inference Time: ${result.inferenceTime}ms`);
      console.log(`[Performance] Total Server Processing: ${result.message}`);
      
      setProcessedImage(result.image);
      
      const totalTime = performance.now() - startTime;
      console.log(`[Performance] Total Client Time: ${totalTime.toFixed(2)}ms`);
      setProgressMsg(`완료! (서버 추론: ${result.inferenceTime}ms, 전체: ${(totalTime/1000).toFixed(1)}s)`);
      
    } catch (error: any) {
      console.error('Server-side processing error:', error);
      alert(`처리 중 오류가 발생했습니다: ${error.message}`);
    } finally {
      setIsProcessingHQ(false);
      if (!processedImage) setProgressMsg('');
    }
  };

  useEffect(() => {
    let camera: CameraType | null = null;
    let selfieSegmentation: SelfieSegmentationType | null = null;
    
    if (!analysisCanvasRef.current) {
      analysisCanvasRef.current = document.createElement('canvas');
      analysisCanvasRef.current.width = 64;
      analysisCanvasRef.current.height = 48;
    }

    const checkMotion = (video: HTMLVideoElement) => {
      const analysisCtx = analysisCanvasRef.current?.getContext('2d');
      if (!analysisCtx || !analysisCanvasRef.current) return false;

      analysisCtx.drawImage(video, 0, 0, analysisCanvasRef.current.width, analysisCanvasRef.current.height);
      const imageData = analysisCtx.getImageData(0, 0, analysisCanvasRef.current.width, analysisCanvasRef.current.height);
      const data = imageData.data;

      if (!lastFrameDataRef.current) {
        lastFrameDataRef.current = data;
        return false;
      }

      let totalDiff = 0;
      const pixelCount = data.length / 4;
      
      for (let i = 0; i < data.length; i += 4) {
        const rDiff = Math.abs(data[i] - lastFrameDataRef.current[i]);
        const gDiff = Math.abs(data[i + 1] - lastFrameDataRef.current[i + 1]);
        const bDiff = Math.abs(data[i + 2] - lastFrameDataRef.current[i + 2]);
        totalDiff += (rDiff + gDiff + bDiff) / 3;
      }

      const avgDiff = totalDiff / pixelCount;
      lastFrameDataRef.current = data;

      return avgDiff > MOTION_THRESHOLD;
    };

    const init = async () => {
      if (typeof window === 'undefined') return;

      const { SelfieSegmentation } = await import('@mediapipe/selfie_segmentation');
      const { Camera } = await import('@mediapipe/camera_utils');

      selfieSegmentation = new SelfieSegmentation({
        locateFile: (file: string) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`;
        },
      });

      selfieSegmentation.setOptions({
        modelSelection: 1,
      });

      selfieSegmentation.onResults((results: any) => {
        setIsModelLoaded(true);
        const canvas = canvasRef.current;
        
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.save();
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.filter = 'blur(4px)'; 
        ctx.drawImage(results.segmentationMask, 0, 0, canvas.width, canvas.height);
        
        ctx.globalCompositeOperation = 'source-over';
        for(let i=0; i<3; i++) {
            ctx.drawImage(results.segmentationMask, 0, 0, canvas.width, canvas.height);
        }

        ctx.filter = 'none';
        ctx.globalCompositeOperation = 'source-in';
        ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
        ctx.restore();
      });
      
      setTimeout(() => {
        if (webcamRef.current && webcamRef.current.video) {
          camera = new Camera(webcamRef.current.video, {
            onFrame: async () => {
              if (webcamRef.current?.video && selfieSegmentation) {
                const video = webcamRef.current.video;
                const isHighMotion = checkMotion(video);
                if (isHighMotion && skipCountRef.current < MAX_SKIP_FRAMES) {
                  skipCountRef.current++;
                  return;
                }
                skipCountRef.current = 0;
                await selfieSegmentation.send({ image: video });
              }
            },
            width: 1280,
            height: 720,
          });
          camera.start();
        }
      }, 1000);
    };

    init();

    return () => {
      if (camera) camera.stop();
      if (selfieSegmentation) selfieSegmentation.close();
    };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
      <h1 className="text-2xl font-bold mb-4">실시간 배경 제거 테스트 (MediaPipe + ONNX HQ)</h1>
      
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative border-2 border-red-500">
          <span className="absolute top-2 left-2 bg-red-500 text-white px-2 py-1 text-xs z-10">Original</span>
          <Webcam
            ref={webcamRef}
            className="w-[480px]"
            mirrored
            onUserMedia={() => setIsModelLoaded(false)}
          />
        </div>

        <div className="relative border-2 border-blue-500 overflow-hidden">
           <div 
             className="absolute inset-0 z-0"
             style={{
               backgroundImage: selectedBg.id === 'transparent' 
                 ? `linear-gradient(45deg, #e5e7eb 25%, transparent 25%), linear-gradient(-45deg, #e5e7eb 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e5e7eb 75%), linear-gradient(-45deg, transparent 75%, #e5e7eb 75%)` 
                 : selectedBg.type === 'gradient' ? selectedBg.value : 'none',
               backgroundColor: selectedBg.type === 'color' ? selectedBg.value : (selectedBg.id === 'transparent' ? 'white' : 'transparent'),
               backgroundSize: selectedBg.id === 'transparent' ? '20px 20px' : 'cover',
               backgroundPosition: selectedBg.id === 'transparent' ? '0 0, 0 10px, 10px -10px, -10px 0px' : 'center'
             }}
           />
           
           <span className="absolute top-2 left-2 bg-blue-500 text-white px-2 py-1 text-xs z-20">AI Result</span>
           {!isModelLoaded && (
             <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white z-30">
               Loading AI Model...
             </div>
           )}
           <canvas
             ref={canvasRef}
             className="w-[480px] h-[360px] relative z-10"
             width={1280}
             height={720}
             style={{ transform: 'scaleX(-1)' }}
           />
        </div>
      </div>

      <div className="mt-6 bg-white p-4 rounded-xl shadow-md w-full max-w-3xl">
        <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-bold text-gray-800">배경 선택</h2>
            <div className="flex gap-2">
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                />
                <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isProcessingHQ}
                    className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                    {isProcessingHQ ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            {progressMsg || '처리 중...'}
                        </>
                    ) : (
                        <>
                            <Grid className="w-4 h-4" />
                            4패널 분할 처리
                        </>
                    )}
                </button>
                <button
                    onClick={takeHighQualityPhoto}
                    disabled={isProcessingHQ}
                    className="flex items-center gap-2 bg-black text-white px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
                >
                    {isProcessingHQ ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            {progressMsg || '처리 중...'}
                        </>
                    ) : (
                        <>
                            <Camera className="w-4 h-4" />
                            고화질 촬영 (AI Matting)
                        </>
                    )}
                </button>
            </div>
        </div>
        <div className="flex flex-wrap gap-3">
          {BG_OPTIONS.map((bg) => (
            <button
              key={bg.id}
              onClick={() => setSelectedBg(bg)}
              className={`
                px-4 py-2 rounded-lg text-sm font-medium transition-all border-2
                ${selectedBg.id === bg.id ? 'border-blue-500 shadow-md scale-105' : 'border-gray-200 hover:border-gray-300'}
              `}
              style={{
                background: bg.id === 'transparent' ? '#fff' : bg.value,
                color: bg.type === 'color' && ['white', 'gray', 'pink', 'blue'].includes(bg.id) ? 'black' : 'white',
                textShadow: bg.type === 'gradient' ? '0 1px 2px rgba(0,0,0,0.3)' : 'none'
              }}
            >
              {bg.label}
            </button>
          ))}
        </div>
      </div>

      {/* 포즈 모음 선택 섹션 */}
      <div className="mt-6 bg-white p-4 rounded-xl shadow-md w-full max-w-3xl">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-lg font-bold text-gray-800">포즈 모음</h2>
        </div>

        <div className="relative">
          {/* 포즈 모음 선택 드롭다운 버튼 */}
          <button
            onClick={togglePoseDropdown}
            className="w-full flex items-center justify-between bg-gray-50 border-2 border-gray-200 rounded-lg px-4 py-3 hover:border-gray-300 transition-colors"
          >
            <span className="text-gray-700 font-medium">포즈 모음 선택</span>
            <ChevronDown className={`w-5 h-5 text-gray-500 transition-transform ${isPoseDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* 드롭다운 메뉴 */}
          {isPoseDropdownOpen && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white border-2 border-gray-200 rounded-lg shadow-lg z-10 overflow-hidden">
              {/* 기본 포즈 모음 (표시만, 클릭 이벤트 없음) */}
              <div className="p-2">
                <div className="text-xs font-semibold text-gray-400 px-3 py-2">기본 포즈 모음</div>
                {DEFAULT_POSE_COLLECTIONS.map((collection) => (
                  <div
                    key={collection.id}
                    className="px-4 py-3 hover:bg-gray-50 rounded-md cursor-default"
                  >
                    <div className="font-medium text-gray-700">{collection.name}</div>
                    <div className="text-sm text-gray-500">{collection.poseCount}개 포즈</div>
                  </div>
                ))}
              </div>

              {/* 새 모음 추가 버튼 */}
              <div className="border-t border-gray-200 p-2">
                <button
                  onClick={handleAddNewCollection}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-50 hover:bg-blue-100 rounded-md text-blue-600 font-medium transition-colors"
                >
                  <Plus className="w-5 h-5" />
                  새 모음 추가
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 이용 약관 모달 */}
      {showTermsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl">
            <div className="p-6 border-b">
              <h3 className="text-2xl font-bold text-gray-800">이용 약관 및 동의</h3>
            </div>

            <div className="p-6 max-h-96 overflow-y-auto bg-gray-50">
              <div className="space-y-4 text-gray-700">
                <div>
                  <h4 className="font-bold text-lg mb-2">1. 서비스 이용 약관</h4>
                  <p className="text-sm leading-relaxed">
                    본 서비스는 사용자가 포즈 모음을 생성하고 관리할 수 있는 기능을 제공합니다.
                    사용자는 본 약관에 동의함으로써 서비스 이용에 대한 권리와 의무를 승인합니다.
                  </p>
                </div>

                <div>
                  <h4 className="font-bold text-lg mb-2">2. 개인정보 처리방침</h4>
                  <p className="text-sm leading-relaxed">
                    업로드된 이미지와 포즈 데이터는 사용자의 계정에 안전하게 저장되며,
                    제3자와 공유되지 않습니다. 사용자는 언제든지 자신의 데이터를 삭제할 수 있습니다.
                  </p>
                </div>

                <div>
                  <h4 className="font-bold text-lg mb-2">3. 콘텐츠 저작권</h4>
                  <p className="text-sm leading-relaxed">
                    사용자가 업로드하는 모든 콘텐츠에 대한 저작권은 사용자에게 있으며,
                    서비스 제공자는 서비스 운영 목적으로만 해당 콘텐츠를 사용할 수 있습니다.
                  </p>
                </div>

                <div>
                  <h4 className="font-bold text-lg mb-2">4. 책임의 제한</h4>
                  <p className="text-sm leading-relaxed">
                    서비스 제공자는 사용자의 부주의로 인한 데이터 손실이나
                    서비스 이용 중 발생하는 간접적 손해에 대해 책임을 지지 않습니다.
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6 border-t bg-white flex justify-end gap-3">
              <button
                onClick={() => setShowTermsModal(false)}
                className="px-6 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors font-medium"
              >
                취소
              </button>
              <button
                onClick={handleAcceptTerms}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                동의하고 계속하기
              </button>
            </div>
          </div>
        </div>
      )}

      {processedPanels.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
            <div className="bg-white rounded-2xl max-w-6xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
                <div className="p-4 border-b flex justify-between items-center">
                    <h3 className="text-xl font-bold">4개 패널 배경 제거 결과</h3>
                    <button onClick={() => setProcessedPanels([])} className="p-2 hover:bg-gray-100 rounded-full">
                        <X className="w-6 h-6" />
                    </button>
                </div>
                <div className="flex-1 overflow-auto p-6 bg-gray-100">
                    <div className="grid grid-cols-2 gap-4">
                        {processedPanels.map((panel) => (
                            <div key={panel.index} className="flex flex-col gap-2">
                                <span className="font-medium text-blue-600 text-center">패널 {panel.index}</span>
                                <div 
                                    className="relative rounded-lg border shadow-sm overflow-hidden mx-auto"
                                    style={{
                                        backgroundImage: `conic-gradient(#f3f4f6 25%, #ffffff 0, #ffffff 50%, #f3f4f6 0, #f3f4f6 75%, #ffffff 0)`,
                                        backgroundSize: '20px 20px'
                                    }}
                                >
                                    <img 
                                        src={panel.image} 
                                        alt={`Panel ${panel.index}`} 
                                        className="relative z-10 max-w-full h-auto"
                                    />
                                </div>
                                <a 
                                    href={panel.image} 
                                    download={panel.filename}
                                    className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                                >
                                    <Download className="w-4 h-4" />
                                    다운로드
                                </a>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="p-4 border-t bg-gray-50 flex justify-end gap-3">
                    <button 
                        onClick={() => setProcessedPanels([])} 
                        className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
                    >
                        닫기
                    </button>
                </div>
            </div>
        </div>
      )}

      {processedImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
            <div className="bg-white rounded-2xl max-w-4xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
                <div className="p-4 border-b flex justify-between items-center">
                    <h3 className="text-xl font-bold">고화질 AI 매팅 결과</h3>
                    <button onClick={() => setProcessedImage(null)} className="p-2 hover:bg-gray-100 rounded-full">
                        <X className="w-6 h-6" />
                    </button>
                </div>
                <div className="flex-1 overflow-auto p-6 bg-gray-100 grid grid-cols-1 md:grid-cols-2 gap-6 place-items-center">
                    <div className="flex flex-col gap-2 text-center">
                        <span className="font-medium text-gray-500">원본</span>
                        {capturedImage && <img src={capturedImage} alt="Original" className="rounded-lg border shadow-sm max-w-full h-auto" />}
                    </div>
                    <div className="flex flex-col gap-2 text-center">
                        <span className="font-medium text-blue-600">AI 결과 (RMBG-1.4 Quantized)</span>
                        <div 
                          className="relative rounded-lg border shadow-sm overflow-hidden"
                          style={{
                            backgroundImage: `conic-gradient(#f3f4f6 25%, #ffffff 0, #ffffff 50%, #f3f4f6 0, #f3f4f6 75%, #ffffff 0)`,
                            backgroundSize: '20px 20px'
                          }}
                        >
                            <img src={processedImage} alt="Processed" className="relative z-10 max-w-full h-auto" />
                        </div>
                    </div>
                </div>
                <div className="p-4 border-t bg-gray-50 flex justify-end gap-3">
                    <button onClick={() => setProcessedImage(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors">
                        닫기
                    </button>
                    <a 
                        href={processedImage} 
                        download="ai-matting-result.png"
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        <Download className="w-4 h-4" />
                        이미지 저장
                    </a>
                </div>
            </div>
        </div>
      )}

      <p className="mt-4 text-gray-600 max-w-lg text-center">
        오른쪽 화면에 배경이 제거된 모습이 나와야 합니다.<br/>
        (체커보드 패턴이나 배경색이 뒤에 보인다면 투명 처리가 성공한 것입니다.)
      </p>
    </div>
  );
}