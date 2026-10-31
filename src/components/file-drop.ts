"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";

function carriesFiles(types: readonly string[] | DOMStringList | undefined) {
  return Array.from(types || []).includes("Files");
}

// 자식 요소 위를 지날 때마다 dragleave가 발생해 강조가 깜빡이지 않도록 진입 깊이를 셉니다.
// 웹 페이지나 메신저에서 끌어온 이미지는 파일이 아니라 주소만 전달되므로 onEmpty로 안내합니다.
export function useFileDrop(onFiles: (files: File[]) => void, onEmpty?: () => void) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const bind = {
    onDragEnter: (event: DragEvent) => { event.preventDefault(); depth.current += 1; setDragging(true); },
    onDragOver: (event: DragEvent) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; },
    onDragLeave: () => { depth.current = Math.max(0, depth.current - 1); if (!depth.current) setDragging(false); },
    onDrop: (event: DragEvent) => {
      event.preventDefault(); depth.current = 0; setDragging(false);
      const files = Array.from(event.dataTransfer.files || []);
      if (files.length) onFiles(files); else onEmpty?.();
    },
  };
  return { dragging, bind };
}

// 드롭 영역을 조금만 벗어나 파일을 놓아도 브라우저가 파일을 열어 작성 중인 양식이 사라집니다.
// 양식 화면에서는 영역 밖 드롭을 막고 커서로 놓을 수 없는 곳임을 보여줍니다.
export function useBlockStrayFileDrop() {
  useEffect(() => {
    const block = (event: globalThis.DragEvent) => {
      if (!carriesFiles(event.dataTransfer?.types) || event.defaultPrevented) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "none";
    };
    window.addEventListener("dragover", block);
    window.addEventListener("drop", block);
    return () => { window.removeEventListener("dragover", block); window.removeEventListener("drop", block); };
  }, []);
}
