"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  EventItem,
  Member,
  activateEvent,
  addMember,
  createEvent,
  deleteMember,
  fetchEvents,
  fetchMembers,
  subscribeToAttendanceData,
  updateMember,
  upsertMembers,
} from "@/lib/attendance-api";
import { isSupabaseConfigured } from "@/lib/supabase";

type RowError = { row: number; name: string; phone: string; reason: string };
type ImportSummary = { registered: number; errors: RowError[] };

const normalizePhone = (value: string) => value.replace(/-/g, "").trim();
const formatPhone = (value: string) =>
  value.length === 11
    ? `${value.slice(0, 3)}-${value.slice(3, 7)}-${value.slice(7)}`
    : value;

export default function AdminPage() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [newEventName, setNewEventName] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [manualCaution, setManualCaution] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState("");
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editCaution, setEditCaution] = useState(false);
  const [fileName, setFileName] = useState("");
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadEvents = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setMessage("Supabase 환경변수가 설정되지 않았습니다.");
      setLoading(false);
      return;
    }
    try {
      const loadedEvents = await fetchEvents();
      setEvents(loadedEvents);
      setSelectedEventId((current) => {
        if (loadedEvents.some((event) => event.id === current)) return current;
        return loadedEvents.find((event) => event.is_active)?.id || loadedEvents[0]?.id || "";
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "행사를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMembers = useCallback(async () => {
    if (!selectedEventId || !isSupabaseConfigured) {
      setMembers([]);
      return;
    }
    try {
      setMembers(await fetchMembers(selectedEventId));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "명단을 불러오지 못했습니다.");
    }
  }, [selectedEventId]);

  useEffect(() => {
    void loadEvents();
    if (!isSupabaseConfigured) return;
    return subscribeToAttendanceData(() => void loadEvents());
  }, [loadEvents]);

  useEffect(() => {
    void loadMembers();
    if (!isSupabaseConfigured || !selectedEventId) return;
    return subscribeToAttendanceData(() => void loadMembers());
  }, [loadMembers, selectedEventId]);

  const selectedEvent = events.find((event) => event.id === selectedEventId);
  const activeEvent = events.find((event) => event.is_active);

  async function runAction(action: () => Promise<void>) {
    setLoading(true);
    setMessage("");
    try {
      await action();
    } catch (error) {
      setMessage(
        typeof error === "object" && error && "message" in error
          ? String(error.message)
          : "요청을 처리하지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }

  function handleCreateEvent(formEvent: FormEvent) {
    formEvent.preventDefault();
    const name = newEventName.trim();
    if (!name) return;
    void runAction(async () => {
      const created = await createEvent(name);
      if (events.length === 0) await activateEvent(created.id);
      setNewEventName("");
      setSelectedEventId(created.id);
      setMessage(`‘${name}’ 행사를 추가했습니다.`);
      await loadEvents();
    });
  }

  function handleActivateEvent() {
    if (!selectedEventId) return;
    void runAction(async () => {
      await activateEvent(selectedEventId);
      await loadEvents();
      setMessage(`‘${selectedEvent?.name}’ 행사를 현재 행사로 지정했습니다.`);
    });
  }

  function handleManualRegister(formEvent: FormEvent) {
    formEvent.preventDefault();
    const phone = normalizePhone(manualPhone);
    if (!manualName.trim()) return setMessage("이름을 입력해주세요.");
    if (!/^010\d{8}$/.test(phone)) return setMessage("010으로 시작하는 11자리 전화번호를 입력해주세요.");
    void runAction(async () => {
      await addMember({
        event_id: selectedEventId,
        name: manualName.trim(),
        phone,
        is_flagged: manualCaution,
      });
      setManualName("");
      setManualPhone("");
      setManualCaution(false);
      await loadMembers();
      setMessage("고객을 현재 행사 명단에 등록했습니다.");
    });
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !selectedEventId) return;
    setFileName(file.name);
    setSummary(null);
    setLoading(true);
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw new Error("엑셀 시트를 찾을 수 없습니다.");
      const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(
        workbook.Sheets[sheetName],
        { header: 1, raw: false, defval: "" },
      );
      const validMembers: Array<Omit<Member, "id">> = [];
      const phones = new Set<string>();
      const errors: RowError[] = [];

      rows.slice(1).forEach((row, index) => {
        const rawName = String(row[0] ?? "").trim();
        const rawPhone = String(row[1] ?? "").trim();
        const phone = normalizePhone(rawPhone);
        const flagged = rawName.startsWith("*");
        const name = flagged ? rawName.slice(1).trim() : rawName;
        const rowNumber = index + 2;
        if (!name) errors.push({ row: rowNumber, name: "-", phone: rawPhone || "-", reason: "이름이 비어 있습니다." });
        else if (!/^010\d{8}$/.test(phone)) errors.push({ row: rowNumber, name, phone: rawPhone || "-", reason: "유효한 휴대폰 번호가 아닙니다." });
        else if (phones.has(phone)) errors.push({ row: rowNumber, name, phone: rawPhone, reason: "파일 안에서 번호가 중복되었습니다." });
        else {
          phones.add(phone);
          validMembers.push({ event_id: selectedEventId, name, phone, is_flagged: flagged });
        }
      });

      await upsertMembers(validMembers);
      await loadMembers();
      setSummary({ registered: validMembers.length, errors });
    } catch (error) {
      setSummary({
        registered: 0,
        errors: [{ row: 0, name: "-", phone: "-", reason: error instanceof Error ? error.message : "파일을 읽지 못했습니다." }],
      });
    } finally {
      setLoading(false);
      event.target.value = "";
    }
  }

  function startEdit(member: Member) {
    setEditingId(member.id);
    setEditName(member.name);
    setEditPhone(member.phone);
    setEditCaution(member.is_flagged);
  }

  function saveEdit() {
    const phone = normalizePhone(editPhone);
    if (!editName.trim() || !/^010\d{8}$/.test(phone)) {
      setMessage("수정할 이름과 전화번호를 확인해주세요.");
      return;
    }
    void runAction(async () => {
      await updateMember(editingId, {
        name: editName.trim(),
        phone,
        is_flagged: editCaution,
      });
      setEditingId("");
      await loadMembers();
      setMessage("고객 정보를 수정했습니다.");
    });
  }

  function handleDelete(member: Member) {
    if (!window.confirm(`${member.name} 고객을 삭제할까요?`)) return;
    void runAction(async () => {
      await deleteMember(member.id);
      await loadMembers();
      setMessage("고객을 삭제했습니다.");
    });
  }

  return (
    <main className="shell adminShell">
      <div className="brand"><div className="mark">A</div><span>ADAM SMITH</span><span className="brandDivider" /><span className="brandKo">관리자</span></div>
      <section className="card adminCard adminWideCard">
        <a className="back adminBack" href="/">←</a>
        <div className="eyebrow"><span /> SUPABASE EVENT ADMIN</div>
        <h1>행사와 고객 명단</h1>
        <p className="description adminDescription">모든 기기에 실시간으로 동기화되는 행사 명단입니다.</p>

        <section className="adminSection">
          <div className="sectionTitle"><span>01</span><div><strong>행사 선택</strong><small>현재 진행 행사: {activeEvent?.name || "없음"}</small></div></div>
          <div className="eventControls">
            <select value={selectedEventId} onChange={(e) => { setSelectedEventId(e.target.value); setSummary(null); }}>
              {events.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <button className="secondaryButton" disabled={loading || !selectedEventId || selectedEvent?.is_active} onClick={handleActivateEvent}>{selectedEvent?.is_active ? "현재 진행 중" : "현재 행사로 지정"}</button>
          </div>
          <form className="newEventForm" onSubmit={handleCreateEvent}><input value={newEventName} onChange={(e) => setNewEventName(e.target.value)} placeholder="새 행사 이름" /><button disabled={loading}>새 행사 추가</button></form>
          {message && <p className="adminMessage">{message}</p>}
        </section>

        <div className="adminTwoColumns">
          <section className="adminSection compactSection">
            <div className="sectionTitle"><span>02</span><div><strong>고객 1명 등록</strong><small>{selectedEvent?.name || "행사를 선택하세요"}</small></div></div>
            <form className="manualForm" onSubmit={handleManualRegister}>
              <input value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="이름" />
              <input value={manualPhone} onChange={(e) => setManualPhone(e.target.value)} placeholder="010-0000-0000" />
              <label><input type="checkbox" checked={manualCaution} onChange={(e) => setManualCaution(e.target.checked)} /> 주의 대상</label>
              <button disabled={loading || !selectedEventId}>등록</button>
            </form>
          </section>
          <section className="adminSection compactSection">
            <div className="sectionTitle"><span>03</span><div><strong>엑셀 일괄 등록</strong><small>A열 이름 · B열 전화번호</small></div></div>
            <input ref={inputRef} className="fileInput" type="file" accept=".xlsx" onChange={handleFile} />
            <button className="uploadBox compactUpload" onClick={() => inputRef.current?.click()} disabled={loading || !selectedEventId}><span className="uploadIcon">⇧</span><strong>{loading ? "처리 중…" : "엑셀 파일 선택"}</strong><small>{fileName || `${selectedEvent?.name || "행사"}에 등록`}</small></button>
          </section>
        </div>

        {summary && <div className="importResult">
          <div className="summaryGrid"><div><strong>{summary.registered}</strong><span>등록·갱신</span></div><div className={summary.errors.length ? "hasErrors" : ""}><strong>{summary.errors.length}</strong><span>오류 행</span></div><div><strong>{members.length}</strong><span>행사 명단</span></div></div>
          {summary.errors.length > 0 && <div className="errorRows"><div className="errorRowsHeader"><strong>등록되지 않은 행</strong><span>{summary.errors.length}건</span></div><ul>{summary.errors.map((item, index) => <li key={`${item.row}-${index}`}><span>{item.row ? `${item.row}행` : "파일"}</span><div><strong>{item.name}</strong><small>{item.phone} · {item.reason}</small></div></li>)}</ul></div>}
        </div>}

        <section className="adminSection rosterSection">
          <div className="rosterHeader"><div className="sectionTitle"><span>04</span><div><strong>등록 명단</strong><small>{selectedEvent?.name} · {members.length}명 · 실시간 동기화</small></div></div></div>
          <div className="rosterTableWrap"><table className="rosterTable"><thead><tr><th>이름</th><th>전화번호</th><th>구분</th><th>관리</th></tr></thead><tbody>
            {members.length === 0 ? <tr><td colSpan={4} className="emptyCell">등록된 고객이 없습니다.</td></tr> :
              members.map((member) => {
                const editing = editingId === member.id;
                return <tr key={member.id}>
                  <td>{editing ? <input value={editName} onChange={(e) => setEditName(e.target.value)} /> : <strong>{member.name}</strong>}</td>
                  <td>{editing ? <input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} /> : formatPhone(member.phone)}</td>
                  <td>{editing ? <label className="tableCheck"><input type="checkbox" checked={editCaution} onChange={(e) => setEditCaution(e.target.checked)} /> 주의</label> : member.is_flagged ? <span className="cautionBadge">주의</span> : <span className="normalLabel">일반</span>}</td>
                  <td className="rowActions">{editing ? <><button onClick={saveEdit}>저장</button><button className="mutedAction" onClick={() => setEditingId("")}>취소</button></> : <><button onClick={() => startEdit(member)}>수정</button><button className="dangerAction" onClick={() => handleDelete(member)}>삭제</button></>}</td>
                </tr>;
              })}
          </tbody></table></div>
        </section>
        <div className="adminFooterActions"><a className="primary adminPrimary" href="/">현재 행사 출석 화면 확인 <span>→</span></a></div>
      </section>
    </main>
  );
}
