# 포즈 관리 시스템 설정 가이드

## 개요
레퍼런스 포즈를 관리자 페이지에서 등록하고 수정할 수 있는 시스템입니다.

## 설정 단계

### 1. 데이터베이스 마이그레이션
Supabase 데이터베이스에 필요한 테이블을 생성합니다.

```bash
# Supabase CLI를 사용하는 경우
supabase db push

# 또는 Supabase Dashboard에서 SQL Editor를 열고
# supabase/migrations/20250130_create_pose_collections.sql 파일의 내용을 실행
```

### 2. Storage Bucket 및 정책 설정
**중요**: Storage 정책을 올바르게 설정하지 않으면 이미지 업로드가 실패합니다.

#### 방법 1: SQL 스크립트 실행 (권장)
Supabase Dashboard → SQL Editor에서:

```sql
-- supabase/migrations/20250130_storage_policies.sql 파일의 내용을 복사하여 실행
```

이 스크립트는 자동으로:
- `pose-images` 버킷 생성
- 공개 읽기 권한 설정
- 인증된 사용자의 업로드/수정/삭제 권한 설정

#### 방법 2: Supabase Dashboard에서 수동 설정

**Step 1: 버킷 생성**
1. Supabase Dashboard → Storage
2. "New bucket" 클릭
3. 이름: `pose-images`
4. Public bucket: ✅ 체크
5. "Create bucket" 클릭

**Step 2: Storage Policies 설정**
1. Storage → `pose-images` 버킷 선택
2. "Policies" 탭으로 이동
3. 다음 정책들을 추가:

**정책 1: 공개 읽기**
- Policy name: `Public read access for pose images`
- Allowed operation: SELECT
- Target roles: public
- USING expression: `bucket_id = 'pose-images'`

**정책 2: 인증된 사용자 업로드**
- Policy name: `Authenticated users can upload pose images`
- Allowed operation: INSERT
- Target roles: authenticated
- WITH CHECK expression: `bucket_id = 'pose-images'`

**정책 3: 인증된 사용자 수정**
- Policy name: `Authenticated users can update pose images`
- Allowed operation: UPDATE
- Target roles: authenticated
- USING expression: `bucket_id = 'pose-images'`

**정책 4: 인증된 사용자 삭제**
- Policy name: `Authenticated users can delete pose images`
- Allowed operation: DELETE
- Target roles: authenticated
- USING expression: `bucket_id = 'pose-images'`

### 3. 관리자 페이지 접근
브라우저에서 다음 URL로 접근:
```
http://localhost:3000/admin/poses
```

## 데이터베이스 구조

### pose_collections 테이블
- `id`: UUID (Primary Key)
- `name`: 포즈 모음 이름
- `description`: 설명 (선택)
- `thumbnail`: 썸네일 이미지 URL
- `is_default`: 기본 포즈 모음 여부
- `created_at`, `updated_at`: 타임스탬프

### poses 테이블
- `id`: UUID (Primary Key)
- `collection_id`: 포즈 모음 ID (Foreign Key)
- `name`: 포즈 이름
- `image_url`: 이미지 URL
- `sort_order`: 정렬 순서
- `created_at`: 타임스탬프

## API 엔드포인트

### 공개 API (인증 불필요)
- `GET /api/pose-collections` - 모든 포즈 모음 조회

### 관리자 API (인증 필요)
- `GET /api/admin/pose-collections` - 관리자용 포즈 모음 조회
- `POST /api/admin/pose-collections` - 새 포즈 모음 생성
- `PUT /api/admin/pose-collections/[id]` - 포즈 모음 수정
- `DELETE /api/admin/pose-collections/[id]` - 포즈 모음 삭제

## 사용 방법

### 새 포즈 모음 추가
1. 관리자 페이지에서 "새 포즈 모음 추가" 버튼 클릭
2. 포즈 모음 정보 입력:
   - 이름 (필수)
   - 설명 (선택)
3. 포즈 이미지 업로드 (최소 1개, 최대 4개):
   - 각 포즈마다 이미지 파일 선택
   - 포즈 이름 입력
4. "등록하기" 버튼 클릭

### 포즈 모음 수정
1. 수정할 포즈 모음의 "편집" 버튼 클릭
2. 정보 수정 후 "수정 완료" 버튼 클릭

### 포즈 모음 삭제
1. 삭제할 포즈 모음의 "삭제" 버튼 클릭
2. 확인 대화상자에서 확인
3. 주의: 기본 포즈 모음은 삭제할 수 없습니다

## 주의사항

1. **인증**: 관리자 API는 Supabase 인증이 필요합니다. 로그인하지 않으면 401 에러가 발생합니다.

2. **기본 포즈 모음**: `is_default = true`인 포즈 모음은 삭제할 수 없습니다.

3. **이미지 형식**: PNG, JPG, GIF 등 웹 브라우저에서 지원하는 이미지 형식 사용 가능.

4. **파일 크기**: 각 이미지는 5MB 이하 권장.

5. **포즈 개수**: 각 모음당 1~4개의 포즈 권장 (UI에서 4개 슬롯 제공).

## 트러블슈팅

### ❌ "Unauthorized" 오류
**원인**: 로그인하지 않았거나 세션이 만료됨

**해결방법**:
1. `/login` 페이지에서 로그인
2. 브라우저 개발자 도구 → Application → Cookies 확인
3. Supabase 세션 쿠키가 있는지 확인

### ❌ 이미지 업로드 실패: "new row violates row-level security policy"
**원인**: Storage RLS 정책이 올바르게 설정되지 않음

**해결방법**:
1. **즉시 해결**: `supabase/migrations/20250130_storage_policies.sql` 실행
   ```bash
   # Supabase Dashboard → SQL Editor에서 전체 스크립트 복사 & 실행
   ```

2. **정책 확인**:
   - Supabase Dashboard → Storage → `pose-images` → Policies 탭
   - 다음 정책들이 있어야 함:
     - ✅ Public read access for pose images (SELECT, public)
     - ✅ Authenticated users can upload pose images (INSERT, authenticated)
     - ✅ Authenticated users can update pose images (UPDATE, authenticated)
     - ✅ Authenticated users can delete pose images (DELETE, authenticated)

3. **정책 재생성** (필요시):
   - 기존 정책 삭제
   - 위의 "방법 2: Supabase Dashboard에서 수동 설정" 섹션 참고하여 재생성

### ❌ 버킷이 존재하지 않음
**해결방법**:
```sql
-- Supabase Dashboard → SQL Editor에서 실행
INSERT INTO storage.buckets (id, name, public)
VALUES ('pose-images', 'pose-images', true)
ON CONFLICT (id) DO NOTHING;
```

### ❌ 이미지가 표시되지 않음 (403 Forbidden)
**원인**: Public read 정책이 없거나 버킷이 Private

**해결방법**:
1. Storage → `pose-images` → Configuration → Public bucket 체크
2. Public read policy 확인:
   ```sql
   CREATE POLICY "Public read access for pose images"
   ON storage.objects FOR SELECT
   TO public
   USING (bucket_id = 'pose-images');
   ```

### 포즈가 표시되지 않음
- 브라우저 개발자 도구의 Network 탭에서 API 응답 확인
- `/api/pose-collections` 엔드포인트가 정상적으로 응답하는지 확인

## 개발 환경에서 테스트

```bash
# 개발 서버 시작
npm run dev

# 관리자 페이지 접속
# http://localhost:3000/admin/poses

# 메인 페이지에서 포즈 확인
# http://localhost:3000/studio
```

## 배포 시 확인사항

1. Supabase 마이그레이션 실행 완료
2. Storage 버킷 생성 완료
3. 환경 변수 설정 확인:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. 관리자 계정 생성 및 권한 확인
