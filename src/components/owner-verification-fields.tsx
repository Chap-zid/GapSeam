"use client";

import type { ReactNode } from "react";
import { FileText, IdCard, X } from "lucide-react";
import { useFileDrop } from "./file-drop";
import { MAX_ID_FILES, MAX_PROOF_FILES, PROOF_FILE_TYPES } from "@/lib/services";

const MAX_FILE_SIZE = 15 * 1024 * 1024;

function ProofBox({ icon, name, title, hint, files, max, onChange, onError }: { icon: ReactNode; name: string; title: string; hint: string; files: File[]; max: number; onChange: (files: File[]) => void; onError: (message: string) => void }) {
  const accept = (incoming: File[]) => {
    const valid = incoming.filter((file) => PROOF_FILE_TYPES.includes(file.type) && file.size <= MAX_FILE_SIZE);
    onChange([...files, ...valid].slice(0, max));
    if (valid.length !== incoming.length) onError("PDF, JPG, PNG, WebP 파일만 장당 15MB 이하로 첨부할 수 있습니다.");
    else if (files.length + valid.length > max) onError(`${name} 파일은 최대 ${max}개까지 첨부할 수 있습니다.`);
    else onError("");
  };
  const { dragging, bind } = useFileDrop(accept, () => onError("웹 페이지나 메신저에서 끌어온 파일은 바로 올릴 수 없습니다. 기기에 저장한 뒤 다시 끌어다 놓아주세요."));
  return <div className="proof-box">
    <label className={`proof-upload${dragging ? " is-dragging" : ""}`} {...bind}>
      <input type="file" multiple accept={PROOF_FILE_TYPES.join(",")} onChange={(event) => { accept(Array.from(event.target.files || [])); event.target.value = ""; }}/>
      {icon}<span><b>{files.length ? `${name} ${files.length}개 첨부됨` : title}</b><small>{hint}</small></span>
    </label>
    {files.length > 0 && <ul className="proof-files">{files.map((file, index) => <li key={`${file.name}-${file.lastModified}-${index}`}><span>{file.name}</span><button type="button" aria-label={`${file.name} 삭제`} onClick={() => onChange(files.filter((_, current) => current !== index))}><X size={14}/></button></li>)}</ul>}
  </div>;
}

// 운영자가 신분증의 이름, 소유 서류의 소유자 이름, 서류 소재지를 서로 대조할 수 있도록 두 종류의 자료를 따로 받습니다.
export function OwnerVerificationFields({ legalName, onLegalName, idFiles, onIdFiles, proofFiles, onProofFiles, onError }: { legalName: string; onLegalName: (value: string) => void; idFiles: File[]; onIdFiles: (files: File[]) => void; proofFiles: File[]; onProofFiles: (files: File[]) => void; onError: (message: string) => void }) {
  return <>
    <div className="field" style={{ marginTop: 16 }}><label>신분증과 서류에 적힌 소유자 이름</label><input value={legalName} onChange={(event) => onLegalName(event.target.value)} maxLength={100} placeholder="신분증 표기와 동일하게 입력"/></div>
    <div className="proof-grid">
      <ProofBox icon={<IdCard size={20}/>} name="신분증" title="신분증 사본 첨부" hint={`주민등록증·운전면허증 · 이름이 보이게, 주민등록번호 뒷자리는 가려주세요 · 최대 ${MAX_ID_FILES}개`} files={idFiles} max={MAX_ID_FILES} onChange={onIdFiles} onError={onError}/>
      <ProofBox icon={<FileText size={20}/>} name="소유 증빙 서류" title="소유 증빙 서류 첨부" hint={`등기사항증명서·토지대장·건축물대장 · 최대 ${MAX_PROOF_FILES}개`} files={proofFiles} max={MAX_PROOF_FILES} onChange={onProofFiles} onError={onError}/>
    </div>
    <ol className="proof-steps"><li>신분증 이름이 입력한 이름과 같은지</li><li>서류상 소유자 이름이 신분증 이름과 같은지</li><li>서류 소재지가 등록한 공간 주소와 같은지</li></ol>
  </>;
}
