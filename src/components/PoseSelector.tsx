'use client';

import React, { useState, useEffect } from 'react';
import { Upload, X, Loader2, Plus } from 'lucide-react';

// 포즈 타입 정의
export type Pose = {
  id: string;
  name: string;
  image: string;
};

// 포즈 모음 타입 정의
export type PoseCollection = {
  id: string;
  name: string;
  poses: Pose[];
  thumbnail?: string;
};

type PoseSelectorProps = {
  poseCollections: PoseCollection[];
  selectedCollectionIndex: number | null;
  selectedPoseIndex: number | null;
  onCollectionSelect: (collectionIndex: number) => void;
  onPoseSelect: (poseIndex: number) => void;
  onCollectionGenerated: (collection: PoseCollection) => void;
  onDefaultCollectionsLoaded: (collections: PoseCollection[]) => void;
};

export default function PoseSelector({
  poseCollections,
  selectedCollectionIndex,
  selectedPoseIndex,
  onCollectionSelect,
  onPoseSelect,
  onCollectionGenerated,
  onDefaultCollectionsLoaded,
}: PoseSelectorProps) {
  const [showUploadPopup, setShowUploadPopup] = useState(false);
  const [showTermsPopup, setShowTermsPopup] = useState(false);
  const [showSignupPopup, setShowSignupPopup] = useState(false);
  const [showPaymentPopup, setShowPaymentPopup] = useState(false);
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [agreeToPrivacy, setAgreeToPrivacy] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasAcceptedOnce, setHasAcceptedOnce] = useState(false);
  const [showPoseCollectionSelect, setShowPoseCollectionSelect] = useState(false);
  const [selectedBasePoseCollectionId, setSelectedBasePoseCollectionId] = useState<string | null>(null);

  // 데이터베이스에서 포즈 모음 로드
  const loadPoseCollectionsFromDB = async (): Promise<PoseCollection[]> => {
    try {
      const response = await fetch('/api/pose-collections');
      if (response.ok) {
        const data = await response.json();
        return data;
      } else {
        console.error('Failed to fetch pose collections from database');
        return [];
      }
    } catch (error) {
      console.error('Error loading pose collections:', error);
      return [];
    }
  };

  // 컴포넌트 마운트 시 데이터베이스에서 포즈 모음 로드
  useEffect(() => {
    const initializePoseCollections = async () => {
      if (poseCollections.length === 0) {
        const collections = await loadPoseCollectionsFromDB();
        if (collections.length > 0) {
          onDefaultCollectionsLoaded(collections);
        } else {
          // 데이터베이스에서 로드 실패 시 로컬 기본 포즈 사용
          const fallbackPoses: Pose[] = [
            { id: 'smile', name: '웃는 포즈', image: '/reference-poses/rabbit-smile.png' },
            { id: 'point', name: '손가락 포인트', image: '/reference-poses/rabbit-point.png' },
            { id: 'think', name: '생각하는 포즈', image: '/reference-poses/rabbit-think.png' },
            { id: 'heart', name: '하트 포즈', image: '/reference-poses/rabbit-heart.png' },
          ];
          const fallbackCollection: PoseCollection = {
            id: 'default',
            name: '기본 포즈',
            poses: fallbackPoses,
            thumbnail: fallbackPoses[0]?.image,
          };
          onDefaultCollectionsLoaded([fallbackCollection]);
        }
      }
    };

    initializePoseCollections();
  }, []);

  // 이용약관 동의 후 업로드 팝업 열기
  const handleAgreeAndContinue = () => {
    if (!agreeToTerms || !agreeToPrivacy) {
      alert('이용약관과 개인정보 처리방침에 모두 동의해주세요.');
      return;
    }
    setHasAcceptedOnce(true);
    setShowTermsPopup(false);
    setShowUploadPopup(true);
  };

  // 포즈 추가 버튼 클릭
  const handleAddPose = () => {
    if (!hasAcceptedOnce) {
      setShowTermsPopup(true);
    } else {
      setShowPoseCollectionSelect(true);
    }
  };

  // 포즈 모음 선택 후 업로드 팝업 열기
  const handleSelectPoseCollection = (collectionId: string) => {
    setSelectedBasePoseCollectionId(collectionId);
    setShowPoseCollectionSelect(false);
    setShowUploadPopup(true);
  };

  // 이미지 업로드 및 포즈 생성
  const handleImageUpload = async (file: File) => {
    setIsGenerating(true);
    setShowUploadPopup(false);

    try {
      const formData = new FormData();
      formData.append('personImage', file);

      // 선택된 포즈 모음 ID 전달 (없으면 기본값 사용)
      if (selectedBasePoseCollectionId) {
        formData.append('basePoseCollectionId', selectedBasePoseCollectionId);
      }

      const response = await fetch('/api/generate-poses', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        // 에러 코드에 따라 적절한 팝업 표시
        if (data.code === 'GUEST_NOT_ALLOWED') {
          setShowSignupPopup(true);
        } else if (data.code === 'FREE_USER_DAILY_LIMIT_EXCEEDED' || data.code === 'PAID_USER_CREDITS_EXHAUSTED') {
          setShowPaymentPopup(true);
        } else {
          alert(data.error || '포즈 생성 중 오류가 발생했습니다.');
        }
        return;
      }

      const generatedPoses: Pose[] = data.poses.map((pose: any, idx: number) => ({
        id: `pose-${Date.now()}-${idx}`,
        name: pose.name || `Pose ${idx + 1}`,
        image: pose.image,
      }));

      // 새로운 포즈 모음 생성
      const newCollection: PoseCollection = {
        id: `collection-${Date.now()}`,
        name: `생성된 포즈 ${poseCollections.length + 1}`,
        poses: generatedPoses,
        thumbnail: generatedPoses[0]?.image,
      };

      onCollectionGenerated(newCollection);
    } catch (error) {
      console.error('Pose generation error:', error);
      alert('포즈 생성 중 오류가 발생했습니다.');
    } finally {
      setIsGenerating(false);
    }
  };

  // 썸네일 클릭 핸들러
  const handleThumbnailClick = (collectionIndex: number) => {
    onCollectionSelect(collectionIndex);
  };

  return (
    <>
      {/* 포즈 선택기 */}
      <div className="bg-white/50 backdrop-blur-sm p-3 rounded-xl animate-fade-in">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-bold opacity-70">POSE</span>
          <button
            onClick={handleAddPose}
            disabled={isGenerating}
            className="ml-auto text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 flex items-center gap-1"
          >
            <Plus size={12} />
            추가
          </button>
        </div>

        {/* 포즈 모음 썸네일 그리드 */}
        {poseCollections.length > 0 && (
          <div className="space-y-2">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {poseCollections.map((collection, idx) => {
                const thumbnail = collection.thumbnail || collection.poses[0]?.image;
                const isSelected = selectedCollectionIndex === idx;

                return (
                  <button
                    key={collection.id}
                    onClick={() => handleThumbnailClick(idx)}
                    className={`relative flex-shrink-0 w-16 h-16 rounded-lg border-2 transition-all overflow-hidden ${
                      isSelected
                        ? 'border-blue-500 ring-2 ring-blue-300 shadow-md'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {thumbnail ? (
                      <img
                        src={thumbnail}
                        alt={collection.name}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                        <span className="text-gray-400 text-xs">없음</span>
                      </div>
                    )}
                    {/* 선택 표시 */}
                    {isSelected && (
                      <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center pointer-events-none">
                        <div className="bg-blue-500 rounded-full p-0.5">
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 포즈 생성 중 */}
      {isGenerating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl p-6 flex flex-col items-center gap-4">
            <Loader2 className="w-12 h-12 animate-spin text-blue-500" />
            <p className="text-lg font-medium">AI 포즈 생성 중...</p>
          </div>
        </div>
      )}

      {/* 이용약관 팝업 */}
      {showTermsPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl">
            <div className="p-6 border-b">
              <h3 className="text-2xl font-bold text-gray-800">이용약관 및 동의</h3>
            </div>

            <div className="p-6 max-h-96 overflow-y-auto bg-gray-50">
              <div className="space-y-4 text-gray-700">
                <div>
                  <h4 className="font-bold text-lg mb-2">1. 서비스 이용 약관</h4>
                  <p className="text-sm leading-relaxed">
                    본 서비스는 AI 기술을 활용하여 포즈를 생성합니다.
                    업로드된 이미지는 포즈 생성 후 즉시 삭제됩니다.
                  </p>
                </div>

                <div>
                  <h4 className="font-bold text-lg mb-2">2. 개인정보 처리방침</h4>
                  <p className="text-sm leading-relaxed">
                    업로드된 이미지는 포즈 생성 목적으로만 사용되며,
                    제3자와 공유되지 않습니다.
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6 bg-gray-50 space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreeToTerms}
                  onChange={(e) => setAgreeToTerms(e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="text-sm">이용약관에 동의합니다</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreeToPrivacy}
                  onChange={(e) => setAgreeToPrivacy(e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="text-sm">개인정보 처리방침에 동의합니다</span>
              </label>
            </div>

            <div className="p-6 border-t bg-white flex justify-end gap-3">
              <button
                onClick={() => setShowTermsPopup(false)}
                className="px-6 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleAgreeAndContinue}
                disabled={!agreeToTerms || !agreeToPrivacy}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                동의하고 계속하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 포즈 모음 선택 팝업 */}
      {showPoseCollectionSelect && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">레퍼런스 포즈 선택</h3>
              <button
                onClick={() => setShowPoseCollectionSelect(false)}
                className="p-2 hover:bg-gray-100 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-gray-600 mb-6">
              생성할 포즈의 기준이 될 포즈 모음을 선택하세요
            </p>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {poseCollections.map((collection) => (
                <button
                  key={collection.id}
                  onClick={() => handleSelectPoseCollection(collection.id)}
                  className="group relative p-4 border-2 border-gray-200 rounded-xl hover:border-blue-500 hover:shadow-lg transition-all"
                >
                  {/* 썸네일 */}
                  <div className="aspect-square bg-gray-100 rounded-lg mb-3 overflow-hidden">
                    {collection.thumbnail ? (
                      <img
                        src={collection.thumbnail}
                        alt={collection.name}
                        className="w-full h-full object-contain group-hover:scale-110 transition-transform"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="text-gray-400 text-xs">없음</span>
                      </div>
                    )}
                  </div>

                  {/* 정보 */}
                  <h4 className="font-bold text-sm text-center mb-1">{collection.name}</h4>
                  <p className="text-xs text-gray-500 text-center">
                    {collection.poses.length}개 포즈
                  </p>

                  {/* 호버 효과 */}
                  <div className="absolute inset-0 rounded-xl border-2 border-blue-500 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none flex items-center justify-center bg-blue-500/10">
                    <span className="text-blue-600 font-bold">선택하기</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 이미지 업로드 팝업 */}
      {showUploadPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">인물 이미지 업로드</h3>
              <button
                onClick={() => setShowUploadPopup(false)}
                className="p-2 hover:bg-gray-100 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <label className="block">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImageUpload(file);
                  }}
                  className="hidden"
                />
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 transition-colors">
                  <Upload className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                  <p className="text-sm text-gray-600">
                    클릭하여 이미지 업로드
                  </p>
                </div>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* 회원가입 유도 팝업 */}
      {showSignupPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-8">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold mb-2">회원가입이 필요합니다</h3>
              <p className="text-gray-600">
                포즈 생성 기능은 회원만 이용 가능합니다.<br />
                회원가입하고 매일 무료로 1회 포즈를 생성해보세요!
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => {
                  setShowSignupPopup(false);
                  window.location.href = '/login';
                }}
                className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
              >
                회원가입 / 로그인
              </button>
              <button
                onClick={() => setShowSignupPopup(false)}
                className="w-full px-6 py-3 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 결제 유도 팝업 */}
      {showPaymentPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-8">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold mb-2">사용 횟수가 부족합니다</h3>
              <p className="text-gray-600">
                더 많은 포즈를 생성하려면<br />
                추가 크레딧을 구매해주세요!
              </p>
            </div>

            <div className="bg-gray-50 rounded-xl p-4 mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">10회 패키지</span>
                <span className="font-bold text-lg">₩9,900</span>
              </div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">30회 패키지</span>
                <span className="font-bold text-lg">₩24,900</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">무제한 월간 구독</span>
                <span className="font-bold text-lg">₩19,900/월</span>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => {
                  setShowPaymentPopup(false);
                  // TODO: 결제 페이지로 이동
                  alert('결제 페이지는 준비 중입니다.');
                }}
                className="w-full px-6 py-3 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 font-medium transition-colors"
              >
                크레딧 구매하기
              </button>
              <button
                onClick={() => setShowPaymentPopup(false)}
                className="w-full px-6 py-3 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
