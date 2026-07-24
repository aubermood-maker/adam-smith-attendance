"use client";

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  Customer,
  EventItem,
  createEvent,
  initializeAttendanceStorage,
  saveCustomers,
  saveEvents,
  setActiveEventId,
} from "@/lib/attendance-storage";

type RowError = { row: number; name: string; phone: string; reason: string };
type ImportSummary = { registered: number; errors: RowError[] };

function normalizePhone(value: string) {
  return value.replace(/-/g, "").trim();
}

function formatPhone(value: string) {
  if (value.length !== 11) return value;
  return `${value.slice(0, 3)}-${value.slice(3, 7)}-${value.slice(7)}`;
}

export default function AdminPage() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [activeEventId, setCurrentActiveEventId] = useState("");
  const [newEventName, setNewEventName] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [manualCaution, setManualCaution] = useState(false);
  const [formMessage, setFormMessage] = useState("");
  const [editingPhone, setEditingPhone] = useState("");
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editCaution, setEditCaution] = useState(false);
  const [fileName, setFileName] = useState("");
  const [isReading, setIsReading] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const data = initializeAttendanceStorage();
    setEvents(data.events);
    setCustomers(data.customers);
    setSelectedEventId(data.activeEventId);
    setCurrentActiveEventId(data.activeEventId);
  }, []);

  const selectedEvent = events.find((event) => event.id === selectedEventId);
  const activeEvent = events.find((event) => event.id === activeEventId);
  const visibleCustomers = customers.filter(
    (customer) => customer.eventId === selectedEventId,
  );

  function persistCustomers(nextCustomers: Customer[]) {
    setCustomers(nextCustomers);
    saveCustomers(nextCustomers);
  }

  function handleCreateEvent(event: FormEvent) {
    event.preventDefault();
    const name = newEventName.trim();
    if (!name) return;
    if (events.some((item) => item.name === name)) {
      setFormMessage("이미 같은 이름의 행사가 있습니다.");
      return;
    }
    const created = createEvent(name);
    const nextEvents = [...events, created];
    setEvents(nextEvents);
    saveEvents(nextEvents);
    setSelectedEventId(created.id);
    setCurrentActiveEventId(created.id);
    setActiveEventId(created.id);
    setNewEventName("");
    setFormMessage(`‘${created.name}’ 행사를 만들고 현재 행사로 지정했습니다.`);
  }

  function activateSelectedEvent() {
    if (!selectedEvent) return;
    setCurrentActiveEventId(selectedEvent.id);
    setActiveEventId(selectedEvent.id);
    setFormMessage(`고객용 출석 화면을 ‘${selectedEvent.name}’ 행사로 변경했습니다.`);
  }

  function handleManualRegister(event: FormEvent) {
    event.preventDefault();
    setFormMessage("");
    const name = manualName.trim();
    const phone = normalizePhone(manualPhone);
    if (!selectedEventId) {
      setFormMessage("먼저 등록할 행사를 선택해주세요.");
      return;
    }
    if (!name) {
      setFormMessage("이름을 입력해주세요.");
      return;
    }
    if (!/^010\d{8}$/.test(phone)) {
      setFormMessage("전화번호는 010으로 시작하는 11자리 숫자여야 합니다.");
      return;
    }
    if (
      customers.some(
        (customer) =>
          customer.eventId === selectedEventId && customer.phone === phone,
      )
    ) {
      setFormMessage("현재 행사에 이미 등록된 전화번호입니다.");
      return;
    }
    persistCustomers([
      ...customers,
      { eventId: selectedEventId, name, phone, isCaution: manualCaution },
    ]);
    setManualName("");
    setManualPhone("");
    setManualCaution(false);
    setFormMessage(`‘${name}’ 고객을 ${selectedEvent?.name} 명단에 등록했습니다.`);
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !selectedEventId) return;
    setFileName(file.name);
    setSummary(null);
    setIsReading(true);

    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw new Error("엑셀 시트를 찾을 수 없습니다.");
      const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(
        workbook.Sheets[sheetName],
        { header: 1, raw: false, defval: "" },
      );
      const nextCustomers = [...customers];
      const phonesInFile = new Set<string>();
      const errors: RowError[] = [];
      let registered = 0;

      rows.slice(1).forEach((row, index) => {
        const excelRow = index + 2;
        const rawName = String(row[0] ?? "").trim();
        const rawPhone = String(row[1] ?? "").trim();
        const phone = normalizePhone(rawPhone);
        const isCaution = rawName.startsWith("*");
        const name = isCaution ? rawName.slice(1).trim() : rawName;

        if (!name) {
          errors.push({ row: excelRow, name: rawName || "-", phone: rawPhone || "-", reason: "이름이 비어 있습니다." });
          return;
        }
        if (!/^010\d{8}$/.test(phone)) {
          errors.push({ row: excelRow, name: rawName, phone: rawPhone || "-", reason: "유효한 휴대폰 번호가 아닙니다." });
          return;
        }
        if (phonesInFile.has(phone)) {
          errors.push({ row: excelRow, name: rawName, phone: rawPhone, reason: "파일 안에서 전화번호가 중복되었습니다." });
          return;
        }

        phonesInFile.add(phone);
        const existingIndex = nextCustomers.findIndex(
          (customer) =>
            customer.eventId === selectedEventId && customer.phone === phone,
        );
        const customer = { eventId: selectedEventId, name, phone, isCaution };
        if (existingIndex >= 0) nextCustomers[existingIndex] = customer;
        else nextCustomers.push(customer);
        registered += 1;
      });

      persistCustomers(nextCustomers);
      setSummary({ registered, errors });
    } catch (error) {
      setSummary({
        registered: 0,
        errors: [{
          row: 0,
          name: "-",
          phone: "-",
          reason: error instanceof Error ? error.message : "파일을 읽지 못했습니다.",
        }],
      });
    } finally {
      setIsReading(false);
      event.target.value = "";
    }
  }

  function startEdit(customer: Customer) {
    setEditingPhone(customer.phone);
    setEditName(customer.name);
    setEditPhone(customer.phone);
    setEditCaution(Boolean(customer.isCaution));
  }

  function saveEdit(originalPhone: string) {
    const name = editName.trim();
    const phone = normalizePhone(editPhone);
    if (!name || !/^010\d{8}$/.test(phone)) {
      setFormMessage("수정할 이름과 올바른 전화번호를 확인해주세요.");
      return;
    }
    if (
      customers.some(
        (customer) =>
          customer.eventId === selectedEventId &&
          customer.phone === phone &&
          customer.phone !== originalPhone,
      )
    ) {
      setFormMessage("현재 행사에 같은 전화번호가 이미 있습니다.");
      return;
    }
    persistCustomers(
      customers.map((customer) =>
        customer.eventId === selectedEventId &&
        customer.phone === originalPhone
          ? { ...customer, name, phone, isCaution: editCaution }
          : customer,
      ),
    );
    setEditingPhone("");
    setFormMessage("고객 정보를 수정했습니다.");
  }

  function deleteCustomer(customer: Customer) {
    if (!window.confirm(`${customer.name} 고객을 현재 행사 명단에서 삭제할까요?`)) return;
    persistCustomers(
      customers.filter(
        (item) =>
          !(item.eventId === customer.eventId && item.phone === customer.phone),
      ),
    );
    setFormMessage("고객을 명단에서 삭제했습니다.");
  }

  return (
    <main className="shell adminShell">
      <div className="brand">
        <div className="mark" aria-hidden="true">A</div>
        <span>ADAM SMITH</span><span className="brandDivider" /><span className="brandKo">관리자</span>
      </div>

      <section className="card adminCard adminWideCard">
        <a className="back adminBack" href="/" aria-label="출석 화면으로 돌아가기">←</a>
        <div className="eyebrow"><span /> EVENT & CUSTOMER ADMIN</div>
        <h1>행사와 고객 명단</h1>
        <p className="description adminDescription">행사를 선택하고 명단 등록부터 수정·삭제까지 관리하세요.</p>

        <section className="adminSection">
          <div className="sectionTitle"><span>01</span><div><strong>행사 선택</strong><small>현재 진행 행사: {activeEvent?.name || "없음"}</small></div></div>
          <div className="eventControls">
            <select value={selectedEventId} onChange={(e) => { setSelectedEventId(e.target.value); setSummary(null); }}>
              {events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
            </select>
            <button className="secondaryButton" onClick={activateSelectedEvent} disabled={selectedEventId === activeEventId}>
              {selectedEventId === activeEventId ? "현재 진행 중" : "현재 행사로 지정"}
            </button>
          </div>
          <form className="newEventForm" onSubmit={handleCreateEvent}>
            <input value={newEventName} onChange={(e) => setNewEventName(e.target.value)} placeholder="새 행사 이름" />
            <button type="submit">새 행사 추가</button>
          </form>
          {formMessage && <p className="adminMessage">{formMessage}</p>}
        </section>

        <div className="adminTwoColumns">
          <section className="adminSection compactSection">
            <div className="sectionTitle"><span>02</span><div><strong>고객 1명 등록</strong><small>{selectedEvent?.name} 명단에 바로 추가</small></div></div>
            <form className="manualForm" onSubmit={handleManualRegister}>
              <input value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="이름" />
              <input value={manualPhone} onChange={(e) => setManualPhone(e.target.value)} placeholder="010-0000-0000" inputMode="numeric" />
              <label><input type="checkbox" checked={manualCaution} onChange={(e) => setManualCaution(e.target.checked)} /> 주의 대상</label>
              <button type="submit">등록</button>
            </form>
          </section>

          <section className="adminSection compactSection">
            <div className="sectionTitle"><span>03</span><div><strong>엑셀 일괄 등록</strong><small>A열 이름 · B열 전화번호</small></div></div>
            <input ref={inputRef} className="fileInput" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handleFile} />
            <button className="uploadBox compactUpload" type="button" onClick={() => inputRef.current?.click()} disabled={isReading || !selectedEventId}>
              <span className="uploadIcon">⇧</span>
              <strong>{isReading ? "파일 읽는 중…" : "엑셀 파일 선택"}</strong>
              <small>{fileName || `${selectedEvent?.name || "행사"}에 등록`}</small>
            </button>
          </section>
        </div>

        {summary && (
          <div className="importResult">
            <div className="summaryGrid">
              <div><strong>{summary.registered}</strong><span>등록·갱신</span></div>
              <div className={summary.errors.length ? "hasErrors" : ""}><strong>{summary.errors.length}</strong><span>오류 행</span></div>
              <div><strong>{visibleCustomers.length}</strong><span>행사 명단</span></div>
            </div>
            {summary.errors.length > 0 && (
              <div className="errorRows">
                <div className="errorRowsHeader"><strong>등록되지 않은 행</strong><span>{summary.errors.length}건</span></div>
                <ul>{summary.errors.map((item, index) => (
                  <li key={`${item.row}-${index}`}><span>{item.row ? `${item.row}행` : "파일"}</span><div><strong>{item.name}</strong><small>{item.phone} · {item.reason}</small></div></li>
                ))}</ul>
              </div>
            )}
          </div>
        )}

        <section className="adminSection rosterSection">
          <div className="rosterHeader">
            <div className="sectionTitle"><span>04</span><div><strong>등록 명단</strong><small>{selectedEvent?.name} · {visibleCustomers.length}명</small></div></div>
          </div>
          <div className="rosterTableWrap">
            <table className="rosterTable">
              <thead><tr><th>이름</th><th>전화번호</th><th>구분</th><th>관리</th></tr></thead>
              <tbody>
                {visibleCustomers.length === 0 ? (
                  <tr><td colSpan={4} className="emptyCell">현재 행사에 등록된 고객이 없습니다.</td></tr>
                ) : visibleCustomers.map((customer) => {
                  const isEditing = editingPhone === customer.phone;
                  return (
                    <tr key={`${customer.eventId}-${customer.phone}`}>
                      <td>{isEditing ? <input value={editName} onChange={(e) => setEditName(e.target.value)} /> : <strong>{customer.name}</strong>}</td>
                      <td>{isEditing ? <input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} /> : formatPhone(customer.phone)}</td>
                      <td>{isEditing ? <label className="tableCheck"><input type="checkbox" checked={editCaution} onChange={(e) => setEditCaution(e.target.checked)} /> 주의</label> : customer.isCaution ? <span className="cautionBadge">주의</span> : <span className="normalLabel">일반</span>}</td>
                      <td className="rowActions">
                        {isEditing ? <>
                          <button onClick={() => saveEdit(customer.phone)}>저장</button>
                          <button className="mutedAction" onClick={() => setEditingPhone("")}>취소</button>
                        </> : <>
                          <button onClick={() => startEdit(customer)}>수정</button>
                          <button className="dangerAction" onClick={() => deleteCustomer(customer)}>삭제</button>
                        </>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <div className="adminFooterActions"><a className="primary adminPrimary" href="/">현재 행사 출석 화면 확인 <span>→</span></a></div>
      </section>
    </main>
  );
}
