/** 스튜디오 템플릿에서 파싱된 배치 슬롯 */
export interface AlbumSlot {
  id: string;
  groupName: string;       // 부모 그룹명 (예: "## 앨범 10X10 - 26P")
  slotName: string;        // 슬롯 표시명 (예: "1-2", "액자 미니 5구")
  folderPath: string;      // ZIP 생성 시 사용할 상대 경로
  capacity: number;        // 최대 사진 수 (액자=1, 앨범 페이지=2~3)
  assignedPhotoIds: string[];
}

/** 사용자가 추가한 촬영 세션 (만삭, 베이비본 등) */
export interface AlbumSource {
  id: string;
  name: string;            // 사용자 지정 세션명
  orderIndex: number;      // 시간순 순서 (0=가장 이른 촬영)
  photos: AlbumPhoto[];
  folderName: string;      // 업로드된 폴더명 (자동 감지)
}

/** 촬영 세션 내 개별 사진 */
export interface AlbumPhoto {
  id: string;
  file: File;
  thumbnail: string;       // dataURL, 300px
  sharpness: number;       // 0~1, Laplacian 기반 선명도 점수
  sourceId: string;        // 어느 세션 소속인지
}
