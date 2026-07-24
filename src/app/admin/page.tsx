"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";

type Customer = {
  name: string;
  phone: string;
  isCaution?: boolean;
};

type RowError = {
  row: number;
  name: string;
  phone: string;
  reason: string;
};

type ImportSummary = {
  registered: number;
  errors: RowError[];
};

export default function AdminPage() {
  const [fileName, setFileName] = useState("");
  const [isReading, setIsReading] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [customerCount, setCustomerCount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const customers = JSON.parse(
      localStorage.getItem("adam-customers") || "[]",
    ) as Customer[];
    setCustomerCount(customers.length);
  }, []);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setSummary(null);
    setIsReading(true);

    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        throw new Error("엑셀 시트를 찾을 수 없습니다.");
      }

      const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(
        workbook.Sheets[firstSheetName],
        {
          header: 1,
          raw: false,
          defval: "",
        },
      );

      const saved = JSON.parse(
        localStorage.getItem("adam-customers") || "[]",
      ) as Customer[];
      const customersByPhone = new Map(saved.map((item) => [item.phone, item]));
      const phonesInFile = new Set<string>();
      const errors: RowError[] = [];
      let registered = 0;

      rows.slice(1).forEach((row, index) => {
        const excelRow = index + 2;
        const rawName = String(row[0] ?? "").trim();
        const rawPhone = String(row[1] ?? "").trim();
        const normalizedPhone = rawPhone.replace(/-/g, "");
        const isCaution = rawName.startsWith("*");
        const cleanName = isCaution ? rawName.slice(1).trim() : rawName;

        if (!cleanName) {
          errors.push({
            row: excelRow,
            name: rawName || "-",
            phone: rawPhone || "-",
            reason: "이름이 비어 있습니다.",
          });
          return;
        }

        if (!/^010\d{8}$/.test(normalizedPhone)) {
          errors.push({
            row: excelRow,
            name: rawName,
            phone: rawPhone || "-",
            reason: "010으로 시작하는 11자리 숫자가 아닙니다.",
          });
          return;
        }

        if (phonesInFile.has(normalizedPhone)) {
          errors.push({
            row: excelRow,
            name: rawName,
            phone: rawPhone,
            reason: "파일 안에서 전화번호가 중복되었습니다.",
          });
          return;
        }

        phonesInFile.add(normalizedPhone);
        customersByPhone.set(normalizedPhone, {
          name: cleanName,
          phone: normalizedPhone,
          isCaution,
        });
        registered += 1;
      });

      const customers = [...customersByPhone.values()];
      localStorage.setItem("adam-customers", JSON.stringify(customers));
      setCustomerCount(customers.length);
      setSummary({ registered, errors });
    } catch (error) {
      setSummary({
        registered: 0,
        errors: [
          {
            row: 0,
            name: "-",
            phone: "-",
            reason:
              error instanceof Error
                ? error.message
                : "파일을 읽는 중 오류가 발생했습니다.",
          },
        ],
      });
    } finally {
      setIsReading(false);
      event.target.value = "";
    }
  }

  return (
    <main className="shell adminShell">
      <div className="brand">
        <div className="mark" aria-hidden="true">A</div>
        <span>ADAM SMITH</span>
        <span className="brandDivider" />
        <span className="brandKo">관리자</span>
      </div>

      <section className="card adminCard">
        <a className="back adminBack" href="/" aria-label="출석 화면으로 돌아가기">←</a>
        <div className="eyebrow"><span /> ADMIN · CUSTOMER LIST</div>
        <h1>고객 명단<br />엑셀 등록</h1>
        <p className="description adminDescription">
          첫 번째 열은 이름, 두 번째 열은 전화번호로 읽습니다.<br />
          첫 줄은 헤더로 간주하여 자동으로 제외합니다.
        </p>

        <div className="formatGuide">
          <div><span>A열</span><strong>이름</strong><small>*김민지 → 주의 대상</small></div>
          <div><span>B열</span><strong>전화번호</strong><small>01012345678</small></div>
        </div>

        <input
          ref={inputRef}
          className="fileInput"
          id="customer-file"
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={handleFile}
        />
        <button
          className="uploadBox"
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={isReading}
        >
          <span className="uploadIcon" aria-hidden="true">⇧</span>
          <strong>{isReading ? "엑셀 파일을 읽고 있어요…" : "엑셀 파일 선택"}</strong>
          <small>{fileName || ".xlsx 파일만 업로드할 수 있습니다."}</small>
        </button>

        {summary && (
          <div className="importResult" aria-live="polite">
            <div className="resultTitle">
              <div>
                <span>IMPORT RESULT</span>
                <strong>명단 등록 결과</strong>
              </div>
              <span className={summary.errors.length ? "resultState warning" : "resultState"}>
                {summary.errors.length ? "확인 필요" : "완료"}
              </span>
            </div>

            <div className="summaryGrid">
              <div><strong>{summary.registered}</strong><span>등록된 고객</span></div>
              <div className={summary.errors.length ? "hasErrors" : ""}>
                <strong>{summary.errors.length}</strong><span>오류 행</span>
              </div>
              <div><strong>{customerCount}</strong><span>전체 고객</span></div>
            </div>

            {summary.errors.length > 0 && (
              <div className="errorRows">
                <div className="errorRowsHeader">
                  <strong>등록되지 않은 행</strong>
                  <span>{summary.errors.length}건</span>
                </div>
                <ul>
                  {summary.errors.map((item, index) => (
                    <li key={`${item.row}-${index}`}>
                      <span>{item.row ? `${item.row}행` : "파일"}</span>
                      <div>
                        <strong>{item.name}</strong>
                        <small>{item.phone} · {item.reason}</small>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="adminFooterActions">
          <a className="primary adminPrimary" href="/">출석 화면에서 확인하기 <span>→</span></a>
          <p>등록된 명단은 휴대폰 번호 뒤 4자리 조회에 바로 연결됩니다.</p>
        </div>
      </section>
    </main>
  );
}
