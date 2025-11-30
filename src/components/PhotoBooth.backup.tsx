'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';
import { Camera, Download, RefreshCcw, Sparkles, Check, Layout, Wand2 } from 'lucide-react';
import * as htmlToImage from 'html-to-image'; // html-to-image 사용
import { useTheme, ThemeType } from '@/context/ThemeContext';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import * as gtag from '@/components/GoogleAnalytics'; // GA 이벤트 추적 추가

type PhotoStatus = 'idle' | 'countdown' | 'capturing' | 'finished';
type LayoutType = 'grid4' | 'vertical4' | 'single1';
type FilterType = 'normal' | 'soft' | 'vivid' | 'bw' | 'vintage';

const COUNTDOWN_SECONDS = 3;

// 유틸리티 함수: 클래스 병합
function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

// 필터 옵션 정의
const FILTERS: { id: FilterType; label: string; style: React.CSSProperties }[] = [
  { id: 'normal', label: 'Original', style: {} },
  { id: 'soft', label: 'Soft', style: { filter: 'brightness(1.1) contrast(0.95) saturate(0.9)' } }, // 뽀샤시
  { id: 'vivid', label: 'Vivid', style: { filter: 'contrast(1.1) saturate(1.2)' } }, // 쨍함
  { id: 'bw', label: 'B&W', style: { filter: 'grayscale(100%) contrast(1.2)' } }, // 흑백
  { id: 'vintage', label: 'Vintage', style: { filter: 'sepia(0.4) contrast(1.1) brightness(0.9)' } }, // 빈티지
];

// 레이아웃 옵션 정의
const LAYOUTS: { id: LayoutType; label: string; shots: number; cols: number; ratio: string }[] = [
  { id: 'grid4', label: '4컷 (Standard)', shots: 4, cols: 2, ratio: 'aspect-[3/4]' },
  { id: 'vertical4', label: '4컷 (Half)', shots: 4, cols: 1, ratio: 'aspect-[3/2]' },
  { id: 'single1', label: '1컷 (Profile)', shots: 1, cols: 1, ratio: 'aspect-[3/4]' },
];

// 프레임 타입 정의
type FrameOption = {
  id: string;
  label: string;
  bg: string;
  border: string;
  text: string;
  style?: React.CSSProperties;
};

// 테마별 프레임 옵션 정의
const THEME_FRAMES: Record<ThemeType, FrameOption[]> = {
  simple: [
    { id: 'white', label: 'White', bg: 'bg-white', border: 'border-gray-200', text: 'text-gray-900' },
    { id: 'black', label: 'Black', bg: 'bg-black', border: 'border-gray-800', text: 'text-white' },
    { id: 'beige', label: 'Beige', bg: 'bg-[#f5f5dc]', border: 'border-[#e8e8c8]', text: 'text-[#5c5c3d]' },
  ],
  neon: [
    { id: 'cyan', label: 'Cyan', bg: 'bg-black', border: 'border-[#0ff] shadow-[0_0_20px_#0ff]', text: 'text-[#0ff]' },
    { id: 'magenta', label: 'Magenta', bg: 'bg-black', border: 'border-[#f0f] shadow-[0_0_20px_#f0f]', text: 'text-[#f0f]' },
    { id: 'green', label: 'Green', bg: 'bg-black', border: 'border-[#0f0] shadow-[0_0_20px_#0f0]', text: 'text-[#0f0]' },
  ],
  kitsch: [
    { id: 'pink', label: 'Pink', bg: 'bg-[#ffcce6]', border: 'border-[#ff1493]', text: 'text-[#ff1493]' },
    { id: 'check', label: 'Check', bg: 'bg-white', border: 'border-black', text: 'text-black', style: { backgroundImage: 'linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%, #ccc), linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%, #ccc)', backgroundSize: '20px 20px', backgroundPosition: '0 0, 10px 10px' } },
    { id: 'gradient', label: 'Retro', bg: 'bg-gradient-to-br from-yellow-200 to-pink-300', border: 'border-white shadow-lg', text: 'text-white drop-shadow-md' },
  ]
};

export default function PhotoBooth() {
  const { theme, setTheme } = useTheme();
  const webcamRef = useRef<Webcam>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  
  const [status, setStatus] = useState<PhotoStatus>('idle');
  const [images, setImages] = useState<string[]>([]);
  const [countdown, setCountdown] = useState<number>(COUNTDOWN_SECONDS);
  const [currentShot, setCurrentShot] = useState<number>(0);
  const [flash, setFlash] = useState(false);
  const [isMockMode, setIsMockMode] = useState(false); 
  
  const [selectedFrameIndex, setSelectedFrameIndex] = useState(0);
  const [selectedLayout, setSelectedLayout] = useState<LayoutType>('grid4');
  const [selectedFilter, setSelectedFilter] = useState<FilterType>('normal');
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const startTimeRef = useRef<number>(Date.now()); // 체류 시간 측정용

  const isCapturingRef = useRef(false); // 중복 촬영 방지용 Ref

  // GA: 프레임 선택 이벤트
  const handleFrameSelect = (idx: number) => {
    setSelectedFrameIndex(idx);
    const frame = THEME_FRAMES[theme][idx];
    gtag.event({
      action: 'select_frame',
      category: 'Customization',
      label: `${theme}_${frame.id}`,
    });
  };

  // GA: 레이아웃 선택 이벤트
  const handleLayoutSelect = (layoutId: LayoutType) => {
    setSelectedLayout(layoutId);
    gtag.event({
      action: 'select_layout',
      category: 'Customization',
      label: layoutId,
    });
  };

  // GA: 필터 선택 이벤트
  const handleFilterSelect = (filterId: FilterType) => {
    setSelectedFilter(filterId);
    gtag.event({
      action: 'select_filter',
      category: 'Customization',
      label: filterId,
    });
  };

  // GA: 체류 시간 추적 (언마운트 시)
  useEffect(() => {
    return () => {
      const duration = (Date.now() - startTimeRef.current) / 1000 / 60; // 분 단위
      gtag.event({
        action: 'stay_duration',
        category: 'Engagement',
        value: Math.round(duration * 10) / 10, // 소수점 첫째 자리까지
      });
    };
  }, []);

  // 현재 레이아웃 설정 가져오기
  const currentLayout = LAYOUTS.find(l => l.id === selectedLayout) || LAYOUTS[0];
  const captureCount = currentLayout.shots;

  useEffect(() => {
    setSelectedFrameIndex(0);
  }, [theme]);

  // 페이지 로드 시 카메라 권한 미리 요청 (사용자 경험 개선)
  useEffect(() => {
    const requestPermission = async () => {
      try {
        // 권한 요청
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        // 권한 획득 후 즉시 트랙 정지하여 리소스 사용 중단
        stream.getTracks().forEach(track => track.stop());
      } catch (err) {
        console.log("Camera permission not granted yet or denied:", err);
      }
    };

    requestPermission();
  }, []);

  // 레이아웃 변경 시 리셋
  useEffect(() => {
    reset();
  }, [selectedLayout]);

  // 스트림 정리
  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [cameraStream]);

  const currentFrameStyle = THEME_FRAMES[theme][selectedFrameIndex];
  const currentFilterStyle = FILTERS.find(f => f.id === selectedFilter)?.style || {};

  // 목업 이미지 생성
  const getMockImage = useCallback((count: number) => {
    const canvas = document.createElement('canvas');
    canvas.width = 720;
    canvas.height = 960;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      if (theme === 'simple') {
        const grayLevel = 240 - (count * 20);
        ctx.fillStyle = `rgb(${grayLevel}, ${grayLevel}, ${grayLevel})`;
      } else if (theme === 'neon') {
        ctx.fillStyle = '#111';
      } else {
        const hue = Math.floor(Math.random() * 360);
        ctx.fillStyle = `hsl(${hue}, 100%, 85%)`;
      }
      
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 80px sans-serif';

      if (theme === 'simple') {
        ctx.fillStyle = '#333';
      } else if (theme === 'neon') {
        if (selectedFrameIndex === 1) {
            ctx.fillStyle = '#f0f';
            ctx.shadowColor = '#f0f';
        } else if (selectedFrameIndex === 2) {
            ctx.fillStyle = '#0f0';
            ctx.shadowColor = '#0f0';
        } else {
            ctx.fillStyle = '#0ff';
            ctx.shadowColor = '#0ff';
        }
        ctx.shadowBlur = 20;
      } else {
        ctx.fillStyle = '#ff1493';
      }

      ctx.fillText(`SHOT #${count + 1}`, canvas.width / 2, canvas.height / 2);
      
      if (theme === 'kitsch') {
        ctx.font = '40px sans-serif';
        ctx.fillText('KITSCH SNAP', canvas.width / 2, canvas.height / 2 + 80);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 10;
        ctx.strokeRect(50, 50, canvas.width - 100, canvas.height - 100);
      }
    }
    return canvas.toDataURL('image/jpeg');
  }, [theme, selectedFrameIndex]);

  const startPhotoSession = () => {
    gtag.event({
      action: 'start_session',
      category: 'Interaction',
      label: theme,
    });
    setImages([]);
    setCurrentShot(0);
    setStatus('countdown');
    setCountdown(COUNTDOWN_SECONDS);
    isCapturingRef.current = false;
  };

  const capture = useCallback(() => {
    // 중복 촬영 방지 (Ref 사용으로 즉시 차단)
    if (isCapturingRef.current) return;
    isCapturingRef.current = true;

    let imageSrc = null;
    
    if (isMockMode) {
      imageSrc = getMockImage(currentShot);
    } else {
      imageSrc = webcamRef.current?.getScreenshot();
    }

    if (imageSrc) {
      setStatus('capturing');
      setFlash(true);
      setTimeout(() => setFlash(false), 150);
      setImages((prev) => [...prev, imageSrc!]);
      setCurrentShot((prev) => prev + 1);
    } else {
        // 캡처 실패 시 락 해제
        isCapturingRef.current = false;
    }
  }, [webcamRef, isMockMode, currentShot, getMockImage]);

  // 상태가 변경될 때 락 해제 관리
  useEffect(() => {
    if (status === 'countdown' || status === 'idle') {
      isCapturingRef.current = false;
    }
  }, [status]);

  useEffect(() => {
    let timer: NodeJS.Timeout;

    if (status === 'countdown') {
      timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            capture();
            return COUNTDOWN_SECONDS;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => clearInterval(timer);
  }, [status, capture]);

  useEffect(() => {
    if (status === 'countdown' || status === 'capturing') {
      if (currentShot >= captureCount) {
        setStatus('finished');
      }
    }
  }, [currentShot, status, captureCount]);

  useEffect(() => {
    if (images.length > 0 && images.length < captureCount) {
      const timer = setTimeout(() => {
        setStatus('countdown'); 
        setCountdown(COUNTDOWN_SECONDS);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [images.length, captureCount]);

  // 다운로드 (html-to-image 사용)
  const downloadImage = async () => {
    // GA: 다운로드 이벤트 (프레임, 필터 정보 포함)
    const currentFrame = THEME_FRAMES[theme][selectedFrameIndex];
    gtag.event({
      action: 'download_image',
      category: 'Conversion',
      label: `Theme:${theme}|Frame:${currentFrame.id}|Layout:${selectedLayout}|Filter:${selectedFilter}`,
    });

    if (frameRef.current) {
      try {
        // 폰트 로딩 대기를 위해 잠시 지연
        await document.fonts.ready;
        
        const dataUrl = await htmlToImage.toPng(frameRef.current, {
          cacheBust: true,
          pixelRatio: 3, // 화질 개선을 위해 3배율로 설정
          quality: 1.0,
          width: frameRef.current.scrollWidth,
          height: frameRef.current.scrollHeight,
        });
        
        const link = document.createElement('a');
        link.download = `photo-${theme}-${selectedLayout}-${Date.now()}.png`;
        link.href = dataUrl;
        link.click();
      } catch (err) {
        console.error("Download failed:", err);
        alert("이미지 저장 중 오류가 발생했습니다.");
      }
    }
  };

  const reset = () => {
    gtag.event({
      action: 'retake_photo',
      category: 'Interaction',
    });
    setImages([]);
    setStatus('idle');
    setCurrentShot(0);
    setCameraStream(null);
  };

  const getContainerStyles = () => {
    switch (theme) {
      case 'simple':
        return {
          container: "bg-gray-50 text-gray-900 font-sans",
          title: "text-4xl font-bold tracking-tight text-gray-900",
          subtitle: "text-gray-500 font-light",
          button: "bg-black text-white hover:bg-gray-800 shadow-md rounded-lg",
        };
      case 'neon':
        return {
          container: "bg-black text-white font-mono",
          title: "text-5xl font-bold drop-shadow-[0_0_10px_currentColor]",
          subtitle: "drop-shadow-[0_0_5px_currentColor]",
          button: "bg-transparent border-2 border-current text-current hover:bg-white/10 shadow-[0_0_15px_currentColor] rounded-none",
        };
      case 'kitsch':
      default:
        return {
          container: "bg-[#ffcce6] text-[#2d0015] font-jua", 
          title: "text-6xl font-bold text-[#ff1493] text-shadow-retro transform -rotate-2",
          subtitle: "text-gray-700 bg-white border-2 border-black box-shadow-retro transform rotate-1 px-2",
          button: "bg-[#ff1493] text-white border-2 border-black box-shadow-retro hover:bg-[#ff0066] rounded-full",
        };
    }
  };

  const styles = getContainerStyles();
  const neonColorClass = theme === 'neon' ? currentFrameStyle.text : '';

  return (
    <div className={cn("min-h-screen w-full transition-colors duration-500 p-4 flex flex-col items-center overflow-y-auto", styles.container)}>
      
      {/* 헤더 영역 */}
      <div className="mt-6 mb-4 text-center relative flex flex-col items-center gap-4">
        {/* 테마 선택 */}
        <div className="flex gap-2 bg-white/80 backdrop-blur-md p-1.5 rounded-full shadow-sm border border-black/5 z-10">
          <ThemeButton current={theme} type="kitsch" onClick={() => setTheme('kitsch')} label="💖 Kitsch" color="bg-pink-400" />
          <ThemeButton current={theme} type="simple" onClick={() => setTheme('simple')} label="🤍 Simple" color="bg-gray-200" />
          <ThemeButton current={theme} type="neon" onClick={() => setTheme('neon')} label="💜 Neon" color="bg-purple-600 text-white" />
        </div>

        <div>
          <h1 className={cn("inline-block transition-all duration-300", styles.title, neonColorClass)}>
            KIMTOKKI
          </h1>
        </div>

        {/* 옵션 선택기 (프레임 & 레이아웃 또는 필터) */}
        <div className="flex flex-wrap justify-center gap-4 h-auto min-h-12 items-center mb-4">
          {/* 프레임 선택 */}
          <div className="flex gap-3 items-center bg-white/50 backdrop-blur-sm p-2 rounded-xl animate-fade-in z-40 relative">
            <span className="text-xs font-bold opacity-70 mr-1">FRAME</span>
            {THEME_FRAMES[theme].map((frame, idx) => (
              <button
                key={frame.id}
                onClick={() => handleFrameSelect(idx)}
                className={cn(
                  "w-6 h-6 rounded-full border-2 transition-all hover:scale-110 relative",
                  idx === selectedFrameIndex ? "scale-110 ring-2 ring-offset-2 ring-blue-400 border-transparent" : "border-white/50 opacity-80 hover:opacity-100",
                  frame.bg === 'bg-white' ? 'bg-white' : frame.bg 
                )}
                style={frame.style ? { ...frame.style } : undefined} 
                title={frame.label}
              >
                {/* 컬러 버튼 보조 스타일 */}
                {(!frame.style && frame.id === 'black') && <span className="absolute inset-0 rounded-full bg-black" />}
                {(!frame.style && frame.id === 'white') && <span className="absolute inset-0 rounded-full bg-white border border-gray-200" />}
                {(!frame.style && frame.id === 'pink') && <span className="absolute inset-0 rounded-full bg-[#ffcce6]" />}
                {(!frame.style && frame.id === 'cyan') && <span className="absolute inset-0 rounded-full bg-[#0ff]" />}
                {(!frame.style && frame.id === 'magenta') && <span className="absolute inset-0 rounded-full bg-[#f0f]" />}
                {(!frame.style && frame.id === 'green') && <span className="absolute inset-0 rounded-full bg-[#0f0]" />}
                {(!frame.style && frame.id === 'beige') && <span className="absolute inset-0 rounded-full bg-[#f5f5dc]" />}
                {(!frame.style && frame.id === 'gradient') && <span className="absolute inset-0 rounded-full bg-gradient-to-br from-yellow-200 to-pink-300" />}
                
                {idx === selectedFrameIndex && <Check size={16} className={cn("absolute inset-0 m-auto", frame.id === 'white' || frame.id === 'beige' || frame.id === 'pink' ? 'text-black' : 'text-white')} />}
              </button>
            ))}
          </div>

          {status === 'idle' ? (
            /* 레이아웃 선택 */
            <div className="flex gap-2 items-center bg-white/50 backdrop-blur-sm p-2 rounded-xl animate-fade-in z-40 relative">
              <span className="text-xs font-bold opacity-70 mr-1">LAYOUT</span>
              {LAYOUTS.map((layout) => (
                <button
                  key={layout.id}
                  onClick={() => handleLayoutSelect(layout.id)}
                  className={cn(
                    "px-3 py-1 rounded-md text-xs font-bold transition-all flex items-center gap-1",
                    selectedLayout === layout.id 
                      ? "bg-black text-white shadow-md" 
                      : "bg-white/50 text-gray-600 hover:bg-white"
                  )}
                >
                  <Layout size={12} />
                  {layout.label.split(' ')[0]}
                </button>
              ))}
            </div>
          ) : (
            /* 필터 선택 (촬영 중일 때 표시) */
            <div className="flex gap-2 items-center bg-white/80 backdrop-blur-md p-2 rounded-xl shadow-lg border border-pink-100 animate-fade-in z-50 relative">
              <span className="text-xs font-bold opacity-70 mr-1 flex items-center gap-1"><Wand2 size={12}/> FILTER</span>
              {FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  onClick={() => handleFilterSelect(filter.id)}
                  className={cn(
                    "px-3 py-1 rounded-md text-xs font-bold transition-all",
                    selectedFilter === filter.id 
                      ? "bg-pink-500 text-white shadow-md" 
                      : "bg-white text-gray-600 hover:bg-pink-50"
                  )}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 메인 영역 (통합된 프레임) */}
      <div className="flex flex-col items-center justify-center w-full max-w-4xl pb-10">
        
        {/* 숨겨진 웹캠 (스트림 캡처용) */}
        {status !== 'idle' && (
          <div className="absolute opacity-0 pointer-events-none w-1 h-1 overflow-hidden">
            <Webcam
              audio={false}
              ref={webcamRef}
              onUserMedia={setCameraStream}
              screenshotFormat="image/jpeg"
              videoConstraints={{ width: 1280, height: 720, facingMode: "user" }}
              forceScreenshotSourceSize={true}
            />
          </div>
        )}
        
        <div 
          ref={frameRef}
          className={cn("p-4 pb-12 transition-all duration-300 relative", currentFrameStyle.bg, currentFrameStyle.border)}
          style={{
            ...(currentFrameStyle.style || {}), 
            minWidth: selectedLayout === 'vertical4' ? '180px' : '340px',
          }}
        >
          {/* 프레임 헤더 */}
          <div className="flex justify-between items-center mb-3 px-1">
              <span className={cn("text-xs font-mono opacity-50", theme === 'neon' ? currentFrameStyle.text : 'text-gray-500')}>{new Date().toLocaleDateString()}</span>
              <span className={cn("text-xs font-bold", currentFrameStyle.text)}>
                KIMTOKKI
              </span>
          </div>

          {/* 그리드 영역 (여기에 웹캠 통합) */}
          <div className={cn(
            "grid gap-2 transition-all", 
            selectedLayout === 'grid4' ? "grid-cols-2 w-[300px]" : 
            selectedLayout === 'vertical4' ? "grid-cols-1 w-[150px]" : 
            "grid-cols-1 w-[300px]"
          )}>
            {Array.from({ length: captureCount }).map((_, idx) => {
              const isCurrentShot = idx === currentShot && status !== 'finished' && status !== 'idle';
              const image = images[idx];

              return (
                <div key={idx} className={cn(
                  "relative overflow-hidden group bg-gray-100",
                  currentLayout.ratio
                )}>
                  {/* 이미지가 있으면 이미지 표시 */}
                  {image ? (
                    <img 
                      src={image} 
                      alt={`snap-${idx}`} 
                      className="w-full h-full object-cover transform scale-x-[-1]"
                      style={currentFilterStyle}
                    />
                  ) : isCurrentShot ? (
                    /* 현재 촬영 순서면 웹캠 프리뷰 표시 */
                    <div className="w-full h-full relative">
                      <VideoPreview 
                        stream={cameraStream}
                        className="w-full h-full object-cover transform scale-x-[-1]"
                        style={currentFilterStyle}
                      />
                      {/* 카운트다운 오버레이 */}
                      {status === 'countdown' && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20 z-10">
                          <span className={cn("text-6xl font-bold text-white animate-bounce drop-shadow-lg", theme === 'neon' && "text-[#0ff] shadow-[0_0_10px_#0ff]")}>
                            {countdown}
                          </span>
                        </div>
                      )}
                      {/* 플래시 효과 */}
                      {flash && <div className="absolute inset-0 bg-white opacity-90 animate-flash pointer-events-none z-20" />}
                    </div>
                  ) : (
                    /* 아직 촬영 전이면 빈칸 */
                    <div className={cn("w-full h-full flex items-center justify-center opacity-20", currentFrameStyle.text)}>
                      <span className="text-4xl font-bold">{idx + 1}</span>
                    </div>
                  )}

                  {/* Kitsch 테마 장식 */}
                  {selectedLayout === 'grid4' && theme === 'kitsch' && image && idx === 0 && (
                    <div className="absolute -top-2 -left-2 text-2xl transform -rotate-12 filter drop-shadow-md z-30">🎀</div>
                  )}
                  {selectedLayout === 'grid4' && theme === 'kitsch' && image && idx === 3 && (
                    <div className="absolute -bottom-1 -right-1 text-2xl transform rotate-12 filter drop-shadow-md z-30">💖</div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 프레임 푸터 */}
          <div className="mt-5 text-center">
            <h2 className={cn("text-xl font-bold tracking-tighter", currentFrameStyle.text)}>
              {theme === 'simple' ? 'MOMENTS' : theme === 'neon' ? 'CYBER PUNK' : 'MY BEST MOMENT'}
            </h2>
            {theme === 'kitsch' && (
              <div className="flex justify-center gap-1 mt-1">
                <div className="w-3 h-3 rounded-full bg-[#ff1493]"></div>
                <div className="w-3 h-3 rounded-full bg-[#00ffff]"></div>
                <div className="w-3 h-3 rounded-full bg-[#ffff00]"></div>
              </div>
            )}
          </div>
        </div>

        {/* 하단 액션 버튼 */}
        <div className="mt-8 w-full max-w-[340px] flex flex-col gap-3">
          {status === 'idle' && (
            <button
              onClick={startPhotoSession}
              className={cn("w-full py-4 text-xl font-bold flex items-center justify-center gap-2 transition-all shadow-xl hover:shadow-2xl transform hover:-translate-y-1", styles.button, neonColorClass)}
            >
              <Camera size={24} />
              {theme === 'simple' ? 'Start Shooting' : '촬영 시작'}
            </button>
          )}
          
          {status === 'finished' && (
            <div className="flex flex-col gap-3 animate-fade-in">
              <button
                onClick={downloadImage}
                className={cn("w-full py-3 text-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg", styles.button, neonColorClass)}
              >
                <Download size={24} />
                이미지 저장
              </button>
              <button
                onClick={reset}
                className={cn("w-full py-3 text-lg font-medium flex items-center justify-center gap-2 transition-all bg-white text-black border border-gray-300 rounded-lg hover:bg-gray-100", 
                  theme === 'neon' && `bg-transparent text-[#0ff] border-[#0ff] hover:bg-[#0ff]/10 rounded-none`
                )}
              >
                <RefreshCcw size={20} />
                다시 찍기
              </button>
            </div>
          )}
        </div>

      </div>

      {/* 전역 스타일 */}
      <style jsx global>{`
        @keyframes flash {
          0% { opacity: 0.8; }
          100% { opacity: 0; }
        }
        .animate-flash {
          animation: flash 0.15s ease-out forwards;
        }
        .text-shadow-retro { text-shadow: 2px 2px 0px #000; }
        .box-shadow-retro { box-shadow: 4px 4px 0px 0px #000; }
        .box-shadow-soft { box-shadow: 6px 6px 0px 0px rgba(0, 0, 0, 0.1); }
        .animate-fade-in { animation: fadeIn 0.3s ease-in-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}

// 테마 버튼 컴포넌트
function ThemeButton({ current, type, onClick, label, color }: { current: ThemeType, type: ThemeType, onClick: () => void, label: string, color: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-4 py-1.5 rounded-full text-sm font-medium transition-all",
        current === type ? `${color} shadow-md scale-105` : "bg-gray-100 text-gray-500 hover:bg-gray-200"
      )}
    >
      {label}
    </button>
  );
}

// 비디오 프리뷰 컴포넌트 (Webcam 스트림 재사용)
const VideoPreview = ({ stream, style, className }: { stream: MediaStream | null, style?: React.CSSProperties, className?: string }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  
  useEffect(() => {
    const videoEl = videoRef.current;
    if (videoEl && stream) {
      videoEl.srcObject = stream;
      // Promise 처리를 통해 중단 에러 무시
      const playPromise = videoEl.play();
      if (playPromise !== undefined) {
        playPromise.catch(e => {
          if (e.name !== 'AbortError') {
            console.error("Video play failed", e);
          }
        });
      }
    }
  }, [stream]);

  return <video ref={videoRef} autoPlay playsInline muted className={className} style={style} />;
};
