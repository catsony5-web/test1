// Keep this versioned local URL in service-worker.js for offline import/export.
const EXCEL_LIBRARY_URL = "./assets/vendor/xlsx.full.min.js?v=182-maintenance";
let excelLibraryPromise = null;

function loadExcelLibrary() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (excelLibraryPromise) return excelLibraryPromise;

  excelLibraryPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = EXCEL_LIBRARY_URL;
    script.async = true;
    const timeout = setTimeout(() => finish(new Error("엑셀 기능 로딩 시간이 초과되었습니다.")), 30000);
    function finish(error) {
      clearTimeout(timeout);
      script.onload = null;
      script.onerror = null;
      if (error) {
        script.remove();
        reject(error);
      } else {
        resolve(window.XLSX);
      }
    }
    script.onload = () => finish(window.XLSX ? null : new Error("엑셀 기능을 초기화하지 못했습니다."));
    script.onerror = () => finish(new Error("엑셀 기능을 불러오지 못했습니다."));
    document.head.appendChild(script);
  }).catch((error) => {
    excelLibraryPromise = null;
    throw error;
  });
  return excelLibraryPromise;
}
