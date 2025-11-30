'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Save, X, Upload, Image as ImageIcon } from 'lucide-react';

type Pose = {
  id: string;
  collection_id: string;
  name: string;
  image_url: string;
  sort_order: number;
};

type PoseCollection = {
  id: string;
  name: string;
  description: string | null;
  thumbnail: string | null;
  is_default: boolean;
  poses?: Pose[];
};

export default function AdminPosesPage() {
  const [collections, setCollections] = useState<PoseCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddCollection, setShowAddCollection] = useState(false);
  const [editingCollection, setEditingCollection] = useState<PoseCollection | null>(null);
  const [selectedCollection, setSelectedCollection] = useState<PoseCollection | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    description: '',
  });
  const [poseFiles, setPoseFiles] = useState<File[]>([]);
  const [poseNames, setPoseNames] = useState<string[]>([]);
  const [posePreviews, setPosePreviews] = useState<string[]>([]);

  useEffect(() => {
    fetchCollections();
  }, []);

  const fetchCollections = async () => {
    try {
      const response = await fetch('/api/admin/pose-collections');
      if (response.ok) {
        const data = await response.json();
        setCollections(data);
      }
    } catch (error) {
      console.error('Failed to fetch collections:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddCollection = () => {
    setFormData({ name: '', description: '' });
    setPoseFiles([]);
    setPoseNames([]);
    setPosePreviews([]);
    setEditingCollection(null);
    setShowAddCollection(true);
  };

  const handleEditCollection = (collection: PoseCollection) => {
    setFormData({
      name: collection.name,
      description: collection.description || '',
    });
    setPoseFiles([]);
    setPoseNames(collection.poses?.map(p => p.name) || []);
    setPosePreviews(collection.poses?.map(p => p.image_url) || []);
    setEditingCollection(collection);
    setShowAddCollection(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const file = e.target.files?.[0];
    if (file) {
      const newFiles = [...poseFiles];
      newFiles[index] = file;
      setPoseFiles(newFiles);

      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        const newPreviews = [...posePreviews];
        newPreviews[index] = reader.result as string;
        setPosePreviews(newPreviews);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddPoseSlot = () => {
    setPoseNames([...poseNames, '']);
    setPosePreviews([...posePreviews, '']);
  };

  const handleRemovePoseSlot = (index: number) => {
    setPoseNames(poseNames.filter((_, i) => i !== index));
    setPoseFiles(poseFiles.filter((_, i) => i !== index));
    setPosePreviews(posePreviews.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      alert('포즈 모음 이름을 입력해주세요.');
      return;
    }

    if (poseFiles.length === 0 && !editingCollection) {
      alert('최소 1개 이상의 포즈를 추가해주세요.');
      return;
    }

    try {
      const formPayload = new FormData();
      formPayload.append('name', formData.name);
      formPayload.append('description', formData.description);

      // Add pose files and names
      poseFiles.forEach((file, index) => {
        if (file) {
          formPayload.append(`pose_${index}`, file);
          formPayload.append(`pose_name_${index}`, poseNames[index] || `포즈 ${index + 1}`);
        }
      });

      // For editing, include existing poses
      if (editingCollection) {
        formPayload.append('collection_id', editingCollection.id);
        editingCollection.poses?.forEach((pose, index) => {
          if (!poseFiles[index]) {
            formPayload.append(`existing_pose_${index}`, JSON.stringify({
              id: pose.id,
              name: poseNames[index] || pose.name,
              image_url: pose.image_url,
              sort_order: index,
            }));
          }
        });
      }

      const url = editingCollection
        ? `/api/admin/pose-collections/${editingCollection.id}`
        : '/api/admin/pose-collections';

      const method = editingCollection ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        body: formPayload,
      });

      if (response.ok) {
        alert(editingCollection ? '포즈 모음이 수정되었습니다.' : '포즈 모음이 추가되었습니다.');
        setShowAddCollection(false);
        fetchCollections();
      } else {
        const error = await response.json();
        alert(`오류: ${error.error || '저장 실패'}`);
      }
    } catch (error) {
      console.error('Submit error:', error);
      alert('저장 중 오류가 발생했습니다.');
    }
  };

  const handleDeleteCollection = async (id: string) => {
    if (!confirm('이 포즈 모음을 삭제하시겠습니까?')) return;

    try {
      const response = await fetch(`/api/admin/pose-collections/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        alert('포즈 모음이 삭제되었습니다.');
        fetchCollections();
      } else {
        alert('삭제 실패');
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert('삭제 중 오류가 발생했습니다.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">포즈 모음 관리</h1>
            <p className="text-gray-600 mt-1">레퍼런스 포즈 모음을 등록하고 관리합니다</p>
          </div>
          <button
            onClick={handleAddCollection}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-md"
          >
            <Plus size={20} />
            새 포즈 모음 추가
          </button>
        </div>

        {/* Collections Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {collections.map((collection) => (
            <div
              key={collection.id}
              className="bg-white rounded-xl shadow-md overflow-hidden hover:shadow-lg transition-shadow"
            >
              {/* Thumbnail */}
              <div className="h-48 bg-gray-100 relative">
                {collection.thumbnail ? (
                  <img
                    src={collection.thumbnail}
                    alt={collection.name}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageIcon className="w-16 h-16 text-gray-300" />
                  </div>
                )}
                {collection.is_default && (
                  <span className="absolute top-2 right-2 px-2 py-1 bg-green-500 text-white text-xs rounded-full">
                    기본
                  </span>
                )}
              </div>

              {/* Content */}
              <div className="p-4">
                <h3 className="text-lg font-bold text-gray-900 mb-1">{collection.name}</h3>
                {collection.description && (
                  <p className="text-sm text-gray-600 mb-3">{collection.description}</p>
                )}
                <p className="text-xs text-gray-500 mb-4">
                  포즈 개수: {collection.poses?.length || 0}개
                </p>

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedCollection(collection)}
                    className="flex-1 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
                  >
                    상세보기
                  </button>
                  <button
                    onClick={() => handleEditCollection(collection)}
                    className="px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
                  >
                    <Edit2 size={16} />
                  </button>
                  {!collection.is_default && (
                    <button
                      onClick={() => handleDeleteCollection(collection.id)}
                      className="px-3 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Add/Edit Collection Modal */}
        {showAddCollection && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl max-w-4xl w-full my-8 shadow-2xl">
              {/* Modal Header */}
              <div className="flex justify-between items-center p-6 border-b">
                <h2 className="text-2xl font-bold text-gray-900">
                  {editingCollection ? '포즈 모음 수정' : '새 포즈 모음 추가'}
                </h2>
                <button
                  onClick={() => setShowAddCollection(false)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-6 max-h-[calc(100vh-200px)] overflow-y-auto">
                {/* Collection Info */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      포즈 모음 이름 *
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="예: 봄 시즌 포즈"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      설명
                    </label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      rows={3}
                      placeholder="포즈 모음에 대한 설명을 입력하세요"
                    />
                  </div>
                </div>

                {/* Poses */}
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <label className="block text-sm font-medium text-gray-700">
                      포즈 이미지 (최소 1개, 최대 4개)
                    </label>
                    {posePreviews.length < 4 && (
                      <button
                        onClick={handleAddPoseSlot}
                        className="flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-sm"
                      >
                        <Plus size={16} />
                        포즈 추가
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {posePreviews.map((preview, index) => (
                      <div key={index} className="space-y-2">
                        <div className="relative aspect-square bg-gray-100 rounded-lg overflow-hidden border-2 border-dashed border-gray-300">
                          {preview ? (
                            <img
                              src={preview}
                              alt={`Pose ${index + 1}`}
                              className="w-full h-full object-contain"
                            />
                          ) : (
                            <label className="w-full h-full flex flex-col items-center justify-center cursor-pointer hover:bg-gray-200 transition-colors">
                              <Upload className="w-8 h-8 text-gray-400 mb-2" />
                              <span className="text-xs text-gray-500">이미지 업로드</span>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => handleFileChange(e, index)}
                                className="hidden"
                              />
                            </label>
                          )}
                          <button
                            onClick={() => handleRemovePoseSlot(index)}
                            className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                          >
                            <X size={14} />
                          </button>
                        </div>
                        <input
                          type="text"
                          value={poseNames[index] || ''}
                          onChange={(e) => {
                            const newNames = [...poseNames];
                            newNames[index] = e.target.value;
                            setPoseNames(newNames);
                          }}
                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder={`포즈 ${index + 1} 이름`}
                        />
                        {!preview && (
                          <label className="block">
                            <span className="sr-only">이미지 선택</span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => handleFileChange(e, index)}
                              className="block w-full text-xs text-gray-500 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                            />
                          </label>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex justify-end gap-3 p-6 border-t bg-gray-50">
                <button
                  onClick={() => setShowAddCollection(false)}
                  className="px-6 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleSubmit}
                  className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Save size={18} />
                  {editingCollection ? '수정 완료' : '등록하기'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Detail View Modal */}
        {selectedCollection && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl">
              <div className="flex justify-between items-center p-6 border-b">
                <h2 className="text-2xl font-bold text-gray-900">{selectedCollection.name}</h2>
                <button
                  onClick={() => setSelectedCollection(null)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="p-6 max-h-[calc(100vh-200px)] overflow-y-auto">
                {selectedCollection.description && (
                  <p className="text-gray-600 mb-6">{selectedCollection.description}</p>
                )}

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {selectedCollection.poses?.map((pose, index) => (
                    <div key={pose.id} className="space-y-2">
                      <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
                        <img
                          src={pose.image_url}
                          alt={pose.name}
                          className="w-full h-full object-contain"
                        />
                      </div>
                      <p className="text-sm text-center text-gray-700 font-medium">{pose.name}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
