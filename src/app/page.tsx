"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  Attendance,
  EventItem,
  Member,
  addAttendance,
  addMember,
  fetchAttendances,
  fetchEvents,
  findMembersByLastDigits,
  subscribeToAttendanceData,
} from "@/lib/attendance-api";
import { isSupabaseConfigured } from "@/lib/supabase";

type Step = "lookup" | "welcome" | "register" | "complete" | "records";

const digitsOnly = (value: string) => value.replace(/\D/g, "").slice(0, 11);
const formatPhone = (value: string) =>
  value.length === 11
    ? `${value.slice(0, 3)}-${value.slice(3, 7)}-${value.slice(7)}`
    : value;

function playCheckInSound(type: "dingdong" | "beep" | "warning") {
  try {
    const context = new AudioContext();
    const play = (frequency: number, delay: number, duration: number, wave: OscillatorType = "sine") => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime + delay;
      oscillator.type = wave;
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.22, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + duration);
    };
    if (type === "dingdong") {
      play(659.25, 0, 0.28);
      play(523.25, 0.22, 0.42);
    } else if (type === "warning") {
      play(440, 0, 0.14, "triangle");
      play(330, 0.16, 0.14, "triangle");
      play(440, 0.32, 0.24, "triangle");
    } else {
      play(220, 0, 0.22, "square");
    }
    window.setTimeout(() => void context.close(), 850);
  } catch {
    // 오디오를 지원하지 않아도 출석은 계속 진행됩니다.
  }
}

export default function Home() {
  const [step, setStep] = useState<Step>("lookup");
  const [event, setEvent] = useState<EventItem | null>(null);
  const [customer, setCustomer] = useState<Member | null>(null);
  const [records, setRecords] = useState<Attendance[]>([]);
  const [digits, setDigits] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [time, setTime] = useState("");
  const [loading, setLoading] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadActiveEvent = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setError("Supabase 환경변수가 설정되지 않았습니다.");
      setLoading(false);
      return;
    }
    try {
      const events = await fetchEvents();
      setEvent(events.find((item) => item.is_active) || null);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "행사 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadActiveEvent();
    if (!isSupabaseConfigured) return;
    return subscribeToAttendanceData(() => void loadActiveEvent());
  }, [loadActiveEvent]);

  useEffect(() => {
    if (!isSupabaseConfigured || step !== "records" || !event) return;
    return subscribeToAttendanceData(() => {
      void fetchAttendances(event.id).then(setRecords);
    });
  }, [event, step]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [step]);

  async function handleLookup(formEvent: FormEvent) {
    formEvent.preventDefault();
    if (!event || digits.length !== 4) return;
    setLoading(true);
    setError("");
    try {
      const found = await findMembersByLastDigits(event.id, digits);
      if (found.length === 1) {
        setCustomer(found[0]);
        setStep("welcome");
      } else if (found.length > 1) {
        setError("같은 번호를 사용하는 고객이 있어요. 안내 데스크에 문의해주세요.");
      } else {
        playCheckInSound("beep");
        setStep("register");
      }
    } catch (lookupError) {
      setError(lookupError instanceof Error ? lookupError.message : "고객 조회에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function completeAttendance(member: Member, isNewRegistration = false) {
    if (!event) return;
    setLoading(true);
    setError("");
    if (!isNewRegistration) {
      playCheckInSound(member.is_flagged ? "warning" : "dingdong");
    }
    try {
      const saved = await addAttendance({
        event_id: event.id,
        name: member.name,
        phone: member.phone,
        is_flagged: member.is_flagged,
        is_new_registration: isNewRegistration,
      });
      const checkedAt = saved?.checked_at ? new Date(saved.checked_at) : new Date();
      setCustomer(member);
      setTime(
        new Intl.DateTimeFormat("ko-KR", {
          hour: "numeric",
          minute: "2-digit",
        }).format(checkedAt),
      );
      setStep("complete");
    } catch (attendanceError) {
      setError(attendanceError instanceof Error ? attendanceError.message : "출석 저장에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(formEvent: FormEvent) {
    formEvent.preventDefault();
    if (!event) return;
    const normalized = digitsOnly(phone);
    if (name.trim().length < 2) return setError("성함을 두 글자 이상 입력해주세요.");
    if (!/^010\d{8}$/.test(normalized)) return setError("올바른 휴대폰 번호를 입력해주세요.");
    if (!consent) return setError("개인정보 수집 및 이용에 동의해주세요.");
    setLoading(true);
    try {
      const member = await addMember({
        event_id: event.id,
        name: name.trim(),
        phone: normalized,
        is_flagged: false,
      });
      await completeAttendance(member, true);
    } catch (registerError) {
      const message =
        typeof registerError === "object" &&
        registerError &&
        "code" in registerError &&
        registerError.code === "23505"
          ? "현재 행사에 이미 등록된 번호입니다."
          : registerError instanceof Error
            ? registerError.message
            : "고객 등록에 실패했습니다.";
      setError(message);
      setLoading(false);
    }
  }

  async function openRecords() {
    if (!event) return;
    setLoading(true);
    try {
      setRecords(await fetchAttendances(event.id));
      setStep("records");
    } catch (recordsError) {
      setError(recordsError instanceof Error ? recordsError.message : "출석 기록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setStep("lookup");
    setDigits("");
    setCustomer(null);
    setName("");
    setPhone("");
    setConsent(false);
    setError("");
    void loadActiveEvent();
  }

  return (
    <main className="shell">
      <div className="brand"><div className="mark">A</div><span>ADAM SMITH</span><span className="brandDivider" /><span className="brandKo">애덤스미스 출석</span></div>
      <section className="card" aria-live="polite">
        {step === "lookup" && <>
          <div className="eventPill"><span className="statusDot" /> {loading ? "행사 확인 중…" : event?.name || "진행 행사 없음"}</div>
          <div className="eyebrow"><span /> CHECK-IN</div>
          <h1>반갑습니다.<br />출석을 시작할게요.</h1>
          <p className="description">현재 행사 명단에 등록된<br />휴대폰 번호의 뒤 4자리를 입력해주세요.</p>
          <form onSubmit={handleLookup}>
            <label className="fieldLabel" htmlFor="digits">휴대폰 번호 뒤 4자리</label>
            <div className="digitField"><span>••• ••••</span><input ref={inputRef} id="digits" inputMode="numeric" maxLength={4} value={digits} onChange={(e) => setDigits(e.target.value.replace(/\D/g, ""))} placeholder="0000" /></div>
            {error && <p className="error">{error}</p>}
            <button className="primary" disabled={loading || !event || digits.length !== 4}>{loading ? "확인 중…" : "고객 조회하기"} <span>→</span></button>
          </form>
          <button className="recordsButton" onClick={openRecords} disabled={loading || !event}><span className="recordsIcon">☷</span><span><strong>현재 행사 출석 기록</strong><small>{event?.name || "행사를 먼저 지정해주세요"}</small></span><span className="recordsArrow">›</span></button>
          <a className="adminLink" href="/admin">관리자 행사·고객 명단 관리</a>
        </>}

        {step === "welcome" && customer && <div className="centered">
          <div className="eventPill centeredEventPill">{event?.name}</div><div className="personIcon">✓</div>
          <div className="eyebrow centeredEyebrow"><span /> MEMBER FOUND <span /></div>
          <h1>{customer.name} 님,{customer.is_flagged && <span className="cautionBadge welcomeBadge">주의 대상</span>}<br />어서 오세요.</h1>
          <p className="description">아래 버튼을 누르면<br />현재 행사 출석이 기록됩니다.</p>
          {error && <p className="error">{error}</p>}
          <button className="primary" onClick={() => void completeAttendance(customer)} disabled={loading}>{loading ? "저장 중…" : "참석하기"} <span>→</span></button>
          <button className="textButton" onClick={reset}>다른 번호로 조회</button>
        </div>}

        {step === "register" && <>
          <button className="back" onClick={reset}>←</button><div className="eventPill">{event?.name}</div>
          <div className="eyebrow"><span /> FIRST VISIT</div><h1>처음 오셨군요.<br />정보를 등록해주세요.</h1>
          <p className="description">현재 행사 등록과 동시에 출석이 완료됩니다.</p>
          <form className="registerForm" onSubmit={handleRegister}>
            <label className="fieldLabel">성함</label><input ref={inputRef} className="lineInput" value={name} onChange={(e) => setName(e.target.value)} placeholder="홍길동" />
            <label className="fieldLabel">휴대폰 번호</label><input className="lineInput" inputMode="numeric" value={formatPhone(phone)} onChange={(e) => setPhone(digitsOnly(e.target.value))} placeholder="010-0000-0000" />
            <label className="check"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /><span>개인정보 수집 및 이용에 동의합니다.</span></label>
            {error && <p className="error">{error}</p>}
            <button className="primary" disabled={loading}>{loading ? "등록 중…" : "등록하고 참석하기"} <span>→</span></button>
          </form>
        </>}

        {step === "complete" && customer && <div className="centered complete">
          <div className="eventPill centeredEventPill">{event?.name}</div><div className="successRing"><span>✓</span></div>
          <div className="eyebrow centeredEyebrow"><span /> CHECK-IN COMPLETE <span /></div><h1>출석이<br />완료되었습니다.</h1>
          <p className="description"><strong>{customer.name}</strong> 님, 오늘도 좋은 시간 보내세요.</p>
          <div className="receipt"><span>출석 시간</span><strong>{time}</strong></div><button className="primary" onClick={reset}>처음 화면으로</button>
        </div>}

        {step === "records" && <div className="recordsView">
          <button className="back" onClick={reset}>←</button><div className="eventPill">{event?.name}</div>
          <div className="eyebrow"><span /> EVENT ATTENDANCE</div><div className="recordsHeading"><div><h1>출석 기록</h1><p>실시간으로 동기화된 참석자입니다.</p></div><strong>{records.length}<small>명</small></strong></div>
          {records.length === 0 ? <div className="emptyRecords"><span>☷</span><strong>아직 출석 기록이 없어요.</strong></div> :
            <ul className="recordsList">{records.map((record, index) => {
              const checkedAt = new Date(record.checked_at);
              return <li key={record.id}><span className="recordNumber">{String(index + 1).padStart(2, "0")}</span><div className="recordPerson"><strong>{record.name}{record.is_flagged && <span className="cautionBadge">주의</span>}{record.is_new_registration && <span className="newBadge">신규</span>}</strong><span>{formatPhone(record.phone)}</span></div><div className="recordTime"><strong>{new Intl.DateTimeFormat("ko-KR", { hour: "numeric", minute: "2-digit" }).format(checkedAt)}</strong><span>{new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric" }).format(checkedAt)}</span></div></li>;
            })}</ul>}
          <button className="primary recordsHome" onClick={reset}>출석 화면으로 돌아가기</button>
        </div>}
      </section>
      <footer><span className="statusDot" /> Supabase로 여러 기기의 출석 정보를 동기화하고 있어요</footer>
    </main>
  );
}
