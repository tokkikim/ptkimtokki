'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Save, X, Copy, CheckCircle, PlayCircle } from 'lucide-react';

type PromptVariable = {
  name: string;
  description: string;
  default: string;
};

type PromptTemplate = {
  id: string;
  name: string;
  description: string | null;
  template: string;
  variables: PromptVariable[];
  is_active: boolean;
  category: string;
  version: number;
  created_at: string;
};

export default function AdminPromptsPage() {
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddPrompt, setShowAddPrompt] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<PromptTemplate | null>(null);
  const [previewPrompt, setPreviewPrompt] = useState<string>('');

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    template: '',
    category: 'pose_generation',
  });
  const [variables, setVariables] = useState<PromptVariable[]>([]);

  useEffect(() => {
    fetchPrompts();
  }, []);

  const fetchPrompts = async () => {
    try {
      const response = await fetch('/api/admin/prompts');
      if (response.ok) {
        const data = await response.json();
        setPrompts(data);
      }
    } catch (error) {
      console.error('Failed to fetch prompts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddPrompt = () => {
    setFormData({ name: '', description: '', template: '', category: 'pose_generation' });
    setVariables([]);
    setEditingPrompt(null);
    setShowAddPrompt(true);
  };

  const handleEditPrompt = (prompt: PromptTemplate) => {
    setFormData({
      name: prompt.name,
      description: prompt.description || '',
      template: prompt.template,
      category: prompt.category,
    });
    setVariables(prompt.variables || []);
    setEditingPrompt(prompt);
    setShowAddPrompt(true);
    updatePreview(prompt.template, prompt.variables || []);
  };

  const handleAddVariable = () => {
    setVariables([...variables, { name: '', description: '', default: '' }]);
  };

  const handleRemoveVariable = (index: number) => {
    setVariables(variables.filter((_, i) => i !== index));
  };

  const handleVariableChange = (index: number, field: keyof PromptVariable, value: string) => {
    const newVariables = [...variables];
    newVariables[index] = { ...newVariables[index], [field]: value };
    setVariables(newVariables);
    updatePreview(formData.template, newVariables);
  };

  const updatePreview = (template: string, vars: PromptVariable[]) => {
    let preview = template;
    vars.forEach((v) => {
      const regex = new RegExp(`{{${v.name}}}`, 'g');
      preview = preview.replace(regex, v.default || `{{${v.name}}}`);
    });
    setPreviewPrompt(preview);
  };

  const handleTemplateChange = (value: string) => {
    setFormData({ ...formData, template: value });
    updatePreview(value, variables);
  };

  const handleSubmit = async () => {
    if (!formData.name.trim() || !formData.template.trim()) {
      alert('프롬프트 이름과 템플릿을 입력해주세요.');
      return;
    }

    try {
      const payload = {
        ...formData,
        variables,
      };

      const url = editingPrompt
        ? `/api/admin/prompts/${editingPrompt.id}`
        : '/api/admin/prompts';
      const method = editingPrompt ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        alert(editingPrompt ? '프롬프트가 수정되었습니다.' : '프롬프트가 추가되었습니다.');
        setShowAddPrompt(false);
        fetchPrompts();
      } else {
        const error = await response.json();
        alert(`오류: ${error.error || '저장 실패'}`);
      }
    } catch (error) {
      console.error('Submit error:', error);
      alert('저장 중 오류가 발생했습니다.');
    }
  };

  const handleActivate = async (id: string) => {
    try {
      const response = await fetch(`/api/admin/prompts/${id}/activate`, {
        method: 'POST',
      });

      if (response.ok) {
        alert('프롬프트가 활성화되었습니다.');
        fetchPrompts();
      } else {
        alert('활성화 실패');
      }
    } catch (error) {
      console.error('Activate error:', error);
      alert('활성화 중 오류가 발생했습니다.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 프롬프트를 삭제하시겠습니까?')) return;

    try {
      const response = await fetch(`/api/admin/prompts/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        alert('프롬프트가 삭제되었습니다.');
        fetchPrompts();
      } else {
        alert('삭제 실패');
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert('삭제 중 오류가 발생했습니다.');
    }
  };

  const handleDuplicate = (prompt: PromptTemplate) => {
    setFormData({
      name: `${prompt.name} (복사본)`,
      description: prompt.description || '',
      template: prompt.template,
      category: prompt.category,
    });
    setVariables(prompt.variables || []);
    setEditingPrompt(null);
    setShowAddPrompt(true);
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
            <h1 className="text-3xl font-bold text-gray-900">프롬프트 관리</h1>
            <p className="text-gray-600 mt-1">AI 포즈 생성을 위한 프롬프트를 관리합니다</p>
          </div>
          <button
            onClick={handleAddPrompt}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-md"
          >
            <Plus size={20} />
            새 프롬프트 추가
          </button>
        </div>

        {/* Prompts List */}
        <div className="space-y-4">
          {prompts.map((prompt) => (
            <div
              key={prompt.id}
              className={`bg-white rounded-xl shadow-md overflow-hidden transition-all ${
                prompt.is_active ? 'ring-2 ring-green-500' : ''
              }`}
            >
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-bold text-gray-900">{prompt.name}</h3>
                      {prompt.is_active && (
                        <span className="px-3 py-1 bg-green-100 text-green-700 text-xs rounded-full font-medium flex items-center gap-1">
                          <CheckCircle size={14} />
                          활성
                        </span>
                      )}
                      <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                        v{prompt.version}
                      </span>
                    </div>
                    {prompt.description && (
                      <p className="text-sm text-gray-600 mb-3">{prompt.description}</p>
                    )}
                    <div className="flex gap-2 text-xs text-gray-500">
                      <span>카테고리: {prompt.category}</span>
                      <span>•</span>
                      <span>변수: {prompt.variables?.length || 0}개</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {!prompt.is_active && (
                      <button
                        onClick={() => handleActivate(prompt.id)}
                        className="px-3 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors text-sm font-medium"
                      >
                        활성화
                      </button>
                    )}
                    <button
                      onClick={() => handleDuplicate(prompt)}
                      className="p-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                      title="복제"
                    >
                      <Copy size={18} />
                    </button>
                    <button
                      onClick={() => handleEditPrompt(prompt)}
                      className="p-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
                    >
                      <Edit2 size={18} />
                    </button>
                    <button
                      onClick={() => handleDelete(prompt.id)}
                      className="p-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>

                {/* Template Preview */}
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">템플릿</h4>
                  <p className="text-sm text-gray-600 font-mono whitespace-pre-wrap">
                    {prompt.template}
                  </p>
                </div>

                {/* Variables */}
                {prompt.variables && prompt.variables.length > 0 && (
                  <div className="mt-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">변수</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {prompt.variables.map((v, idx) => (
                        <div key={idx} className="bg-white border border-gray-200 rounded p-2">
                          <div className="text-xs font-mono text-blue-600">
                            {`{{${v.name}}}`}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">{v.description}</div>
                          <div className="text-xs text-gray-400 mt-1">기본값: {v.default}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Add/Edit Prompt Modal */}
        {showAddPrompt && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl max-w-5xl w-full my-8 shadow-2xl max-h-[90vh] overflow-y-auto">
              {/* Modal Header */}
              <div className="flex justify-between items-center p-6 border-b sticky top-0 bg-white z-10">
                <h2 className="text-2xl font-bold text-gray-900">
                  {editingPrompt ? '프롬프트 수정' : '새 프롬프트 추가'}
                </h2>
                <button
                  onClick={() => setShowAddPrompt(false)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-6">
                {/* Basic Info */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      프롬프트 이름 *
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="예: 개선된 포즈 생성 프롬프트"
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
                      rows={2}
                      placeholder="프롬프트에 대한 설명을 입력하세요"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      카테고리
                    </label>
                    <select
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="pose_generation">포즈 생성</option>
                      <option value="style_transfer">스타일 변환</option>
                      <option value="background_removal">배경 제거</option>
                    </select>
                  </div>
                </div>

                {/* Template */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    프롬프트 템플릿 * <span className="text-gray-500 font-normal">(변수: {`{{변수명}}`})</span>
                  </label>
                  <textarea
                    value={formData.template}
                    onChange={(e) => handleTemplateChange(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                    rows={8}
                    placeholder="프롬프트 템플릿을 입력하세요. 변수는 {{변수명}} 형식으로 사용합니다."
                  />
                </div>

                {/* Variables */}
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <label className="block text-sm font-medium text-gray-700">
                      변수 정의
                    </label>
                    <button
                      onClick={handleAddVariable}
                      className="flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-sm"
                    >
                      <Plus size={16} />
                      변수 추가
                    </button>
                  </div>

                  <div className="space-y-3">
                    {variables.map((variable, index) => (
                      <div key={index} className="grid grid-cols-12 gap-2 items-start p-3 bg-gray-50 rounded-lg">
                        <div className="col-span-3">
                          <input
                            type="text"
                            value={variable.name}
                            onChange={(e) => handleVariableChange(index, 'name', e.target.value)}
                            className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm font-mono"
                            placeholder="변수명"
                          />
                        </div>
                        <div className="col-span-4">
                          <input
                            type="text"
                            value={variable.description}
                            onChange={(e) => handleVariableChange(index, 'description', e.target.value)}
                            className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm"
                            placeholder="설명"
                          />
                        </div>
                        <div className="col-span-4">
                          <input
                            type="text"
                            value={variable.default}
                            onChange={(e) => handleVariableChange(index, 'default', e.target.value)}
                            className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm"
                            placeholder="기본값"
                          />
                        </div>
                        <button
                          onClick={() => handleRemoveVariable(index)}
                          className="col-span-1 p-1.5 bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Preview */}
                {previewPrompt && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-blue-900 mb-2">미리보기 (변수 적용됨)</h4>
                    <p className="text-sm text-blue-800 whitespace-pre-wrap">{previewPrompt}</p>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="flex justify-end gap-3 p-6 border-t bg-gray-50 sticky bottom-0">
                <button
                  onClick={() => setShowAddPrompt(false)}
                  className="px-6 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleSubmit}
                  className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Save size={18} />
                  {editingPrompt ? '수정 완료' : '등록하기'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
