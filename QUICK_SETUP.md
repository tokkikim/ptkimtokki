# 포즈 관리 시스템 빠른 설정 가이드

## 🚀 5분 안에 설정하기

### 1️⃣ 데이터베이스 테이블 생성
Supabase Dashboard → SQL Editor에 복사 & 실행:

```sql
-- ✅ Step 1: 테이블 생성 스크립트 실행
-- 파일: supabase/migrations/20250130_create_pose_collections.sql
-- 위 파일의 전체 내용을 복사하여 SQL Editor에 붙여넣고 실행
```

### 2️⃣ Storage 설정 (가장 중요!)
Supabase Dashboard → SQL Editor에 복사 & 실행:

```sql
-- ✅ Step 2: Storage 버킷 및 정책 생성
-- 파일: supabase/migrations/20250130_storage_policies.sql
-- 위 파일의 전체 내용을 복사하여 SQL Editor에 붙여넣고 실행
```

### 3️⃣ 완료! 테스트
1. 로그인: `http://localhost:3000/login`
2. 관리자 페이지: `http://localhost:3000/admin/poses`
3. 새 포즈 모음 추가 → 이미지 업로드 테스트

---

## 🔧 문제 발생 시

### "Upload error: new row violates row-level security policy"
👉 Storage 정책이 설정되지 않았습니다!

**즉시 해결**:
```sql
-- Supabase Dashboard → SQL Editor에서 실행
-- supabase/migrations/20250130_storage_policies.sql 전체 복사 & 실행
```

### 정책 확인 방법
Supabase Dashboard → Storage → `pose-images` → Policies 탭

**필요한 정책** (4개):
- ✅ Public read access (SELECT, public)
- ✅ Authenticated upload (INSERT, authenticated)
- ✅ Authenticated update (UPDATE, authenticated)
- ✅ Authenticated delete (DELETE, authenticated)

---

## 📋 체크리스트

설정이 완료되면 다음 항목들을 확인하세요:

- [ ] `pose_collections` 테이블 존재
- [ ] `poses` 테이블 존재
- [ ] Storage 버킷 `pose-images` 존재
- [ ] Storage 버킷이 **Public** 설정
- [ ] Storage 정책 4개 모두 존재
- [ ] 기본 포즈 모음 "기본 포즈" 존재 (4개 포즈 포함)
- [ ] 로그인 후 관리자 페이지 접근 가능
- [ ] 이미지 업로드 테스트 성공

---

## 📚 자세한 내용

더 자세한 설정 및 사용 방법은 다음 문서를 참고하세요:
- 📖 `public/reference-poses/ADMIN_SETUP.md` - 상세 설정 가이드
- 📄 `IMPLEMENTATION_SUMMARY.md` - 전체 구현 내용

---

## 🆘 여전히 문제가 있나요?

### 디버깅 체크
1. 브라우저 개발자 도구 → Console 탭에서 에러 확인
2. Network 탭에서 실패한 요청 확인
3. Supabase Dashboard → Logs에서 에러 확인

### 일반적인 문제들
- **401 Unauthorized**: 로그인 필요
- **403 Forbidden (Storage)**: Storage 정책 누락
- **500 Internal Server Error**: 데이터베이스 테이블 누락

각 에러별 자세한 해결 방법은 `ADMIN_SETUP.md`의 트러블슈팅 섹션을 참고하세요.
