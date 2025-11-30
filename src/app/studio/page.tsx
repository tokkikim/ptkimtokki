'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Webcam from 'react-webcam';
import { Upload, Camera, X, Download, Grid, Loader2, Play } from 'lucide-react';
import { useTheme, ThemeType } from '@/context/ThemeContext';
import * as htmlToImage from 'html-to-image';

// 포즈 타입
type Pose = {
  id: string;
  name: string;
  image: string; // 생성된 포즈 이미지
  referencePose?: string; // 참조 포즈 ID (토끼 포즈)
};

// 포즈 카테고리 타입
type PoseCategory = {
  id: string;
  name: string;
  poses: Pose[];
};

// 프레임 정보 타입
type FrameInfo = {
  id: string;
  name: string;
  image: string;
  photoAreas: PhotoArea[];
};

// 사진 영역 정보
type PhotoArea = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

// PhotoBooth의 프레임 시스템 가져오기
type FrameOption = {
  id: string;
  label: string;
  bg: string;
  border: string;
  text: string;
  style?: React.CSSProperties;
};

// 레이아웃 타입
type LayoutType = 'grid4' | 'half4' | 'full1';

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

export default function StudioPage() {
  const { theme } = useTheme();
  // 1단계: 인물 이미지 업로드 (생성 대상)
  const [uploadedPersonImage, setUploadedPersonImage] = useState<string | null>(null);
  const [isGeneratingPoses, setIsGeneratingPoses] = useState(false);
  
  // 2단계: 생성된 포즈들 (배경 제거 완료)
  const [generatedPoses, setGeneratedPoses] = useState<Pose[]>([]);
  const [poseCategories, setPoseCategories] = useState<PoseCategory[]>([]);
  
  // 포즈 모음 (여러 세트의 포즈)
  const [poseCollections, setPoseCollections] = useState<Array<{ id: string; name: string; poses: Pose[]; thumbnail?: string }>>([]);
  const [selectedCollectionIndex, setSelectedCollectionIndex] = useState<number | null>(null);
  const [displayedThumbnailImage, setDisplayedThumbnailImage] = useState<string | null>(null); // 썸네일 클릭 시 표시할 이미지
  
  // 프레임 선택 (PhotoBooth 프레임 시스템 사용)
  const [selectedFrameIndex, setSelectedFrameIndex] = useState(0);
  const [frameInfo, setFrameInfo] = useState<FrameInfo | null>(null);
  
  // 레이아웃 선택
  const [selectedLayout, setSelectedLayout] = useState<LayoutType>('grid4');
  
  // 포즈 선택
  const [selectedPoseIndex, setSelectedPoseIndex] = useState<number | null>(null);
  
  // 촬영 상태
  const webcamRef = useRef<Webcam>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const isCapturingRef = useRef(false); // 중복 촬영 방지
  const [status, setStatus] = useState<'idle' | 'countdown' | 'capturing' | 'finished'>('idle');
  const [countdown, setCountdown] = useState<number>(3);
  const [currentShot, setCurrentShot] = useState<number>(0);
  const [images, setImages] = useState<string[]>([]);
  const [flash, setFlash] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  
  // 포즈 위치 및 크기 조절 (각 슬롯별) - 초기 크기 50% (scale 1.0 = 100%, 0.5 = 50%)
  const [posePositions, setPosePositions] = useState<Array<{ x: number; y: number; scale: number; flipped: boolean }>>(
    new Array(4).fill(null).map(() => ({ x: 0, y: 0, scale: 0.5, flipped: false })) // 초기 크기 50%, 반전 없음
  );
  const [focusedPoseSlot, setFocusedPoseSlot] = useState<number | null>(null); // 포커스된 포즈 슬롯
  const focusedPoseSlotRef = useRef<number | null>(null); // 포커스된 포즈 슬롯 (ref로 즉시 접근)
  const [isDragging, setIsDragging] = useState(false); // 드래그 중인지 여부
  const [draggingSlotIndex, setDraggingSlotIndex] = useState<number | null>(null); // 드래그 중인 슬롯 인덱스
  const dragStartRef = useRef<{ x: number; y: number } | null>(null); // 드래그 시작 위치 (ref로 즉시 접근)
  
  // 포즈 변경 팝업 상태
  const [showPoseSelectPopup, setShowPoseSelectPopup] = useState(false);
  const [poseSelectSlotIndex, setPoseSelectSlotIndex] = useState<number | null>(null);
  
  // 이용약관 및 개인정보 처리방침 동의 상태
  const [showTermsPopup, setShowTermsPopup] = useState(false);
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [agreeToPrivacy, setAgreeToPrivacy] = useState(false);
  
  // 이미지 업로드/촬영 팝업 상태
  const [showImageUploadPopup, setShowImageUploadPopup] = useState(false);
  const [captureImageStream, setCaptureImageStream] = useState<MediaStream | null>(null);
  const captureWebcamRef = useRef<Webcam>(null);
  
  // 이미지 영역 선택 상태
  const [showImageCropPopup, setShowImageCropPopup] = useState(false);
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);
  const [cropArea, setCropArea] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [isSelectingArea, setIsSelectingArea] = useState(false);
  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null);
  const [imageScale, setImageScale] = useState(1); // 이미지 줌 스케일
  const [isResizing, setIsResizing] = useState(false); // 모서리 리사이즈 중 여부
  const [resizeHandle, setResizeHandle] = useState<string | null>(null); // 리사이즈 핸들 위치 (tl, tr, bl, br)
  const imageCropRef = useRef<HTMLImageElement>(null);
  const imageCropContainerRef = useRef<HTMLDivElement>(null);
  
  // 각 슬롯별 선택된 포즈 인덱스 (기본값은 selectedPoseIndex + 슬롯 인덱스)
  const [slotPoseIndices, setSlotPoseIndices] = useState<number[]>([]);
  
  const personImageInputRef = useRef<HTMLInputElement>(null);

  // 비회원 여부 체크 (실제로는 세션/쿠키로 확인해야 함)
  const isGuest = () => {
    // TODO: 실제 회원 인증 로직으로 대체
    // 예: const session = await getSession(); return !session?.user;
    return true; // 일단 항상 비회원으로 가정
  };

  // 오늘 날짜 문자열 반환 (YYYY-MM-DD)
  const getTodayDateString = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // 비회원이 오늘 이미 생성했는지 체크
  const hasGuestGeneratedToday = () => {
    if (!isGuest()) return false; // 회원이면 제한 없음
    
    const lastGenerationDate = localStorage.getItem('guest_pose_generation_date');
    const today = getTodayDateString();
    
    return lastGenerationDate === today;
  };

  // 비회원 생성 기록 저장 (200 응답 후 호출)
  const saveGuestGenerationDate = () => {
    if (!isGuest()) return; // 회원이면 저장하지 않음
    
    const today = getTodayDateString();
    localStorage.setItem('guest_pose_generation_date', today);
  };

  // 이용약관 동의 팝업 열기 (+ 버튼 클릭 시)
  const openTermsPopup = () => {
    // 비회원이고 오늘 이미 생성한 경우 제한
    if (isGuest() && hasGuestGeneratedToday()) {
      alert('비회원은 하루에 1번만 포즈를 생성할 수 있습니다.\n내일 다시 시도해주세요.');
      return;
    }
    
    setShowTermsPopup(true);
    setAgreeToTerms(false);
    setAgreeToPrivacy(false);
  };

  // 이용약관 동의 팝업 닫기
  const closeTermsPopup = () => {
    setShowTermsPopup(false);
    setAgreeToTerms(false);
    setAgreeToPrivacy(false);
  };

  // 동의 후 이미지 업로드 팝업 열기
  const handleAgreeAndContinue = async () => {
    if (!agreeToTerms || !agreeToPrivacy) {
      alert('이용약관과 개인정보 처리방침에 모두 동의해주세요.');
      return;
    }
    
    closeTermsPopup();
    
    // 이미지 업로드 팝업 열기
    setShowImageUploadPopup(true);
    // 촬영 모드일 때 웹캠 스트림 시작
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      setCaptureImageStream(stream);
    } catch (error) {
      console.error('웹캠 접근 실패:', error);
      alert('웹캠 접근 권한이 필요합니다.');
    }
  };

  // 이미지 업로드/촬영 팝업 열기 (직접 호출 시 - 동의 팝업을 거치지 않음)
  const openImageUploadPopup = async () => {
    setShowImageUploadPopup(true);
    // 촬영 모드일 때 웹캠 스트림 시작
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      setCaptureImageStream(stream);
    } catch (error) {
      console.error('웹캠 접근 실패:', error);
      alert('웹캠 접근 권한이 필요합니다.');
    }
  };

  // 이미지 업로드/촬영 팝업 닫기
  const closeImageUploadPopup = () => {
    setShowImageUploadPopup(false);
    // 웹캠 스트림 정리
    if (captureImageStream) {
      captureImageStream.getTracks().forEach(track => track.stop());
      setCaptureImageStream(null);
    }
  };

  // 촬영 버튼 클릭 시 사진 촬영
  const capturePhoto = () => {
    const imageSrc = captureWebcamRef.current?.getScreenshot();
    if (imageSrc) {
      setImageToCrop(imageSrc);
      setShowImageCropPopup(true);
      closeImageUploadPopup();
    } else {
      alert('사진 촬영에 실패했습니다.');
    }
  };

  // 파일 업로드 버튼 클릭 시 파일 선택
  const handleFileUploadClick = () => {
    personImageInputRef.current?.click();
  };

  // 1단계: 인물 이미지 업로드 (생성 대상)
  const handlePersonImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('이미지 파일만 업로드 가능합니다.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const imageSrc = e.target?.result as string;
      setImageToCrop(imageSrc);
      setShowImageCropPopup(true);
      closeImageUploadPopup();
    };
    reader.readAsDataURL(file);
  };

  // 이미지 로드 시 초기 최소 영역 설정
  useEffect(() => {
    if (showImageCropPopup && imageToCrop && !cropArea) {
      const timer = setTimeout(() => {
        const containerRect = imageCropContainerRef.current?.getBoundingClientRect();
        if (!containerRect) return;
        
        // 최소 영역 크기 (컨테이너의 30% 또는 최소 100px)
        const minSize = Math.min(containerRect.width * 0.3, containerRect.height * 0.3, 100);
        const centerX = containerRect.width / 2;
        const centerY = containerRect.height / 2;
        
        setCropArea({
          x: centerX - minSize / 2,
          y: centerY - minSize / 2,
          width: minSize,
          height: minSize,
        });
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [showImageCropPopup, imageToCrop, cropArea]);

  // 이미지 줌 인/아웃
  const handleZoomIn = () => {
    setImageScale((prev) => Math.min(prev + 0.1, 3));
  };

  const handleZoomOut = () => {
    setImageScale((prev) => Math.max(prev - 0.1, 0.5));
  };

  // 모서리 핸들 클릭 감지
  const getResizeHandle = (x: number, y: number, area: { x: number; y: number; width: number; height: number }): string | null => {
    const handleSize = 20;
    const handles = [
      { name: 'tl', x: area.x, y: area.y },
      { name: 'tr', x: area.x + area.width, y: area.y },
      { name: 'bl', x: area.x, y: area.y + area.height },
      { name: 'br', x: area.x + area.width, y: area.y + area.height },
    ];
    
    for (const handle of handles) {
      if (
        x >= handle.x - handleSize / 2 &&
        x <= handle.x + handleSize / 2 &&
        y >= handle.y - handleSize / 2 &&
        y <= handle.y + handleSize / 2
      ) {
        return handle.name;
      }
    }
    return null;
  };

  // 이미지 영역 선택 시작 (드래그 또는 리사이즈)
  const handleImageMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!imageCropContainerRef.current || !cropArea) return;
    const rect = imageCropContainerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // 모서리 핸들 체크
    const handle = getResizeHandle(x, y, cropArea);
    if (handle) {
      setIsResizing(true);
      setResizeHandle(handle);
      setSelectionStart({ x, y });
      return;
    }
    
    // 영역 내부인지 체크 (드래그로 이동)
    if (
      x >= cropArea.x &&
      x <= cropArea.x + cropArea.width &&
      y >= cropArea.y &&
      y <= cropArea.y + cropArea.height
    ) {
      setIsSelectingArea(true);
      setSelectionStart({ x: x - cropArea.x, y: y - cropArea.y }); // 영역 내부 상대 위치
      return;
    }
    
    // 영역 외부에서 클릭해도 영역을 유지 (영역이 사라지지 않도록)
    // 아무 동작도 하지 않음
  };

  // 이미지 영역 선택 중 (드래그 또는 리사이즈)
  const handleImageMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!imageCropContainerRef.current || !selectionStart || !imageCropRef.current) return;
    const rect = imageCropContainerRef.current.getBoundingClientRect();
    const imgRect = imageCropRef.current.getBoundingClientRect();
    const containerRect = imageCropContainerRef.current.getBoundingClientRect();
    
    // 이미지의 실제 표시 크기 계산 (스케일 고려)
    const imgDisplayWidth = imgRect.width;
    const imgDisplayHeight = imgRect.height;
    
    // 이미지가 컨테이너 내에서의 위치 계산
    const imgOffsetX = imgRect.left - containerRect.left;
    const imgOffsetY = imgRect.top - containerRect.top;
    
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;
    
    if (isResizing && resizeHandle && cropArea) {
      // 모서리 리사이즈
      const minSize = 50; // 최소 크기
      let newArea = { ...cropArea };
      
      switch (resizeHandle) {
        case 'tl': // 왼쪽 위
          newArea.width = cropArea.x + cropArea.width - currentX;
          newArea.height = cropArea.y + cropArea.height - currentY;
          newArea.x = currentX;
          newArea.y = currentY;
          if (newArea.width < minSize) {
            newArea.x = cropArea.x + cropArea.width - minSize;
            newArea.width = minSize;
          }
          if (newArea.height < minSize) {
            newArea.y = cropArea.y + cropArea.height - minSize;
            newArea.height = minSize;
          }
          break;
        case 'tr': // 오른쪽 위
          newArea.width = currentX - cropArea.x;
          newArea.height = cropArea.y + cropArea.height - currentY;
          newArea.y = currentY;
          if (newArea.width < minSize) newArea.width = minSize;
          if (newArea.height < minSize) {
            newArea.y = cropArea.y + cropArea.height - minSize;
            newArea.height = minSize;
          }
          break;
        case 'bl': // 왼쪽 아래
          newArea.width = cropArea.x + cropArea.width - currentX;
          newArea.height = currentY - cropArea.y;
          newArea.x = currentX;
          if (newArea.width < minSize) {
            newArea.x = cropArea.x + cropArea.width - minSize;
            newArea.width = minSize;
          }
          if (newArea.height < minSize) newArea.height = minSize;
          break;
        case 'br': // 오른쪽 아래
          newArea.width = currentX - cropArea.x;
          newArea.height = currentY - cropArea.y;
          if (newArea.width < minSize) newArea.width = minSize;
          if (newArea.height < minSize) newArea.height = minSize;
          break;
      }
      
      // 이미지 영역 내로 제한
      const minX = imgOffsetX;
      const minY = imgOffsetY;
      const maxX = imgOffsetX + imgDisplayWidth;
      const maxY = imgOffsetY + imgDisplayHeight;
      
      // X 경계 체크
      if (newArea.x < minX) {
        newArea.width += newArea.x - minX;
        newArea.x = minX;
      }
      if (newArea.x + newArea.width > maxX) {
        newArea.width = maxX - newArea.x;
      }
      
      // Y 경계 체크
      if (newArea.y < minY) {
        newArea.height += newArea.y - minY;
        newArea.y = minY;
      }
      if (newArea.y + newArea.height > maxY) {
        newArea.height = maxY - newArea.y;
      }
      
      // 최소 크기 보장
      if (newArea.width < minSize) {
        if (resizeHandle === 'tl' || resizeHandle === 'bl') {
          newArea.x = newArea.x + newArea.width - minSize;
        }
        newArea.width = minSize;
      }
      if (newArea.height < minSize) {
        if (resizeHandle === 'tl' || resizeHandle === 'tr') {
          newArea.y = newArea.y + newArea.height - minSize;
        }
        newArea.height = minSize;
      }
      
      // 최종 이미지 영역 체크
      if (newArea.x < minX || newArea.x + newArea.width > maxX || 
          newArea.y < minY || newArea.y + newArea.height > maxY) {
        // 영역이 이미지를 벗어나면 조정
        if (newArea.x < minX) {
          newArea.width -= (minX - newArea.x);
          newArea.x = minX;
        }
        if (newArea.x + newArea.width > maxX) {
          newArea.width = maxX - newArea.x;
        }
        if (newArea.y < minY) {
          newArea.height -= (minY - newArea.y);
          newArea.y = minY;
        }
        if (newArea.y + newArea.height > maxY) {
          newArea.height = maxY - newArea.y;
        }
      }
      
      setCropArea(newArea);
    } else if (isSelectingArea && cropArea && selectionStart.x < cropArea.width && selectionStart.y < cropArea.height) {
      // 영역 이동
      const newX = currentX - selectionStart.x;
      const newY = currentY - selectionStart.y;
      
      // 이미지 영역 내로 제한
      const minX = imgOffsetX;
      const minY = imgOffsetY;
      const maxX = imgOffsetX + imgDisplayWidth - cropArea.width;
      const maxY = imgOffsetY + imgDisplayHeight - cropArea.height;
      
      setCropArea({
        ...cropArea,
        x: Math.max(minX, Math.min(maxX, newX)),
        y: Math.max(minY, Math.min(maxY, newY)),
      });
    } else if (isSelectingArea && selectionStart) {
      // 새 영역 선택
      const width = currentX - selectionStart.x;
      const height = currentY - selectionStart.y;
      
      let newX = width < 0 ? currentX : selectionStart.x;
      let newY = height < 0 ? currentY : selectionStart.y;
      let newWidth = Math.abs(width);
      let newHeight = Math.abs(height);
      
      // 이미지 영역 내로 제한
      const minX = imgOffsetX;
      const minY = imgOffsetY;
      const maxX = imgOffsetX + imgDisplayWidth;
      const maxY = imgOffsetY + imgDisplayHeight;
      
      // 시작점이 이미지 밖이면 조정
      if (newX < minX) {
        newWidth -= (minX - newX);
        newX = minX;
      }
      if (newY < minY) {
        newHeight -= (minY - newY);
        newY = minY;
      }
      
      // 끝점이 이미지 밖이면 조정
      if (newX + newWidth > maxX) {
        newWidth = maxX - newX;
      }
      if (newY + newHeight > maxY) {
        newHeight = maxY - newY;
      }
      
      // 최소 크기 보장
      const minSize = 50;
      if (newWidth < minSize) {
        newWidth = minSize;
        if (newX + newWidth > maxX) {
          newX = maxX - newWidth;
        }
      }
      if (newHeight < minSize) {
        newHeight = minSize;
        if (newY + newHeight > maxY) {
          newY = maxY - newHeight;
        }
      }
      
      setCropArea({
        x: newX,
        y: newY,
        width: newWidth,
        height: newHeight,
      });
    }
  };

  // 이미지 영역 선택 종료
  const handleImageMouseUp = () => {
    setIsSelectingArea(false);
    setIsResizing(false);
    setResizeHandle(null);
    setSelectionStart(null);
  };

  // 터치 이벤트 핸들러
  const handleImageTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!imageCropContainerRef.current || !cropArea) return;
    const rect = imageCropContainerRef.current.getBoundingClientRect();
    const touch = e.touches[0];
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    
    const handle = getResizeHandle(x, y, cropArea);
    if (handle) {
      setIsResizing(true);
      setResizeHandle(handle);
      setSelectionStart({ x, y });
      return;
    }
    
    if (
      x >= cropArea.x &&
      x <= cropArea.x + cropArea.width &&
      y >= cropArea.y &&
      y <= cropArea.y + cropArea.height
    ) {
      setIsSelectingArea(true);
      setSelectionStart({ x: x - cropArea.x, y: y - cropArea.y });
      return;
    }
    
    // 영역 외부에서 터치해도 영역을 유지 (영역이 사라지지 않도록)
    // 아무 동작도 하지 않음
  };

  const handleImageTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!imageCropContainerRef.current || !selectionStart || !imageCropRef.current) return;
    e.preventDefault();
    const rect = imageCropContainerRef.current.getBoundingClientRect();
    const imgRect = imageCropRef.current.getBoundingClientRect();
    const containerRect = imageCropContainerRef.current.getBoundingClientRect();
    
    // 이미지의 실제 표시 크기 계산 (스케일 고려)
    const imgDisplayWidth = imgRect.width;
    const imgDisplayHeight = imgRect.height;
    
    // 이미지가 컨테이너 내에서의 위치 계산
    const imgOffsetX = imgRect.left - containerRect.left;
    const imgOffsetY = imgRect.top - containerRect.top;
    
    const touch = e.touches[0];
    const currentX = touch.clientX - rect.left;
    const currentY = touch.clientY - rect.top;
    
    if (isResizing && resizeHandle && cropArea) {
      const minSize = 50;
      let newArea = { ...cropArea };
      
      switch (resizeHandle) {
        case 'tl':
          newArea.width = cropArea.x + cropArea.width - currentX;
          newArea.height = cropArea.y + cropArea.height - currentY;
          newArea.x = currentX;
          newArea.y = currentY;
          if (newArea.width < minSize) {
            newArea.x = cropArea.x + cropArea.width - minSize;
            newArea.width = minSize;
          }
          if (newArea.height < minSize) {
            newArea.y = cropArea.y + cropArea.height - minSize;
            newArea.height = minSize;
          }
          break;
        case 'tr':
          newArea.width = currentX - cropArea.x;
          newArea.height = cropArea.y + cropArea.height - currentY;
          newArea.y = currentY;
          if (newArea.width < minSize) newArea.width = minSize;
          if (newArea.height < minSize) {
            newArea.y = cropArea.y + cropArea.height - minSize;
            newArea.height = minSize;
          }
          break;
        case 'bl':
          newArea.width = cropArea.x + cropArea.width - currentX;
          newArea.height = currentY - cropArea.y;
          newArea.x = currentX;
          if (newArea.width < minSize) {
            newArea.x = cropArea.x + cropArea.width - minSize;
            newArea.width = minSize;
          }
          if (newArea.height < minSize) newArea.height = minSize;
          break;
        case 'br':
          newArea.width = currentX - cropArea.x;
          newArea.height = currentY - cropArea.y;
          if (newArea.width < minSize) newArea.width = minSize;
          if (newArea.height < minSize) newArea.height = minSize;
          break;
      }
      
      // 이미지 영역 내로 제한
      const minX = imgOffsetX;
      const minY = imgOffsetY;
      const maxX = imgOffsetX + imgDisplayWidth;
      const maxY = imgOffsetY + imgDisplayHeight;
      
      // X 경계 체크
      if (newArea.x < minX) {
        newArea.width += newArea.x - minX;
        newArea.x = minX;
      }
      if (newArea.x + newArea.width > maxX) {
        newArea.width = maxX - newArea.x;
      }
      
      // Y 경계 체크
      if (newArea.y < minY) {
        newArea.height += newArea.y - minY;
        newArea.y = minY;
      }
      if (newArea.y + newArea.height > maxY) {
        newArea.height = maxY - newArea.y;
      }
      
      // 최소 크기 보장
      if (newArea.width < minSize) {
        if (resizeHandle === 'tl' || resizeHandle === 'bl') {
          newArea.x = newArea.x + newArea.width - minSize;
        }
        newArea.width = minSize;
      }
      if (newArea.height < minSize) {
        if (resizeHandle === 'tl' || resizeHandle === 'tr') {
          newArea.y = newArea.y + newArea.height - minSize;
        }
        newArea.height = minSize;
      }
      
      // 최종 이미지 영역 체크
      if (newArea.x < minX || newArea.x + newArea.width > maxX || 
          newArea.y < minY || newArea.y + newArea.height > maxY) {
        // 영역이 이미지를 벗어나면 조정
        if (newArea.x < minX) {
          newArea.width -= (minX - newArea.x);
          newArea.x = minX;
        }
        if (newArea.x + newArea.width > maxX) {
          newArea.width = maxX - newArea.x;
        }
        if (newArea.y < minY) {
          newArea.height -= (minY - newArea.y);
          newArea.y = minY;
        }
        if (newArea.y + newArea.height > maxY) {
          newArea.height = maxY - newArea.y;
        }
      }
      
      setCropArea(newArea);
    } else if (isSelectingArea && cropArea && selectionStart.x < cropArea.width && selectionStart.y < cropArea.height) {
      // 영역 이동
      const newX = currentX - selectionStart.x;
      const newY = currentY - selectionStart.y;
      
      // 이미지 영역 내로 제한
      const minX = imgOffsetX;
      const minY = imgOffsetY;
      const maxX = imgOffsetX + imgDisplayWidth - cropArea.width;
      const maxY = imgOffsetY + imgDisplayHeight - cropArea.height;
      
      setCropArea({
        ...cropArea,
        x: Math.max(minX, Math.min(maxX, newX)),
        y: Math.max(minY, Math.min(maxY, newY)),
      });
    } else if (isSelectingArea && selectionStart) {
      // 새 영역 선택
      const width = currentX - selectionStart.x;
      const height = currentY - selectionStart.y;
      
      let newX = width < 0 ? currentX : selectionStart.x;
      let newY = height < 0 ? currentY : selectionStart.y;
      let newWidth = Math.abs(width);
      let newHeight = Math.abs(height);
      
      // 이미지 영역 내로 제한
      const minX = imgOffsetX;
      const minY = imgOffsetY;
      const maxX = imgOffsetX + imgDisplayWidth;
      const maxY = imgOffsetY + imgDisplayHeight;
      
      // 시작점이 이미지 밖이면 조정
      if (newX < minX) {
        newWidth -= (minX - newX);
        newX = minX;
      }
      if (newY < minY) {
        newHeight -= (minY - newY);
        newY = minY;
      }
      
      // 끝점이 이미지 밖이면 조정
      if (newX + newWidth > maxX) {
        newWidth = maxX - newX;
      }
      if (newY + newHeight > maxY) {
        newHeight = maxY - newY;
      }
      
      // 최소 크기 보장
      const minSize = 50;
      if (newWidth < minSize) {
        newWidth = minSize;
        if (newX + newWidth > maxX) {
          newX = maxX - newWidth;
        }
      }
      if (newHeight < minSize) {
        newHeight = minSize;
        if (newY + newHeight > maxY) {
          newY = maxY - newHeight;
        }
      }
      
      setCropArea({
        x: newX,
        y: newY,
        width: newWidth,
        height: newHeight,
      });
    }
  };

  const handleImageTouchEnd = () => {
    setIsSelectingArea(false);
    setIsResizing(false);
    setResizeHandle(null);
    setSelectionStart(null);
  };

  // 선택된 영역 크롭하여 저장
  const applyCrop = () => {
    if (!imageToCrop || !cropArea || !imageCropRef.current || !imageCropContainerRef.current) return;
    
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      // 이미지 컨테이너 크기 대비 실제 이미지 크기 비율 계산
      const containerRect = imageCropContainerRef.current?.getBoundingClientRect();
      const imgRect = imageCropRef.current?.getBoundingClientRect();
      if (!containerRect || !imgRect) return;
      
      // 이미지 스케일을 고려한 비율 계산
      const scaleX = img.width / (imgRect.width / imageScale);
      const scaleY = img.height / (imgRect.height / imageScale);
      
      const cropX = cropArea.x * scaleX;
      const cropY = cropArea.y * scaleY;
      const cropWidth = cropArea.width * scaleX;
      const cropHeight = cropArea.height * scaleY;
      
      canvas.width = cropWidth;
      canvas.height = cropHeight;
      
      ctx.drawImage(
        img,
        cropX, cropY, cropWidth, cropHeight,
        0, 0, cropWidth, cropHeight
      );
      
      const croppedImageSrc = canvas.toDataURL('image/png');
      setUploadedPersonImage(croppedImageSrc);
      setShowImageCropPopup(false);
      setImageToCrop(null);
      setCropArea(null);
      setIsSelectingArea(false);
      setSelectionStart(null);
    };
    img.src = imageToCrop;
  };

  // 전체 선택
  const selectAll = () => {
    if (!imageCropRef.current || !imageCropContainerRef.current) return;
    
    const imgRect = imageCropRef.current.getBoundingClientRect();
    const containerRect = imageCropContainerRef.current.getBoundingClientRect();
    
    // 이미지가 컨테이너 내에서의 위치 계산
    const imgOffsetX = imgRect.left - containerRect.left;
    const imgOffsetY = imgRect.top - containerRect.top;
    const imgDisplayWidth = imgRect.width;
    const imgDisplayHeight = imgRect.height;
    
    setCropArea({
      x: imgOffsetX,
      y: imgOffsetY,
      width: imgDisplayWidth,
      height: imgDisplayHeight,
    });
  };

  // 영역 선택 취소
  const cancelCrop = () => {
    setShowImageCropPopup(false);
    setImageToCrop(null);
    setCropArea(null);
    setIsSelectingArea(false);
    setIsResizing(false);
    setResizeHandle(null);
    setSelectionStart(null);
    setImageScale(1); // 스케일 초기화
  };

  // 목데이터로 포즈 로드 (레퍼런스 이미지 사용)
  const loadMockPoses = async () => {
    const referenceImages = [
      { id: 'smile', name: '웃는 포즈', path: '/reference-poses/rabbit-smile.png' },
      { id: 'point', name: '손가락 포인트', path: '/reference-poses/rabbit-point.png' },
      { id: 'think', name: '생각하는 포즈', path: '/reference-poses/rabbit-think.png' },
      { id: 'heart', name: '하트 포즈', path: '/reference-poses/rabbit-heart.png' },
    ];

    // 목데이터는 이미 누끼가 작업되어 있으므로 배경 제거 없이 바로 사용
    const processedPoses: Pose[] = referenceImages.map((ref) => ({
      id: ref.id,
      name: ref.name,
      image: ref.path, // 이미지 경로 그대로 사용
    }));

    return processedPoses;
  };

  // 컴포넌트 마운트 시 목데이터를 기본 포즈 모음으로 자동 로드
  useEffect(() => {
    const initializeDefaultPoses = async () => {
      const defaultPoses = await loadMockPoses();
      const defaultCollection = {
        id: 'default',
        name: '기본 포즈 모음',
        poses: defaultPoses,
      };
      setPoseCollections([defaultCollection]);
      setSelectedCollectionIndex(0);
      setGeneratedPoses(defaultPoses);
      setPoseCategories([{
        id: 'all',
        name: '전체 포즈',
        poses: defaultPoses,
      }]);
      setSelectedPoseIndex(0);
      setSlotPoseIndices([0, 1, 2, 3]);
    };
    
    initializeDefaultPoses();
  }, []);

  // 2단계: Gemini AI로 4개 포즈 생성
  // 서버에 저장된 레퍼런스 포즈 이미지를 참조하여 인물이 그 포즈를 취하도록 생성
  const generatePoses = async () => {
    if (!uploadedPersonImage) {
      alert('인물 이미지를 먼저 업로드해주세요.');
      return;
    }

    setIsGeneratingPoses(true);
    try {
      const formData = new FormData();
      
      // Base64를 Blob으로 변환
      const response = await fetch(uploadedPersonImage);
      const blob = await response.blob();
      formData.append('personImage', blob, 'person.jpg');

      // API 호출 (Gemini AI로 4개 포즈 생성 + 배경 제거)
      const apiResponse = await fetch('/api/generate-poses', {
        method: 'POST',
        body: formData,
      });

      // Content-Type 확인
      const contentType = apiResponse.headers.get('content-type');
      const isJson = contentType && contentType.includes('application/json');

      if (!apiResponse.ok) {
        let errorMessage = '포즈 생성 실패';
        
        // JSON 응답인 경우에만 파싱 시도
        if (isJson) {
          try {
            const errorData = await apiResponse.json();
            errorMessage = errorData.error || errorMessage;
            
            // 429 응답인 경우 (일일 생성 제한 초과)
            if (apiResponse.status === 429) {
              // 클라이언트 측 로컬스토리지도 업데이트 (서버와 동기화)
              if (isGuest()) {
                const today = getTodayDateString();
                localStorage.setItem('guest_pose_generation_date', today);
              }
              throw new Error(errorMessage);
            }
          } catch (parseError) {
            // JSON 파싱 실패 시 기본 메시지 사용
            console.error('Error parsing JSON response:', parseError);
          }
        } else {
          // HTML 응답인 경우 (에러 페이지)
          const text = await apiResponse.text();
          console.error('Non-JSON error response:', text.substring(0, 200));
          errorMessage = `서버 오류가 발생했습니다. (${apiResponse.status})`;
        }
        
        throw new Error(errorMessage);
      }

      // 정확히 200 응답인 경우에만 비회원 생성 기록 저장 (클라이언트 측 동기화)
      if (apiResponse.status === 200) {
        saveGuestGenerationDate();
      }

      // JSON 응답 파싱
      if (!isJson) {
        throw new Error('서버가 유효하지 않은 응답을 반환했습니다.');
      }
      
      const result = await apiResponse.json();
      
      // 생성된 포즈들을 포맷팅 (이미 배경 제거 완료됨)
      const poses: Pose[] = result.poses.map((pose: any) => ({
        id: pose.poseId,
        name: pose.name,
        image: pose.image, // Base64 이미지 (배경 제거 완료)
      }));

      // 포즈 모음에 추가 (썸네일 포함)
      const newCollection = {
        id: `collection-${Date.now()}`,
        name: `생성된 포즈 모음 ${poseCollections.length + 1}`,
        poses: poses,
        thumbnail: uploadedPersonImage, // 업로드된 인물 이미지를 썸네일로 저장
      };
      setPoseCollections((prev) => [...prev, newCollection]);
      setSelectedCollectionIndex(poseCollections.length); // 새로 추가된 모음 선택
      
      setGeneratedPoses(poses);

      // 포즈를 카테고리로 묶기
      const categories: PoseCategory[] = [
        {
          id: 'all',
          name: '전체 포즈',
          poses: poses,
        },
      ];
      setPoseCategories(categories);
      setSelectedPoseIndex(0);
      // 각 슬롯별 기본 포즈 인덱스 초기화 (0, 1, 2, 3)
      setSlotPoseIndices([0, 1, 2, 3]);

      // 포즈 생성 완료 후 업로드된 이미지 초기화
      setUploadedPersonImage(null);

    } catch (error: any) {
      console.error('포즈 생성 에러:', error);
      alert(`포즈 생성 실패: ${error.message}`);
    } finally {
      setIsGeneratingPoses(false);
    }
  };

  // 프레임 초기화 (PhotoBooth 프레임 시스템 사용)
  useEffect(() => {
    const photoAreas: PhotoArea[] = [
      { id: '1', x: 0, y: 0, width: 0, height: 0 },
      { id: '2', x: 0, y: 0, width: 0, height: 0 },
      { id: '3', x: 0, y: 0, width: 0, height: 0 },
      { id: '4', x: 0, y: 0, width: 0, height: 0 },
    ];
    
    const currentFrame = THEME_FRAMES[theme][selectedFrameIndex];
    const frame: FrameInfo = {
      id: `${theme}-${currentFrame.id}`,
      name: `${currentFrame.label} 프레임`,
      image: '',
      photoAreas,
    };
    
    setFrameInfo(frame);
  }, [theme, selectedFrameIndex]);

  // 레이아웃에 따른 촬영 수 결정
  const getShotCount = () => {
    switch (selectedLayout) {
      case 'full1':
        return 1;
      case 'half4':
      case 'grid4':
        return 4;
      default:
        return 4;
    }
  };

  // 레이아웃별 기본 크기와 범위
  const getLayoutScaleConfig = () => {
    switch (selectedLayout) {
      case 'grid4': // 풀 4컷
        return {
          default: 1.0, // 100%
          min: 0.5,     // 50%
          max: 1.5,     // 150%
        };
      case 'half4': // 반 4컷
        return {
          default: 0.5, // 50%
          min: 0.25,    // 25%
          max: 1.5,     // 150%
        };
      case 'full1': // 풀 1컷
        return {
          default: 1.5, // 150%
          min: 1.0,     // 100%
          max: 3.0,     // 300%
        };
      default:
        return {
          default: 0.5,
          min: 0.25,
          max: 1.5,
        };
    }
  };

  // 레이아웃 변경 시 포즈 위치 배열 길이 조정 및 크기 초기화
  useEffect(() => {
    const shotCount = getShotCount();
    const scaleConfig = getLayoutScaleConfig();
    setPosePositions((prev) => {
      // 항상 레이아웃에 맞는 기본 크기로 초기화
      const newPositions = new Array(shotCount).fill(null).map((_, idx) => ({
        x: prev[idx]?.x || 0,
        y: prev[idx]?.y || 0,
        scale: scaleConfig.default, // 레이아웃별 기본 크기로 초기화
        flipped: prev[idx]?.flipped || false,
      }));
      return newPositions;
    });
    // 슬롯별 포즈 인덱스도 초기화
    setSlotPoseIndices((prev) => {
      const newIndices = new Array(shotCount).fill(null).map((_, idx) => 
        prev[idx] !== undefined ? prev[idx] : idx
      );
      return newIndices;
    });
  }, [selectedLayout]);

  // 촬영 시작
  const startPhotoSession = () => {
    isCapturingRef.current = false; // 촬영 플래그 초기화
    const shotCount = getShotCount();
    setImages(new Array(shotCount).fill('')); // 레이아웃에 따라 배열 길이 결정
    setCurrentShot(0);
    setStatus('countdown');
    setCountdown(3);
    // 포즈 위치는 초기화하지 않음 (사용자가 설정한 값 유지)
    clearFocus();
    setIsDragging(false);
    setDraggingSlotIndex(null);
    dragStartRef.current = null;
  };

  // 포즈 포커스 핸들러 (포즈 클릭 시)
  const handlePoseFocus = (e: React.MouseEvent, slotIndex: number) => {
    e.stopPropagation();
    // 포즈가 있는 슬롯만 포커스 가능
    const poseForSlot = generatedPoses[(selectedPoseIndex || 0) + slotIndex] || currentPose;
    if (!poseForSlot) return;
    
    focusedPoseSlotRef.current = slotIndex; // ref 즉시 업데이트
    setFocusedPoseSlot(slotIndex);
  };

  // 포커스 해제 헬퍼 함수
  const clearFocus = () => {
    focusedPoseSlotRef.current = null;
    setFocusedPoseSlot(null);
  };

  // 배경 클릭 시 포커스 해제
  const handleBackgroundClick = (e: React.MouseEvent, slotIndex: number) => {
    // 포즈나 슬라이더가 아닌 영역 클릭 시 포커스 해제
    const target = e.target as HTMLElement;
    const clickedPose = target.closest('.pose-container');
    const clickedSlider = target.closest('.scale-slider');
    
    // 포즈나 슬라이더가 아닌 영역을 클릭한 경우에만 포커스 해제
    if (!clickedPose && !clickedSlider) {
      clearFocus();
    }
  };

  // 포즈 드래그 시작 (마우스 및 터치 지원) - 최종 개선 버전
  const handlePoseDragStart = (clientX: number, clientY: number, slotIndex: number, slotElement: HTMLElement) => {
    const slotRect = slotElement.getBoundingClientRect();
    const currentPos = posePositions[slotIndex];
    const visualPoseSize = 128 * currentPos.scale; // 시각적 크기

    setIsDragging(true);
    setDraggingSlotIndex(slotIndex);

    // 슬롯 기준 마우스 좌표
    const slotRelativeX = clientX - slotRect.left;
    const slotRelativeY = clientY - slotRect.top;

    // 포즈의 top-left 좌표 계산 (bottom 저장 방식을 top으로 변환)
    const poseTopY = slotRect.height - currentPos.y - visualPoseSize;

    // 클릭한 지점의 포즈 내부 오프셋 저장
    dragStartRef.current = {
      x: slotRelativeX - currentPos.x,
      y: slotRelativeY - poseTopY,
    };

    // 공통 이동 핸들러
    const handleMove = (moveClientX: number, moveClientY: number) => {
      if (!dragStartRef.current) return;

      const currentSlotRect = slotElement.getBoundingClientRect();
      const dragOffset = dragStartRef.current;

      // 현재 마우스 위치 (슬롯 기준)
      const currentSlotX = moveClientX - currentSlotRect.left;
      const currentSlotY = moveClientY - currentSlotRect.top;

      setPosePositions((prev) => {
        const pos = prev[slotIndex];
        const visualSize = 128 * pos.scale;

        // 포즈의 새 top-left 위치 = 마우스 위치 - 드래그 오프셋
        let newLeftX = currentSlotX - dragOffset.x;
        let newTopY = currentSlotY - dragOffset.y;

        // bottom 저장 방식으로 변환
        let newBottomY = currentSlotRect.height - newTopY - visualSize;

        // 슬롯 경계 내로 제한
        const maxLeft = currentSlotRect.width - visualSize;
        const maxBottom = currentSlotRect.height - visualSize;

        newLeftX = Math.max(0, Math.min(maxLeft, newLeftX));
        newBottomY = Math.max(0, Math.min(maxBottom, newBottomY));

        return prev.map((p, idx) =>
          idx === slotIndex ? { ...p, x: newLeftX, y: newBottomY } : p
        );
      });
    };
    
    // mousemove 핸들러
    const handleMouseMove = (moveEvent: MouseEvent) => {
      moveEvent.preventDefault();
      moveEvent.stopPropagation();
      handleMove(moveEvent.clientX, moveEvent.clientY);
    };

    // touchmove 핸들러
    const handleTouchMove = (moveEvent: TouchEvent) => {
      moveEvent.preventDefault();
      moveEvent.stopPropagation();
      if (moveEvent.touches.length > 0) {
        handleMove(moveEvent.touches[0].clientX, moveEvent.touches[0].clientY);
      }
    };

    // mouseup 핸들러
    const handleMouseUp = (upEvent: MouseEvent) => {
      upEvent.preventDefault();
      upEvent.stopPropagation();

      // 이벤트 리스너 제거
      document.removeEventListener('mousemove', handleMouseMove, { capture: true });
      document.removeEventListener('mouseup', handleMouseUp, { capture: true });
      document.removeEventListener('touchmove', handleTouchMove, { capture: true });
      document.removeEventListener('touchend', handleTouchEnd, { capture: true });

      // 상태 초기화
      setIsDragging(false);
      setDraggingSlotIndex(null);
      dragStartRef.current = null;
    };

    // touchend 핸들러
    const handleTouchEnd = (endEvent: TouchEvent) => {
      endEvent.preventDefault();
      endEvent.stopPropagation();

      // 이벤트 리스너 제거
      document.removeEventListener('mousemove', handleMouseMove, { capture: true });
      document.removeEventListener('mouseup', handleMouseUp, { capture: true });
      document.removeEventListener('touchmove', handleTouchMove, { capture: true });
      document.removeEventListener('touchend', handleTouchEnd, { capture: true });

      // 상태 초기화
      setIsDragging(false);
      setDraggingSlotIndex(null);
      dragStartRef.current = null;
    };

    // 이벤트 리스너 즉시 등록 (마우스 및 터치 모두 지원)
    document.addEventListener('mousemove', handleMouseMove, { passive: false, capture: true });
    document.addEventListener('mouseup', handleMouseUp, { passive: false, capture: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false, capture: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: false, capture: true });
  };


  // 포즈가 처음 생성될 때만 초기화
  const isPoseInitializedRef = useRef(false);
  useEffect(() => {
    if (generatedPoses.length > 0 && !isPoseInitializedRef.current) {
      // 포즈가 처음 생성될 때만 초기화
      setPosePositions(new Array(4).fill(null).map(() => ({ x: 0, y: 0, scale: 0.5, flipped: false })));
      isPoseInitializedRef.current = true;
    }
  }, [generatedPoses.length]); // generatedPoses가 처음 생성될 때만 실행

  // 포즈 포커스 시 페이지 스크롤 비활성화
  useEffect(() => {
    if (focusedPoseSlot !== null) {
      // 스크롤 비활성화
      document.body.style.overflow = 'hidden';
    } else {
      // 스크롤 활성화
      document.body.style.overflow = '';
    }

    // 컴포넌트 언마운트 시 스크롤 복원
    return () => {
      document.body.style.overflow = '';
    };
  }, [focusedPoseSlot]);

  // 프레임 외부 클릭 시 포커스 해제
  useEffect(() => {
    if (status === 'countdown' || status === 'capturing') return;
    
    const handleDocumentClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const clickedPose = target.closest('.pose-container');
      const clickedSlider = target.closest('.scale-slider');
      const clickedSlot = target.closest('.slot-container');
      
      // 포즈, 슬라이더, 슬롯이 아닌 영역을 클릭한 경우 포커스 해제 및 드래그 종료
      if (!clickedPose && !clickedSlider && !clickedSlot) {
        // 드래그 중이면 종료
        if (isDragging) {
          setIsDragging(false);
          setDraggingSlotIndex(null);
          dragStartRef.current = null;
        }
        // 포커스 해제
        if (focusedPoseSlot !== null) {
          clearFocus();
        }
      }
    };

    document.addEventListener('click', handleDocumentClick, true);

    return () => {
      document.removeEventListener('click', handleDocumentClick, true);
    };
  }, [status, focusedPoseSlot, isDragging]);

  // 포즈 크기 조정 (슬라이더 & 마우스 휠) - 개선된 버전
  const adjustPoseScale = (slotIndex: number, newScale: number, centerOnMouse: { x: number; y: number } | null = null) => {
    const slotElement = document.querySelector(`[data-slot-index="${slotIndex}"]`) as HTMLElement;
    if (!slotElement) return;

    const slotRect = slotElement.getBoundingClientRect();
    const scaleConfig = getLayoutScaleConfig();

    // 스케일 범위 제한
    const clampedScale = Math.max(scaleConfig.min, Math.min(scaleConfig.max, newScale));

    setPosePositions((prev) => {
      const currentPos = prev[slotIndex];
      const oldPoseSize = 128 * currentPos.scale;
      const newPoseSize = 128 * clampedScale;

      let newX = currentPos.x;
      let newY = currentPos.y;

      // 마우스 위치 기준 확대/축소 (휠 이벤트)
      if (centerOnMouse) {
        const mouseX = centerOnMouse.x - slotRect.left;
        const mouseY = centerOnMouse.y - slotRect.top;

        // 현재 포즈 위치 (top-left)
        const currentTopY = slotRect.height - currentPos.y - oldPoseSize;

        // 마우스 위치의 포즈 내 상대 위치 (0~1)
        const relX = (mouseX - currentPos.x) / oldPoseSize;
        const relY = (mouseY - currentTopY) / oldPoseSize;

        // 새 포즈 위치 계산 (마우스 위치를 중심으로)
        const newTopX = mouseX - (relX * newPoseSize);
        const newTopY = mouseY - (relY * newPoseSize);

        newX = newTopX;
        newY = slotRect.height - newTopY - newPoseSize;
      } else {
        // 슬라이더: 왼쪽-하단 고정 (transformOrigin과 일치)
        // x는 그대로 유지, y는 그대로 유지 (bottom 기준이므로)
        // 단, 경계를 벗어나지 않도록만 확인
        newX = currentPos.x;
        newY = currentPos.y;
      }

      // 경계 제한 (부드럽게 조정)
      const maxX = slotRect.width - newPoseSize;
      const maxY = slotRect.height - newPoseSize;

      // 경계를 벗어난 경우에만 조정
      if (newX > maxX) newX = maxX;
      if (newX < 0) newX = 0;
      if (newY > maxY) newY = maxY;
      if (newY < 0) newY = 0;

      const newPositions = [...prev];
      newPositions[slotIndex] = {
        ...currentPos,
        x: newX,
        y: newY,
        scale: clampedScale,
      };
      return newPositions;
    });
  };

  // 마우스 휠로 포즈 크기 조정
  const handlePoseWheel = (e: React.WheelEvent, slotIndex: number) => {
    e.preventDefault();
    e.stopPropagation();

    const currentPos = posePositions[slotIndex];
    const scaleConfig = getLayoutScaleConfig();
    const delta = -e.deltaY * 0.001; // 휠 방향 (위로: +, 아래로: -)
    const newScale = currentPos.scale + delta;

    // 범위 내에서만 조정
    if (newScale >= scaleConfig.min && newScale <= scaleConfig.max) {
      adjustPoseScale(slotIndex, newScale, { x: e.clientX, y: e.clientY });
    }
  };

  // 포즈 좌우 반전
  const togglePoseFlip = (slotIndex: number) => {
    setPosePositions((prev) => {
      const newPositions = [...prev];
      newPositions[slotIndex] = {
        ...newPositions[slotIndex],
        flipped: !newPositions[slotIndex].flipped,
      };
      return newPositions;
    });
  };

  // 포즈 선택 팝업 열기
  const openPoseSelectPopup = (slotIndex: number) => {
    setPoseSelectSlotIndex(slotIndex);
    setShowPoseSelectPopup(true);
  };

  // 포즈 선택 팝업 닫기
  const closePoseSelectPopup = () => {
    setShowPoseSelectPopup(false);
    setPoseSelectSlotIndex(null);
  };

  // 슬롯별 포즈 선택
  const selectPoseForSlot = (slotIndex: number, poseIndex: number) => {
    setSlotPoseIndices((prev) => {
      const newIndices = [...prev];
      newIndices[slotIndex] = poseIndex;
      return newIndices;
    });
    closePoseSelectPopup();
  };

  // 슬롯별 포즈 가져오기
  const getPoseForSlot = (slotIndex: number): Pose | null => {
    if (slotPoseIndices.length > slotIndex && slotPoseIndices[slotIndex] !== undefined) {
      const poseIndex = slotPoseIndices[slotIndex];
      return generatedPoses[poseIndex] || null;
    }
    // 기본값: selectedPoseIndex + slotIndex
    const defaultIndex = (selectedPoseIndex || 0) + slotIndex;
    return generatedPoses[defaultIndex] || generatedPoses[selectedPoseIndex || 0] || null;
  };


  // 촬영 (웹캠 이미지만 저장, 포즈는 레이어로 표시)
  const capture = useCallback(() => {
    // 중복 호출 방지
    if (isCapturingRef.current) {
      console.log('이미 촬영 중입니다.');
      return;
    }

    const imageSrc = webcamRef.current?.getScreenshot();
    if (!imageSrc) {
      console.error('웹캠 스크린샷 실패');
      return;
    }

    isCapturingRef.current = true;

    // 현재 슬롯 인덱스 가져오기
    setCurrentShot((prevShot) => {
      const shotIndex = prevShot;
      
      if (shotIndex >= 4) {
        isCapturingRef.current = false;
        return shotIndex;
      }

      console.log(`촬영 시작: 슬롯 ${shotIndex + 1}`);
      
      setStatus('capturing');
      setFlash(true);
      setTimeout(() => setFlash(false), 150);

      // 웹캠 이미지만 저장 (포즈는 나중에 레이어로 합성)
      setImages((prevImages) => {
        const newImages = [...prevImages];
        newImages[shotIndex] = imageSrc;
        console.log(`이미지 저장 완료: 슬롯 ${shotIndex + 1}`);
        return newImages;
      });

      // 다음 슬롯으로 이동
      const nextShot = shotIndex + 1;
      
      // 다음 촬영 준비 (4개 미만일 때만)
      if (nextShot < 4) {
        setTimeout(() => {
          console.log(`다음 촬영 준비: 슬롯 ${nextShot + 1}`);
          isCapturingRef.current = false;
          setStatus('countdown');
          setCountdown(3);
        }, 1500);
      } else {
        console.log('모든 촬영 완료');
        setTimeout(() => {
          isCapturingRef.current = false;
          setStatus('finished');
        }, 500);
      }

      return nextShot;
    });
  }, []);

  // 카운트다운 타이머
  useEffect(() => {
    if (status !== 'countdown') return;
    
    let timer: NodeJS.Timeout;
    timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          capture();
          return 3;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [status, capture]);

  // 촬영 완료 체크 (백업용)
  useEffect(() => {
    if (currentShot >= 4 && status !== 'finished') {
      const filledImages = images.filter(img => img && img !== '').length;
      if (filledImages >= 4) {
        console.log('촬영 완료 체크: 모든 이미지 촬영됨');
        setStatus('finished');
      }
    }
  }, [currentShot, status, images]);

  // 리셋
  const reset = () => {
    isCapturingRef.current = false; // 촬영 플래그 초기화
    const shotCount = getShotCount();
    setImages(new Array(shotCount).fill(''));
    setStatus('idle');
    setCurrentShot(0);
    setCameraStream(null);
    setPosePositions(new Array(shotCount).fill(null).map(() => ({ x: 0, y: 0, scale: 0.5, flipped: false }))); // 초기 크기 50%, 반전 없음
    clearFocus();
    setIsDragging(false);
    setDraggingSlotIndex(null);
    dragStartRef.current = null;
  };

// VideoPreview 컴포넌트 (PhotoBooth에서 가져옴)
const VideoPreview = ({ stream, style, className }: { stream: MediaStream | null, style?: React.CSSProperties, className?: string }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  
  useEffect(() => {
    const videoEl = videoRef.current;
    if (videoEl && stream) {
      videoEl.srcObject = stream;
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

  const currentFrameStyle = THEME_FRAMES[theme][selectedFrameIndex];
  const currentPose = selectedPoseIndex !== null ? generatedPoses[selectedPoseIndex] : null;

  return (
    <div className="flex flex-col items-center min-h-screen bg-gray-100 p-4">
        <h1 className="text-2xl font-bold mb-6">AI 포즈 스튜디오</h1>
        
        <div className="w-full max-w-6xl space-y-4">
        {/* 2단계: 포즈 모음 선택 */}
        {poseCollections.length > 0 && (
          <div className="bg-white p-6 rounded-xl shadow-md">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold">2단계: 포즈 모음 선택</h2>
              <div className="flex items-center gap-2">
                <input
                  ref={personImageInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePersonImageUpload}
                  className="hidden"
                />
                <button
                  onClick={openTermsPopup}
                  className="w-8 h-8 flex items-center justify-center bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  title="새 포즈 모음 추가"
                >
                  <span className="text-xl font-bold leading-none">+</span>
                </button>
                {uploadedPersonImage && (
                  <div className="flex items-center gap-2">
                    <img src={uploadedPersonImage} alt="ㅊPerson" className="w-8 h-8 object-cover rounded" />
                    <button
                      onClick={generatePoses}
                      disabled={isGeneratingPoses}
                      className="flex items-center gap-1 bg-green-600 text-white px-3 py-1 text-sm rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                      {isGeneratingPoses ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          생성 중...
                        </>
                      ) : (
                        <>
                          <Play className="w-3 h-3" />
                          생성
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-4">
              {/* 포즈 모음 선택 */}
              <div>
                <p className="text-sm text-gray-600 mb-3">포즈 모음을 선택하세요:</p>
                
                {/* 썸네일 그리드 (5xn) */}
                <div className="grid grid-cols-5 gap-3 mb-4">
                  {poseCollections.map((collection, idx) => {
                    // 썸네일이 없으면 첫 번째 포즈 이미지를 썸네일로 사용
                    const thumbnail = collection.thumbnail || collection.poses[0]?.image;
                    const expandedKey = collection.thumbnail || `pose-${idx}`;
                    const isExpanded = displayedThumbnailImage === expandedKey;
                    
                    return (
                      <button
                        key={collection.id}
                        onClick={() => {
                          setSelectedCollectionIndex(idx);
                          setGeneratedPoses(collection.poses);
                          setPoseCategories([{
                            id: 'all',
                            name: '전체 포즈',
                            poses: collection.poses,
                          }]);
                          setSelectedPoseIndex(0);
                          setSlotPoseIndices([0, 1, 2, 3]);
                          // 썸네일 클릭 시 포즈 리스트 토글
                          setDisplayedThumbnailImage(displayedThumbnailImage === expandedKey ? null : expandedKey);
                        }}
                        className={`relative aspect-square rounded-lg border-2 transition-all overflow-hidden ${
                          selectedCollectionIndex === idx
                            ? 'border-blue-500 ring-2 ring-blue-300 shadow-md'
                            : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                        }`}
                      >
                        {thumbnail ? (
                          <img
                            src={thumbnail}
                            alt={collection.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                            <span className="text-gray-400 text-xs">이미지 없음</span>
                          </div>
                        )}
                        {/* 선택 표시 */}
                        {selectedCollectionIndex === idx && (
                          <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center pointer-events-none">
                            <div className="bg-blue-500 rounded-full p-1">
                              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
                
                {/* 포즈 리스트 (썸네일 그리드 하단에 표시) */}
                {displayedThumbnailImage && (() => {
                  const expandedCollection = poseCollections.find((collection, idx) => {
                    const expandedKey = collection.thumbnail || `pose-${idx}`;
                    return displayedThumbnailImage === expandedKey;
                  });
                  
                  if (!expandedCollection) return null;
                  
                  return (
                    <div 
                      className="bg-gray-100 rounded-lg border border-gray-200 p-4 shadow-lg"
                      style={{
                        animation: 'slideIn 0.3s ease-out',
                      }}
                    >
                      <p className="text-sm font-semibold text-gray-700 mb-3">{expandedCollection.name}</p>
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {expandedCollection.poses.map((pose, poseIdx) => (
                          <div
                            key={pose.id}
                            className="flex-shrink-0 w-20 h-20 sm:w-24 sm:h-24 bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                            onClick={() => {
                              // 포즈 선택 시 해당 포즈 모음을 활성화
                              const collectionIndex = poseCollections.findIndex(c => c.id === expandedCollection.id);
                              if (collectionIndex !== -1) {
                                setSelectedCollectionIndex(collectionIndex);
                                setGeneratedPoses(expandedCollection.poses);
                                setPoseCategories([{
                                  id: 'all',
                                  name: '전체 포즈',
                                  poses: expandedCollection.poses,
                                }]);
                                setSelectedPoseIndex(poseIdx);
                                setSlotPoseIndices([poseIdx, poseIdx, poseIdx, poseIdx]);
                              }
                            }}
                          >
                            <img
                              src={pose.image}
                              alt={pose.name}
                              className="w-full h-full object-contain"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
              
              {/* 레이아웃 선택 */}
              <div>
                <p className="text-sm text-gray-600 mb-2">레이아웃 선택:</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedLayout('grid4')}
                    className={`px-4 py-2 rounded-lg border-2 transition-all ${
                      selectedLayout === 'grid4'
                        ? 'border-blue-500 bg-blue-50 text-blue-700 font-semibold'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    4컷 (2x2)
                  </button>
                  <button
                    onClick={() => setSelectedLayout('half4')}
                    className={`px-4 py-2 rounded-lg border-2 transition-all ${
                      selectedLayout === 'half4'
                        ? 'border-blue-500 bg-blue-50 text-blue-700 font-semibold'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    반 4컷 (세로)
                  </button>
                  <button
                    onClick={() => setSelectedLayout('full1')}
                    className={`px-4 py-2 rounded-lg border-2 transition-all ${
                      selectedLayout === 'full1'
                        ? 'border-blue-500 bg-blue-50 text-blue-700 font-semibold'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    풀 1컷
                  </button>
                </div>
              </div>
              
              {/* 프레임 선택 */}
              <div>
                <p className="text-sm text-gray-600 mb-2">프레임 선택:</p>
                <div className="flex gap-3 items-center">
                  {THEME_FRAMES[theme].map((frame, idx) => (
                    <button
                      key={frame.id}
                      onClick={() => setSelectedFrameIndex(idx)}
                      className={`w-8 h-8 rounded-full border-2 transition-all hover:scale-110 ${
                        idx === selectedFrameIndex
                          ? 'scale-110 ring-2 ring-offset-2 ring-blue-400 border-transparent'
                          : 'border-gray-300 opacity-80 hover:opacity-100'
                      } ${frame.bg}`}
                      style={frame.style}
                      title={frame.label}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 3단계: 프레임 내 촬영 (PhotoBooth 스타일) */}
        {currentPose && (
          <div className="bg-white p-6 rounded-xl shadow-md">
            <h2 className="text-lg font-bold mb-3">
              {status === 'finished' ? '촬영 완료' : '3단계: 촬영'}
            </h2>
            
            {/* 숨겨진 웹캠 */}
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

            {/* 프레임 */}
            <div 
              ref={frameRef}
              className={`p-4 pb-12 transition-all duration-300 relative ${currentFrameStyle.bg} ${currentFrameStyle.border}`}
              style={{
                ...(currentFrameStyle.style || {}),
                minWidth: selectedLayout === 'half4' ? '180px' : '340px',
              }}
            >
              {/* 프레임 헤더 */}
              <div className="flex justify-between items-center mb-3 px-1">
                <span className={`text-xs font-mono opacity-50 ${currentFrameStyle.text}`}>
                  {new Date().toLocaleDateString()}
                </span>
                <span className={`text-xs font-bold ${currentFrameStyle.text}`}>
                  KIMTOKKI
                </span>
              </div>

              {/* 레이아웃에 따른 그리드 영역 */}
              <div className={`grid gap-2 ${
                selectedLayout === 'full1' 
                  ? 'grid-cols-1 w-[300px]' 
                  : selectedLayout === 'half4' 
                    ? 'grid-cols-1 w-[150px]' 
                    : 'grid-cols-2 w-[300px]'
              }`}>
                {Array.from({ length: getShotCount() }).map((_, idx) => {
                  const isCurrentShot = idx === currentShot && (status === 'countdown' || status === 'capturing');
                  const image = images[idx];
                  const poseForThisSlot = getPoseForSlot(idx) || currentPose;

                  return (
                    <div 
                      key={idx} 
                      className={`relative overflow-hidden group slot-container ${
                        selectedLayout === 'full1' 
                          ? 'aspect-[3/4]' 
                          : selectedLayout === 'half4' 
                            ? 'aspect-[3/2]' 
                            : 'aspect-[3/4]'
                      }`}
                      data-slot-index={idx}
                      onClick={(e) => {
                        // 포즈나 슬라이더가 아닌 영역 클릭 시에만 포커스 해제
                        const target = e.target as HTMLElement;
                        const clickedPose = target.closest('.pose-container');
                        const clickedSlider = target.closest('.scale-slider');
                        
                        if (!clickedPose && !clickedSlider && status !== 'countdown' && status !== 'capturing') {
                          handleBackgroundClick(e, idx);
                        }
                      }}
                    >
                      {/* LAYER1: 배경 */}
                      <div className="absolute inset-0 bg-gray-100" />
                      
                      {/* LAYER2: 촬영 사진 */}
                      {image && image !== '' ? (
                        <div className="absolute inset-0 z-0">
                          <img 
                            src={image} 
                            alt={`snap-${idx}`} 
                            className="w-full h-full object-cover transform scale-x-[-1]"
                          />
                        </div>
                      ) : isCurrentShot ? (
                        <div className="absolute inset-0 z-0">
                          <VideoPreview 
                            stream={cameraStream}
                            className="w-full h-full object-cover transform scale-x-[-1]"
                          />
                          {/* 카운트다운 오버레이 */}
                          {status === 'countdown' && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/20 z-10">
                              <span className={`text-6xl font-bold text-white animate-bounce drop-shadow-lg ${theme === 'neon' && "text-[#0ff] shadow-[0_0_10px_#0ff]"}`}>
                                {countdown}
                              </span>
                            </div>
                          )}
                          {/* 플래시 효과 */}
                          {flash && <div className="absolute inset-0 bg-white opacity-90 animate-flash pointer-events-none z-20" />}
                        </div>
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center z-0">
                          <span className="text-2xl font-bold opacity-20">{idx + 1}</span>
                        </div>
                      )}
                      
                      {/* LAYER3: 포즈 (항상 표시, 포커스 시 드래그 및 크기 조절 가능) */}
                      {poseForThisSlot && (() => {
                        const posePos = posePositions[idx] || { x: 0, y: 0, scale: 0.5, flipped: false };
                        return (
                        <div
                          className={`pose-container absolute z-30 transition-all ${
                            focusedPoseSlot === idx
                              ? 'ring-2 ring-blue-500 ring-offset-2 cursor-move'
                              : 'cursor-pointer hover:ring-2 hover:ring-blue-300 hover:ring-offset-1'
                          }`}
                          style={{
                            left: `${posePos.x}px`,
                            bottom: `${posePos.y}px`,
                            transform: `scale(${posePos.scale})`,
                            transformOrigin: 'left bottom',
                            opacity: status === 'countdown' || status === 'capturing' ? 0.7 : 1,
                            pointerEvents: 'auto',
                            border: 'none',
                            padding: 0,
                            margin: 0,
                          }}
                          onClick={(e) => {
                            if (isDragging || focusedPoseSlot === idx) {
                              e.preventDefault();
                              e.stopPropagation();
                            }
                          }}
                          onWheel={(e) => {
                            // 포커스된 포즈만 휠로 크기 조절 가능
                            if (focusedPoseSlot === idx && status !== 'countdown' && status !== 'capturing') {
                              handlePoseWheel(e, idx);
                            }
                          }}
                          onMouseDown={(e) => {
                            const isFocused = focusedPoseSlotRef.current === idx;

                            // 촬영 중이 아닐 때만 처리
                            if (status === 'countdown' || status === 'capturing') {
                              return;
                            }

                            // 포커스되지 않은 포즈는 포커스만 설정
                            if (!isFocused) {
                              e.stopPropagation();
                              handlePoseFocus(e, idx);
                              return;
                            }

                            // 포커스된 포즈는 드래그 시작
                            e.stopPropagation();

                            const slotElement = document.querySelector(`[data-slot-index="${idx}"]`) as HTMLElement;
                            if (slotElement) {
                              handlePoseDragStart(e.clientX, e.clientY, idx, slotElement);
                            }
                          }}
                          onTouchStart={(e) => {
                            const isFocused = focusedPoseSlotRef.current === idx;

                            // 촬영 중이 아닐 때만 처리
                            if (status === 'countdown' || status === 'capturing') {
                              return;
                            }

                            // 포커스되지 않은 포즈는 포커스만 설정
                            if (!isFocused) {
                              e.stopPropagation();
                              handlePoseFocus(e as any, idx);
                              return;
                            }

                            // 포커스된 포즈는 드래그 시작
                            e.stopPropagation();

                            if (e.touches.length > 0) {
                              const slotElement = document.querySelector(`[data-slot-index="${idx}"]`) as HTMLElement;
                              if (slotElement) {
                                handlePoseDragStart(e.touches[0].clientX, e.touches[0].clientY, idx, slotElement);
                              }
                            }
                          }}
                        >
                          <img
                            src={poseForThisSlot.image}
                            alt={poseForThisSlot.name}
                            className="object-contain select-none pointer-events-none"
                            draggable={false}
                            style={{ 
                              width: '128px',
                              height: '128px',
                              opacity: 1,
                              transform: posePos.flipped ? 'scaleX(-1)' : 'none',
                              filter: focusedPoseSlot === idx 
                                ? 'drop-shadow(0 0 8px rgba(59, 130, 246, 0.8)) drop-shadow(2px 2px 4px rgba(0,0,0,0.5))'
                                : 'drop-shadow(2px 2px 4px rgba(0,0,0,0.5))'
                            }}
                          />
                        </div>
                        );
                      })()}
                      
                      {/* 크기 조절 슬라이더 (포커스된 포즈만 표시, 촬영 중이거나 드래그 중이 아닐 때만) - 레이아웃별 범위 적용, 포즈 위치에 따라 상단/하단 자동 조정 */}
                      {status !== 'countdown' && status !== 'capturing' && focusedPoseSlot === idx && !isDragging && poseForThisSlot && (() => {
                        const posePos = posePositions[idx] || { x: 0, y: 0, scale: 0.5, flipped: false };
                        const scaleConfig = getLayoutScaleConfig();
                        const minPercent = scaleConfig.min * 100;
                        const maxPercent = scaleConfig.max * 100;
                        const currentPercent = posePos.scale * 100;
                        const range = maxPercent - minPercent;
                        const gradientPercent = ((currentPercent - minPercent) / range) * 100;
                        return (
                        <div
                          className="scale-slider absolute bg-white/90 rounded-lg shadow-lg p-2 pointer-events-auto z-50"
                          style={{
                            width: 'calc(100% - 16px)',
                            maxWidth: '200px',
                            left: '8px',
                            ...(posePos.y > 100
                              ? { bottom: '8px', top: 'auto' }
                              : { top: '8px', bottom: 'auto' }
                            ),
                          }}
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-end gap-2 mb-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openPoseSelectPopup(idx);
                              }}
                              onMouseDown={(e) => e.stopPropagation()}
                              className="text-xs px-2 py-1 bg-purple-500 text-white rounded hover:bg-purple-600 transition-colors"
                              title="포즈 변경"
                            >
                              포즈 변경
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                togglePoseFlip(idx);
                              }}
                              onMouseDown={(e) => e.stopPropagation()}
                              className="text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                              title="좌우 반전"
                            >
                              {posePos.flipped ? '↔ 반전됨' : '↔ 반전'}
                            </button>
                          </div>
                          <input
                            type="range"
                            min={minPercent}
                            max={maxPercent}
                            step="5"
                            value={currentPercent}
                            onChange={(e) => {
                              const newScale = parseInt(e.target.value) / 100;
                              adjustPoseScale(idx, newScale, null);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                            style={{
                              background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${gradientPercent}%, #e5e7eb ${gradientPercent}%, #e5e7eb 100%)`
                            }}
                          />
                          <div className="text-xs text-gray-500 text-center mt-1">
                            💡 마우스 휠로도 크기 조절 가능
                          </div>
                        </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>

              {/* 프레임 푸터 */}
              <div className="mt-5 text-center">
                <h2 className={`text-xl font-bold tracking-tighter ${currentFrameStyle.text}`}>
                  {theme === 'simple' ? 'MOMENTS' : theme === 'neon' ? 'CYBER PUNK' : 'MY BEST MOMENT'}
                </h2>
              </div>
            </div>

            {/* 포즈 선택 팝업 */}
            {showPoseSelectPopup && poseSelectSlotIndex !== null && (
              <div 
                className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
                onClick={closePoseSelectPopup}
              >
                <div 
                  className="bg-white rounded-2xl shadow-2xl p-4 sm:p-6 max-w-2xl w-full max-h-[85vh] overflow-y-auto"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex justify-between items-center mb-4 sm:mb-6">
                    <h3 className="text-lg sm:text-xl font-bold text-gray-800">포즈 선택</h3>
                    <button
                      onClick={closePoseSelectPopup}
                      className="text-gray-500 hover:text-gray-700 text-3xl font-bold leading-none w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
                    >
                      ×
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                    {generatedPoses.map((pose, poseIdx) => {
                      const isSelected = slotPoseIndices[poseSelectSlotIndex] === poseIdx;
                      return (
                        <button
                          key={pose.id}
                          onClick={() => selectPoseForSlot(poseSelectSlotIndex, poseIdx)}
                          className={`group relative p-3 sm:p-4 rounded-xl border-2 transition-all transform hover:scale-105 active:scale-95 ${
                            isSelected
                              ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-300 shadow-md'
                              : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50 hover:shadow-sm'
                          }`}
                        >
                          <div className="aspect-square w-full mb-2 sm:mb-3 flex items-center justify-center bg-gray-50 rounded-lg overflow-hidden">
                            <img
                              src={pose.image}
                              alt={pose.name}
                              className="w-full h-full object-contain"
                            />
                          </div>
                          <p className={`text-xs sm:text-sm text-center font-semibold transition-colors ${
                            isSelected ? 'text-blue-700' : 'text-gray-700 group-hover:text-blue-600'
                          }`}>
                            {pose.name}
                          </p>
                          {isSelected && (
                            <div className="absolute top-2 right-2 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* 이용약관 및 개인정보 처리방침 동의 팝업 */}
            {showTermsPopup && (
              <div 
                className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4"
                onClick={closeTermsPopup}
              >
                <div 
                  className="bg-white rounded-2xl shadow-2xl p-6 max-w-2xl w-full max-h-[90vh] flex flex-col"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-2xl font-bold text-gray-800">이용약관 및 개인정보 처리방침</h3>
                    <button
                      onClick={closeTermsPopup}
                      className="text-gray-500 hover:text-gray-700 text-3xl font-bold leading-none w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
                    >
                      ×
                    </button>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto pr-2 mb-4 space-y-6">
                    {/* 이용약관 */}
                    <div>
                      <h4 className="text-xl font-bold mb-3 text-gray-800">[이용약관]</h4>
                      <div className="text-sm text-gray-700 space-y-4 leading-relaxed">
                        <div>
                          <p className="font-semibold mb-2">제1조 (목적)</p>
                          <p>본 약관은 이용자가 회사(이하 "서비스 제공자")가 제공하는 AI 이미지 변환 서비스(이하 "서비스")를 이용함에 있어 필요한 권리, 의무 및 책임사항을 규정하는 것을 목적으로 합니다.</p>
                        </div>
                        
                        <div>
                          <p className="font-semibold mb-2">제2조 (서비스의 성격 및 책임 범위)</p>
                          <p>본 서비스는 사용자가 업로드한 이미지를 기반으로 포즈 분석·변환 등 AI 연산을 수행하는 기술적 도구이며, 서비스 제공자는 업로드된 이미지 또는 생성된 이미지의 저장·보관·배포를 하지 않습니다. 모든 이미지 처리는 서버 메모리 내에서 일시적으로 수행되며, 연산 종료 후 즉시 삭제됩니다. 업로드된 이미지 및 AI 변환 결과물의 법적 권리(저작권·초상권·퍼블리시티권 등)의 귀속과 책임은 사용자에게 있습니다. 서비스 제공자는 해당 이미지의 성격을 사전에 인지할 수 없으며, 이에 대한 책임을 지지 않습니다.</p>
                        </div>
                        
                        <div>
                          <p className="font-semibold mb-2">제3조 (사용자의 의무)</p>
                          <p>사용자는 다음에 해당하는 이미지를 업로드해서는 안 됩니다.</p>
                          <ul className="list-disc list-inside ml-4 mt-2 space-y-1">
                            <li>타인의 저작권이 있는 이미지</li>
                            <li>타인의 초상권·퍼블리시티권을 침해하는 이미지</li>
                            <li>연예인, 유명인, 공인의 사진</li>
                            <li>불법 촬영물 또는 법령에 위반되는 콘텐츠</li>
                            <li>타인의 허락 없이 촬영된 모든 이미지</li>
                          </ul>
                          <p className="mt-2">사용자가 업로드한 이미지에 대한 모든 법적 책임은 전적으로 사용자에게 있습니다. 사용자는 본 서비스를 이용하여 생성된 콘텐츠를 배포·공유·재사용할 때, 저작권 및 관련 법령을 준수해야 합니다.</p>
                        </div>
                        
                        <div>
                          <p className="font-semibold mb-2">제4조 (AI 생성 결과물의 성격과 책임)</p>
                          <p>서비스가 생성하는 결과물은 사용자가 업로드한 이미지의 포즈·구성 정보를 기반으로 자동 처리된 결과물이며, 서비스 제공자는 결과물의 정확성·품질·법적 안전성에 대해 어떠한 보증도 하지 않습니다. 결과물은 오직 사용자의 개인적인 목적으로만 사용할 수 있으며, 상업적 사용 시 발생하는 모든 법적 책임은 사용자에게 있습니다. 서비스 제공자는 결과물이 특정 인물(예: 연예인)을 연상시키거나 유사하게 나타난 경우에도 이에 대해 책임을 지지 않습니다.</p>
                        </div>
                        
                        <div>
                          <p className="font-semibold mb-2">제5조 (연예인/공인 이미지 처리 제한)</p>
                          <p>서비스는 기술적으로 연예인·공인의 얼굴을 인식 또는 판별할 수 없으며, 사용자가 해당 이미지를 업로드할 경우 발생하는 책임은 사용자에게 있습니다. 서비스 제공자는 연예인·공인·타인의 얼굴이 포함된 이미지를 처리하는 과정에서 발생하는 초상권/퍼블리시티권 침해에 대해 어떠한 책임도 부담하지 않습니다.</p>
                        </div>
                        
                        <div>
                          <p className="font-semibold mb-2">제6조 (저장 금지 및 데이터 삭제 정책)</p>
                          <p>본 서비스는 업로드된 이미지 및 AI 생성 결과물을 서버·DB·스토리지에 저장하지 않으며, 처리된 모든 데이터는 서비스 제공 과정 종료 후 즉시 삭제됩니다. 사용자에게 제공된 다운로드 파일은 사용자 단말에만 저장되며, 그 보관·사용·삭제에 대한 책임은 전적으로 사용자에게 있습니다. 로그 및 데이터 분석 목적으로 이미지 정보는 활용되지 않으며, 업로드·결과 이미지 파일 자체는 서버에 보관되지 않습니다.</p>
                        </div>
                        
                        <div>
                          <p className="font-semibold mb-2">제7조 (콘텐츠 신고 및 차단)</p>
                          <p>서비스는 위법·유해 콘텐츠 신고 기능을 제공할 수 있으며, 신고된 콘텐츠는 내부 기준에 따라 처리될 수 있습니다. 위법성이 명백한 콘텐츠 업로드가 반복되는 경우, 서비스 제공자는 사용자의 서비스 이용을 제한할 수 있습니다.</p>
                        </div>
                        
                        <div>
                          <p className="font-semibold mb-2">제8조 (면책 조항)</p>
                          <p>사용자가 본 서비스를 이용하여 생성·활용·배포한 모든 콘텐츠에 대한 저작권·초상권·퍼블리시티권·상표권 등 관련 법적 책임은 사용자 단독의 책임입니다. 서비스 제공자는 다음과 같은 사유로 발생한 손해에 대해 책임을 지지 않습니다.</p>
                          <ul className="list-disc list-inside ml-4 mt-2 space-y-1">
                            <li>사용자의 위법한 이미지 업로드</li>
                            <li>초상권·저작권 침해</li>
                            <li>생성된 결과물의 사용으로 인한 민·형사상 분쟁</li>
                            <li>사용자의 기기 또는 네트워크 문제</li>
                          </ul>
                          <p className="mt-2">사용자는 서비스 이용에 따른 모든 법적 위험과 책임을 스스로 부담하는 데 동의합니다.</p>
                        </div>
                        
                        <div>
                          <p className="font-semibold mb-2">제9조 (서비스 중단 및 변경)</p>
                          <p>서비스 제공자는 필요 시 서비스의 전체 또는 일부를 변경·제한·중단할 수 있으며, 이에 따른 손해에 대해 책임을 지지 않습니다.</p>
                        </div>
                        
                        <div>
                          <p className="font-semibold mb-2">제10조 (준거법 및 관할)</p>
                          <p>본 약관은 대한민국 법률을 기준으로 해석되며, 서비스 이용과 관련하여 발생하는 분쟁은 서비스 제공자의 본사 소재지 법원을 관할 법원으로 합니다.</p>
                        </div>
                        
                        <div>
                          <p className="font-semibold mb-2">📌 부칙</p>
                          <p>본 이용약관은 게시된 날로부터 즉시 시행합니다.</p>
                        </div>
                      </div>
                    </div>
                    
                    {/* 개인정보 처리방침 */}
                    <div>
                      <h4 className="text-xl font-bold mb-3 text-gray-800">[개인정보 처리방침]</h4>
                      <div className="text-sm text-gray-700 space-y-4 leading-relaxed">
                        <div>
                          <p className="font-semibold mb-2">1. 총칙</p>
                          <p>본 개인정보 처리방침은 서비스 제공자(이하 "회사")가 제공하는 AI 이미지 변환 서비스(이하 "서비스")에서 이용자의 개인정보를 어떻게 수집, 이용, 보호하는지를 설명합니다. 회사는 개인정보보호법, 정보통신망 이용촉진 및 정보보호 등에 관한 법률 등 대한민국 관련 법령을 준수합니다.</p>
                        </div>
                        
                        <div>
                          <p className="font-semibold mb-2">2. 수집하는 개인정보 항목</p>
                          <p>회사는 서비스 제공을 위해 아래의 최소한의 개인정보만을 수집합니다.</p>
                          <p className="mt-2"><strong>① 필수 수집 항목</strong></p>
                          <ul className="list-disc list-inside ml-4 mt-1 space-y-1">
                            <li>이메일 주소 또는 계정 ID (회원가입/로그인 시)</li>
                            <li>서비스 이용기록(로그, 접속 시간, 접속 국가 등)</li>
                            <li>기기 정보(브라우저, OS, 단말기 모델 등)</li>
                          </ul>
                          <p className="mt-2"><strong>② 선택 수집 항목</strong></p>
                          <ul className="list-disc list-inside ml-4 mt-1 space-y-1">
                            <li>프로필 사진, 닉네임(사용자가 직접 입력 시)</li>
                          </ul>
                          <p className="mt-2"><strong>③ 이미지/영상 처리 관련</strong></p>
                          <p>사용자가 업로드한 이미지 파일은 개인정보로 취급되지 않으며, 서버에 저장되지 않고 메모리에서 일시적으로 처리된 후 즉시 삭제됩니다.</p>
                        </div>
                        
                        <div>
                          <p className="font-semibold mb-2">3. 개인정보 수집 방법</p>
                          <p>회사는 다음과 같은 방법으로 개인정보를 수집합니다.</p>
                          <ul className="list-disc list-inside ml-4 mt-2 space-y-1">
                            <li>이용자가 회원가입 또는 서비스 이용 시 직접 입력</li>
                            <li>서비스 이용 과정에서 자동으로 생성되는 정보 수집</li>
                            <li>고객센터 문의 시 제공되는 정보</li>
                          </ul>
                        </div>
                        
                        <div>
                          <p className="font-semibold mb-2">4. 개인정보의 이용 목적</p>
                          <p>회사는 수집된 개인정보를 아래 목적 범위 내에서만 이용합니다.</p>
                          <ul className="list-disc list-inside ml-4 mt-2 space-y-1">
                            <li>서비스 제공 및 운영</li>
                            <li>회원 식별 및 본인 확인</li>
                            <li>서비스 개선 및 고객 문의 대응</li>
                            <li>부정 이용 방지</li>
                            <li>법령 준수 및 고지사항 전달</li>
                          </ul>
                          <p className="mt-2">※ 업로드된 이미지 및 생성된 AI 결과물은 계정 식별용이나 데이터 분석 용도로 사용되지 않으며, 서버에 저장되지 않습니다.</p>
                        </div>
                        
                        <div>
                          <p className="font-semibold mb-2">5. 이미지 및 AI 처리 데이터의 처리 방식 (핵심)</p>
                          <p>본 서비스는 사용자가 업로드한 이미지 및 AI 생성 결과물에 대해 다음과 같은 안전장치를 운영합니다.</p>
                          <ul className="list-disc list-inside ml-4 mt-2 space-y-1">
                            <li>이미지 파일은 서버 또는 데이터베이스에 저장하지 않습니다.</li>
                            <li>모든 처리(포즈 분석·변환 등)는 메모리(RAM)에서만 일시적으로 수행됩니다.</li>
                            <li>처리 종료 즉시 이미지 데이터는 완전히 삭제되며, 회사는 이를 보관하지 않습니다.</li>
                            <li>처리된 결과물의 저장·보관·배포 여부는 전적으로 이용자의 단말기 환경에 따릅니다.</li>
                            <li>회사는 업로드된 이미지와 생성 결과물을 내부 데이터 분석·학습·광고·통계 목적에 사용하지 않습니다.</li>
                          </ul>
                        </div>
                        
                        <div>
                          <p className="font-semibold mb-2">6. 개인정보의 보유 및 이용 기간</p>
                          <p>회사는 원칙적으로 이용자의 개인정보를 아래 기준에 따라 보유합니다.</p>
                          <div className="mt-2 overflow-x-auto">
                            <table className="min-w-full border border-gray-300 text-xs">
                              <thead>
                                <tr className="bg-gray-100">
                                  <th className="border border-gray-300 px-2 py-1">항목</th>
                                  <th className="border border-gray-300 px-2 py-1">보유 기간</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr>
                                  <td className="border border-gray-300 px-2 py-1">계정 정보(이메일 등)</td>
                                  <td className="border border-gray-300 px-2 py-1">회원 탈퇴 시 즉시 파기</td>
                                </tr>
                                <tr>
                                  <td className="border border-gray-300 px-2 py-1">서비스 이용 로그</td>
                                  <td className="border border-gray-300 px-2 py-1">3~12개월 (법령 기준)</td>
                                </tr>
                                <tr>
                                  <td className="border border-gray-300 px-2 py-1">결제 정보(유료 서비스 사용 시)</td>
                                  <td className="border border-gray-300 px-2 py-1">5년(전자상거래법 기준)</td>
                                </tr>
                                <tr>
                                  <td className="border border-gray-300 px-2 py-1">이미지/AI 생성 데이터</td>
                                  <td className="border border-gray-300 px-2 py-1">실시간 처리 후 즉시 삭제</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>
                        
                        <div>
                          <p className="font-semibold mb-2">7. 개인정보의 제3자 제공</p>
                          <p>회사는 이용자의 개인정보를 제3자에게 제공하지 않습니다. 단, 다음의 경우는 예외로 합니다.</p>
                          <ul className="list-disc list-inside ml-4 mt-2 space-y-1">
                            <li>이용자가 사전에 동의한 경우</li>
                            <li>법령에 의한 수사기관의 적법한 요청이 있는 경우</li>
                          </ul>
                        </div>
                        
                        <div>
                          <p className="font-semibold mb-2">8. 개인정보 처리의 위탁</p>
                          <p>회사는 안정적인 서비스 제공을 위해 다음 항목에 한해 개인정보 처리를 위탁할 수 있습니다.</p>
                          <ul className="list-disc list-inside ml-4 mt-2 space-y-1">
                            <li>클라우드 서버 운영(AWS, GCP, Azure 등)</li>
                            <li>로그 수집 및 분석 도구 운영</li>
                          </ul>
                          <p className="mt-2">위탁 시 관련 법령에 따라 계약을 체결하여 개인정보 보호 의무를 규정합니다.</p>
                        </div>
                        
                        <div>
                          <p className="font-semibold mb-2">9. 이용자의 권리와 행사 방법</p>
                          <p>이용자는 다음과 같은 권리를 행사할 수 있습니다.</p>
                          <ul className="list-disc list-inside ml-4 mt-2 space-y-1">
                            <li>개인정보 열람 요구</li>
                            <li>개인정보 정정·삭제 요구</li>
                            <li>처리 정지 요구</li>
                            <li>회원 탈퇴 및 계정 삭제 요청</li>
                          </ul>
                          <p className="mt-2">요청 시 회사는 관련 법령에 따라 즉시 조치합니다.</p>
                        </div>
                        
                        <div>
                          <p className="font-semibold mb-2">10. 개인정보의 파기 절차 및 방법</p>
                          <p>회원 탈퇴 시 수집된 개인정보는 즉시 파기합니다. 법령에서 보관이 필요한 항목은 보관 기간 종료 후 파기합니다. 업로드된 이미지 파일은 서버 저장 없이 메모리 처리 후 즉시 삭제됩니다.</p>
                          <p className="mt-2"><strong>파기 방법</strong></p>
                          <ul className="list-disc list-inside ml-4 mt-1 space-y-1">
                            <li>전자적 정보: 복구가 불가능한 방식으로 영구 삭제</li>
                            <li>출력물: 분쇄 또는 소각</li>
                          </ul>
                        </div>
                        
                        <div>
                          <p className="font-semibold mb-2">11. 쿠키(Cookie) 및 추적 기술의 이용</p>
                          <p>회사는 더 나은 사용자 경험을 제공하기 위해 쿠키를 사용할 수 있습니다. 사용자는 브라우저 설정을 통해 쿠키 저장을 거부할 수 있습니다.</p>
                        </div>
                        
                        <div>
                          <p className="font-semibold mb-2">12. 개인정보 보호를 위한 기술적·관리적 보호조치</p>
                          <p>회사는 다음과 같은 보안 조치를 시행합니다.</p>
                          <ul className="list-disc list-inside ml-4 mt-2 space-y-1">
                            <li>데이터 암호화(전송 구간 SSL/TLS)</li>
                            <li>접근 제어 시스템 운영</li>
                            <li>서버 보안 및 네트워크 모니터링</li>
                            <li>정기적인 취약점 점검</li>
                            <li>내부 권한 최소화 정책</li>
                            <li>이미지 파일 비저장 처리 시스템 운영</li>
                          </ul>
                        </div>
                        
                        <div>
                          <p className="font-semibold mb-2">13. 개인정보 보호책임자 및 문의처</p>
                          <p>개인정보 보호 관련 문의는 아래 연락처로 문의하실 수 있습니다.</p>
                          <ul className="list-none ml-4 mt-2 space-y-1">
                            <li><strong>개인정보 보호책임자:</strong> 김현석</li>
                            <li><strong>이메일:</strong> jjangnarana@gmail.com</li>
                            <li><strong>연락처:</strong> 010-3081-7615</li>
                            <li><strong>운영시간:</strong> 평일 10:00~18:00</li>
                          </ul>
                        </div>
                        
                        <div>
                          <p className="font-semibold mb-2">14. 고지의 의무</p>
                          <p>개인정보 처리방침이 변경될 경우, 최소 7일 전 서비스 내 공지사항을 통해 안내합니다. 중요 변경 사항(수집 항목 변경 등)의 경우 최소 30일 전 고지합니다.</p>
                        </div>
                        
                        <div>
                          <p className="font-semibold mb-2">📌 부칙</p>
                          <p>본 개인정보 처리방침은 2025년 11월 25일부터 시행합니다.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* 동의 체크박스 */}
                  <div className="border-t pt-4 space-y-3">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={agreeToTerms}
                        onChange={(e) => setAgreeToTerms(e.target.checked)}
                        className="mt-1 w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">
                        <strong>이용약관</strong>에 동의합니다. (필수)
                      </span>
                    </label>
                    
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={agreeToPrivacy}
                        onChange={(e) => setAgreeToPrivacy(e.target.checked)}
                        className="mt-1 w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">
                        <strong>개인정보 처리방침</strong>에 동의합니다. (필수)
                      </span>
                    </label>
                  </div>
                  
                  {/* 버튼 */}
                  <div className="flex gap-3 mt-4">
                    <button
                      onClick={closeTermsPopup}
                      className="flex-1 py-3 px-4 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                    >
                      취소
                    </button>
                    <button
                      onClick={handleAgreeAndContinue}
                      disabled={!agreeToTerms || !agreeToPrivacy}
                      className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
                        agreeToTerms && agreeToPrivacy
                          ? 'bg-blue-600 text-white hover:bg-blue-700'
                          : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      동의하고 계속하기
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 이미지 업로드/촬영 팝업 */}
            {showImageUploadPopup && (
              <div 
                className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
                onClick={closeImageUploadPopup}
              >
                <div 
                  className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-gray-800">사진을 촬영 | 업로드</h3>
                    <button
                      onClick={closeImageUploadPopup}
                      className="text-gray-500 hover:text-gray-700 text-3xl font-bold leading-none w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
                    >
                      ×
                    </button>
                  </div>
                  
                  <div className="space-y-4">
                    {/* 촬영 모드 */}
                    {captureImageStream && (
                      <div className="space-y-3">
                        <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden">
                          <Webcam
                            audio={false}
                            ref={captureWebcamRef}
                            videoConstraints={{ width: 1280, height: 720, facingMode: "user" }}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <button
                          onClick={capturePhoto}
                          className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold flex items-center justify-center gap-2"
                        >
                          <Camera className="w-5 h-5" />
                          촬영
                        </button>
                      </div>
                    )}
                    
                    {/* 업로드 버튼 */}
                    <div>
                      <input
                        ref={personImageInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handlePersonImageUpload}
                        className="hidden"
                      />
                      <button
                        onClick={handleFileUploadClick}
                        className="w-full py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold flex items-center justify-center gap-2"
                      >
                        <Upload className="w-5 h-5" />
                        업로드
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 이미지 영역 선택 팝업 */}
            {showImageCropPopup && imageToCrop && (
              <div 
                className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4"
                onClick={cancelCrop}
              >
                <div 
                  className="bg-white rounded-2xl shadow-2xl p-6 max-w-3xl w-full max-h-[90vh] overflow-auto"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-gray-800">영역 선택</h3>
                    <button
                      onClick={cancelCrop}
                      className="text-gray-500 hover:text-gray-700 text-3xl font-bold leading-none w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
                    >
                      ×
                    </button>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-gray-600">이미지에서 원하는 영역을 드래그하여 선택하세요</p>
                      {/* 줌 컨트롤 */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleZoomOut}
                          disabled={imageScale <= 0.5}
                          className="w-8 h-8 flex items-center justify-center bg-gray-200 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="줌 아웃"
                        >
                          <span className="text-lg font-bold">−</span>
                        </button>
                        <span className="text-sm font-semibold w-12 text-center">{Math.round(imageScale * 100)}%</span>
                        <button
                          onClick={handleZoomIn}
                          disabled={imageScale >= 3}
                          className="w-8 h-8 flex items-center justify-center bg-gray-200 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="줌 인"
                        >
                          <span className="text-lg font-bold">+</span>
                        </button>
                      </div>
                    </div>
                    
                    <div
                      ref={imageCropContainerRef}
                      className="relative w-full bg-gray-100 rounded-lg overflow-auto"
                      style={{ maxHeight: '60vh' }}
                      onMouseDown={handleImageMouseDown}
                      onMouseMove={handleImageMouseMove}
                      onMouseUp={handleImageMouseUp}
                      onMouseLeave={handleImageMouseUp}
                      onTouchStart={handleImageTouchStart}
                      onTouchMove={handleImageTouchMove}
                      onTouchEnd={handleImageTouchEnd}
                    >
                      <div
                        className="relative"
                        style={{
                          transform: `scale(${imageScale})`,
                          transformOrigin: 'top left',
                        }}
                      >
                        <img
                          ref={imageCropRef}
                          src={imageToCrop}
                          alt="Crop"
                          className="w-full h-auto select-none pointer-events-none"
                          draggable={false}
                        />
                      </div>
                      
                      {/* 선택 영역 표시 */}
                      {cropArea && cropArea.width > 0 && cropArea.height > 0 && (
                        <>
                          {/* 어두운 오버레이 (전체) */}
                          <div className="absolute inset-0 bg-black/40 pointer-events-none" />
                          {/* 선택 영역 (밝게) */}
                          <div
                            className="absolute border-2 border-blue-500 bg-transparent z-10"
                            style={{
                              left: `${cropArea.x}px`,
                              top: `${cropArea.y}px`,
                              width: `${cropArea.width}px`,
                              height: `${cropArea.height}px`,
                              boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.4)',
                              cursor: isResizing ? 'nwse-resize' : 'move',
                            }}
                          >
                            {/* 모서리 핸들 */}
                            {['tl', 'tr', 'bl', 'br'].map((handle) => (
                              <div
                                key={handle}
                                className="absolute w-5 h-5 bg-blue-500 border-2 border-white rounded-full shadow-lg"
                                style={{
                                  left: handle.includes('l') ? '-10px' : 'auto',
                                  right: handle.includes('r') ? '-10px' : 'auto',
                                  top: handle.includes('t') ? '-10px' : 'auto',
                                  bottom: handle.includes('b') ? '-10px' : 'auto',
                                  cursor: 'nwse-resize',
                                }}
                              />
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                    
                    <div className="flex gap-3 justify-between items-center">
                      <button
                        onClick={selectAll}
                        className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                      >
                        전체 선택
                      </button>
                      <div className="flex gap-3">
                        <button
                          onClick={cancelCrop}
                          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                        >
                          취소
                        </button>
                        <button
                          onClick={applyCrop}
                          disabled={!cropArea || cropArea.width === 0 || cropArea.height === 0}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          적용
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 하단 액션 버튼 */}
            <div className="mt-8 w-full max-w-[340px] flex flex-col gap-3">
              {status === 'idle' && (
                <button
                  onClick={startPhotoSession}
                  className="w-full py-4 text-xl font-bold flex items-center justify-center gap-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all shadow-xl hover:shadow-2xl transform hover:-translate-y-1"
                >
                  <Camera size={24} />
                  촬영 시작
                </button>
              )}
              
              {status === 'finished' && images.filter(img => img && img !== '').length === 4 && (
                <div className="flex flex-col gap-3 animate-fade-in">
                  <button
                    onClick={async () => {
                      // 프레임 전체를 이미지로 다운로드
                      if (!frameRef.current) {
                        alert("프레임을 찾을 수 없습니다.");
                        return;
                      }

                      try {
                        await document.fonts.ready;
                        
                        console.log("프레임 크기:", frameRef.current.scrollWidth, frameRef.current.scrollHeight);
                        
                        const dataUrl = await htmlToImage.toPng(frameRef.current, {
                          cacheBust: true,
                          pixelRatio: 3,
                          quality: 1.0,
                          width: frameRef.current.scrollWidth,
                          height: frameRef.current.scrollHeight,
                        });
                        
                        console.log("이미지 생성 완료, 다운로드 시작");
                        
                        const link = document.createElement('a');
                        link.download = `photo-${theme}-${Date.now()}.png`;
                        link.href = dataUrl;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                        
                        console.log("다운로드 완료");
                      } catch (err) {
                        console.error("Download failed:", err);
                        alert(`이미지 저장 중 오류가 발생했습니다: ${err instanceof Error ? err.message : String(err)}`);
                      }
                    }}
                    className="w-full py-3 text-xl font-bold flex items-center justify-center gap-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    <Download size={24} />
                    이미지 저장
                  </button>
                  <button
                    onClick={reset}
                    className="w-full py-3 text-lg font-medium flex items-center justify-center gap-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                  >
                    다시 찍기
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
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
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(-10px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateX(0) scale(1);
          }
        }
      `}</style>
    </div>
  );
}