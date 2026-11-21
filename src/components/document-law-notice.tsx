import { DOCUMENT_LAW_URL } from "@/lib/document-law";

export function DocumentLawNotice() {
  return <p className="agent-disclaimer">
    AI 검토 참고자료: <a href={DOCUMENT_LAW_URL} target="_blank" rel="noopener noreferrer">빈집 및 소규모주택 정비에 관한 특례법</a> (2026. 7. 1. 시행본 일부 요약).
    개정 내용은 자동 반영되지 않으며 적용 여부와 최신 법령은 관할 지자체에 확인해야 합니다. AI 미사용 시 기본 점검은 이 법령을 검토하지 않습니다.
  </p>;
}
