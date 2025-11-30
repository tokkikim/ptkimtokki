import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const imageFile = formData.get('image') as File;
    
    if (!imageFile) {
      return NextResponse.json(
        { error: '이미지 파일이 없습니다.' },
        { status: 400 }
      );
    }

    // 이미지를 Base64로 변환하여 반환
    // 실제 프로덕션에서는 클라우드 스토리지(S3, Cloudinary 등)에 업로드해야 합니다
    const arrayBuffer = await imageFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString('base64');
    const dataUrl = `data:${imageFile.type};base64,${base64}`;
    
    // 임시로 Data URL을 반환 (실제로는 업로드된 이미지의 공개 URL을 반환해야 함)
    return NextResponse.json({
      imageUrl: dataUrl,
      // 실제 프로덕션에서는 다음과 같이 반환:
      // imageUrl: `https://your-cdn.com/images/${uploadedImageId}.png`
    });
  } catch (error) {
    console.error('이미지 업로드 오류:', error);
    return NextResponse.json(
      { error: '이미지 업로드에 실패했습니다.' },
      { status: 500 }
    );
  }
}

